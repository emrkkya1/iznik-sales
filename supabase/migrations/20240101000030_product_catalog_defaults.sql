-- Global product catalog defaults. Defaults are copied into a branch when it
-- is created; later catalog price changes never rewrite branch price history.

ALTER TABLE public.products
  ADD COLUMN default_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN archived_at TIMESTAMPTZ;

WITH current_prices AS (
  SELECT
    bp.product_id,
    bpp.price,
    COUNT(*) AS branch_count,
    ROW_NUMBER() OVER (
      PARTITION BY bp.product_id
      ORDER BY COUNT(*) DESC, bpp.price ASC
    ) AS rank
  FROM public.branch_products bp
  JOIN public.branch_product_prices bpp
    ON bpp.branch_product_id = bp.id
   AND bpp.start_date <= CURRENT_DATE
   AND (bpp.end_date IS NULL OR bpp.end_date >= CURRENT_DATE)
  GROUP BY bp.product_id, bpp.price
)
UPDATE public.products product
SET default_price = current_prices.price
FROM current_prices
WHERE current_prices.product_id = product.id
  AND current_prices.rank = 1;

ALTER TABLE public.products
  ADD CONSTRAINT products_default_price_non_negative CHECK (default_price >= 0);

CREATE INDEX idx_products_catalog_available
  ON public.products(name)
  WHERE archived_at IS NULL AND is_active = TRUE;

CREATE OR REPLACE FUNCTION public.list_catalog_products(p_include_archived BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', product.id::TEXT,
      'name', product.name,
      'imageUrl', product.image_url,
      'defaultPrice', product.default_price,
      'isArchived', product.archived_at IS NOT NULL
    ) ORDER BY product.archived_at NULLS FIRST, lower(product.name), product.id)
    FROM public.products product
    WHERE product.is_active = TRUE
      AND (p_include_archived OR product.archived_at IS NULL)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_catalog_product(
  p_name TEXT,
  p_default_price NUMERIC(12,2),
  p_image_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF nullif(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'Name cannot be empty'; END IF;
  IF p_default_price IS NULL OR p_default_price < 0 THEN RAISE EXCEPTION 'Default price cannot be negative'; END IF;

  INSERT INTO public.products (name, image_url, default_price, is_active)
  VALUES (trim(p_name), nullif(trim(p_image_url), ''), p_default_price, TRUE)
  RETURNING id INTO v_id;

  PERFORM public.log_audit('INSERT', 'products', v_id, NULL);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_catalog_product_default_price(
  p_product_id UUID,
  p_default_price NUMERIC(12,2)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_default_price IS NULL OR p_default_price < 0 THEN RAISE EXCEPTION 'Default price cannot be negative'; END IF;
  SELECT to_jsonb(product) INTO v_old FROM public.products product WHERE product.id = p_product_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;

  UPDATE public.products SET default_price = p_default_price, updated_at = NOW() WHERE id = p_product_id;
  PERFORM public.log_audit('UPDATE', 'products', p_product_id, v_old);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_catalog_product_archived(
  p_product_id UUID,
  p_archived BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT to_jsonb(product) INTO v_old FROM public.products product WHERE product.id = p_product_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;

  UPDATE public.products
  SET archived_at = CASE WHEN p_archived THEN NOW() ELSE NULL END, updated_at = NOW()
  WHERE id = p_product_id;
  PERFORM public.log_audit('UPDATE', 'products', p_product_id, v_old);
END;
$$;

-- Existing branch assignments remain visible after a catalog item is archived.
CREATE OR REPLACE FUNCTION public.list_branch_products_with_status(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'branch_id is required'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY row_data->>'productName')
    FROM (
      SELECT jsonb_build_object(
        'productId', p.id,
        'productName', p.name,
        'productImageUrl', p.image_url,
        'isActive', p.is_active,
        'isArchived', p.archived_at IS NOT NULL,
        'branchProductId', bp.id,
        'isActivatedForBranch', bp.id IS NOT NULL AND bp.is_active = TRUE,
        'currentPrice', (
          SELECT price FROM branch_product_prices
          WHERE branch_product_id = bp.id
            AND start_date <= CURRENT_DATE
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
          ORDER BY start_date DESC
          LIMIT 1
        )
      ) AS row_data
      FROM products p
      LEFT JOIN branch_products bp ON bp.product_id = p.id AND bp.branch_id = p_branch_id
      WHERE p.is_active = TRUE
        AND (p.archived_at IS NULL OR bp.id IS NOT NULL)
    ) sub
  ), '[]'::jsonb);
END;
$$;

DROP FUNCTION public.create_branch(UUID, TEXT, NUMERIC, BOOLEAN);

CREATE FUNCTION public.create_branch(
  p_district_id UUID,
  p_name TEXT,
  p_opening_balance NUMERIC(12,2),
  p_is_active BOOLEAN,
  p_products JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_locked BOOLEAN;
  v_products JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_district_id IS NULL THEN RAISE EXCEPTION 'district_id is required'; END IF;
  IF nullif(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'Name cannot be empty'; END IF;
  IF p_opening_balance IS NULL OR p_opening_balance < 0 THEN RAISE EXCEPTION 'Opening balance cannot be negative'; END IF;
  IF p_products IS NOT NULL AND jsonb_typeof(p_products) <> 'array' THEN RAISE EXCEPTION 'products must be an array'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.districts WHERE id = p_district_id) THEN RAISE EXCEPTION 'District not found'; END IF;

  SELECT opening_balances_locked INTO v_locked FROM public.app_config WHERE id = '00000000-0000-0000-0000-000000000001'::UUID;
  IF v_locked AND p_opening_balance <> 0 THEN RAISE EXCEPTION 'Opening balances are locked; new branches must start at 0'; END IF;

  v_products := COALESCE(
    p_products,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('productId', id, 'price', default_price)), '[]'::jsonb)
     FROM public.products WHERE is_active = TRUE AND archived_at IS NULL)
  );
  IF jsonb_array_length(v_products) = 0 THEN RAISE EXCEPTION 'At least one product is required'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_products) AS item("productId" UUID, price NUMERIC)
    GROUP BY "productId" HAVING COUNT(*) > 1
  ) THEN RAISE EXCEPTION 'Duplicate product selection'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_products) AS item("productId" UUID, price NUMERIC)
    LEFT JOIN public.products product ON product.id = item."productId"
    WHERE item."productId" IS NULL OR item.price IS NULL OR item.price < 0
       OR product.id IS NULL OR product.is_active IS FALSE OR product.archived_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Invalid product selection'; END IF;

  INSERT INTO public.branches (district_id, name, current_balance, opening_balance, is_active)
  VALUES (p_district_id, trim(p_name), p_opening_balance, p_opening_balance, p_is_active)
  RETURNING id INTO v_id;

  WITH selected AS (
    SELECT "productId" AS product_id, price
    FROM jsonb_to_recordset(v_products) AS item("productId" UUID, price NUMERIC)
  ), created AS (
    INSERT INTO public.branch_products (branch_id, product_id, is_active)
    SELECT v_id, product_id, TRUE FROM selected
    RETURNING id, product_id
  )
  INSERT INTO public.branch_product_prices (branch_product_id, price, start_date)
  SELECT created.id, selected.price, CURRENT_DATE
  FROM created JOIN selected ON selected.product_id = created.product_id;

  PERFORM public.log_audit('INSERT', 'branches', v_id, NULL);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_catalog_products(BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_catalog_product(TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_catalog_product_default_price(UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_catalog_product_archived(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_branch(UUID, TEXT, NUMERIC, BOOLEAN, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_catalog_products(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_product(TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_product_default_price(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_product_archived(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_branch(UUID, TEXT, NUMERIC, BOOLEAN, JSONB) TO authenticated;
