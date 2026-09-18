-- Seed: Initial Prices
-- Same prices for all branches initially

INSERT INTO branch_product_prices (branch_product_id, price, start_date)
SELECT bp.id,
  CASE p.name
    WHEN 'Büyük Ekmek' THEN 85
    WHEN 'Sarı Buğday Ekmeği' THEN 85
    WHEN 'Tava Köy Ekmeği' THEN 85
    WHEN 'Küçük Ekmek' THEN 60
    WHEN 'Çavdar' THEN 60
    WHEN 'Tam Buğday' THEN 60
    WHEN 'Tam Tahıllı' THEN 60
    WHEN 'Oba' THEN 60
    WHEN 'Zeytinli' THEN 60
    WHEN 'Siyez' THEN 125
    WHEN 'Karakılçık' THEN 125
    WHEN 'Cevizli Ekmek' THEN 125
    WHEN 'Cevizli Lokum' THEN 125
    WHEN 'Karabuğday' THEN 150
    WHEN 'Mısır Ekmeği' THEN 85
    WHEN 'Köylü Güzeli' THEN 85
    ELSE 0  -- fallback (should never happen)
  END,
  CURRENT_DATE
FROM branch_products bp
JOIN products p ON bp.product_id = p.id;

UPDATE products
SET default_price = CASE name
  WHEN 'Büyük Ekmek' THEN 85
  WHEN 'Sarı Buğday Ekmeği' THEN 85
  WHEN 'Tava Köy Ekmeği' THEN 85
  WHEN 'Küçük Ekmek' THEN 60
  WHEN 'Çavdar' THEN 60
  WHEN 'Tam Buğday' THEN 60
  WHEN 'Tam Tahıllı' THEN 60
  WHEN 'Oba' THEN 60
  WHEN 'Zeytinli' THEN 60
  WHEN 'Siyez' THEN 125
  WHEN 'Karakılçık' THEN 125
  WHEN 'Cevizli Ekmek' THEN 125
  WHEN 'Cevizli Lokum' THEN 125
  WHEN 'Karabuğday' THEN 150
  WHEN 'Mısır Ekmeği' THEN 85
  WHEN 'Köylü Güzeli' THEN 85
  ELSE 0
END;
