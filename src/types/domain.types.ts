// Domain types (separate from database types for abstraction)
// These types represent the business domain, not the database schema

export type UserRole = 'admin' | 'staff';
export type PaymentType = 'field_collection' | 'bank_transfer';
export type OperationType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface User {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
  isActive: boolean;
}

export interface City {
  id: string;
  name: string;
}

export interface District {
  id: string;
  cityId: string;
  name: string;
}

export interface Branch {
  id: string;
  districtId: string;
  name: string;
  currentBalance?: number;
  openingBalance?: number;
  isActive: boolean;
}

export interface BranchLocation extends Branch {
  cityId: string | null;
}

export interface Product {
  id: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
}

export interface CatalogProduct extends Product {
  defaultPrice: number;
  isArchived: boolean;
}

export interface BranchProductSelection {
  productId: string;
  price: number;
}

export interface BranchProduct {
  id: string;
  branchId: string;
  productId: string;
  isActive: boolean;
}

export interface BranchProductPrice {
  id: string;
  branchProductId: string;
  price: number;
  startDate: string;
  endDate: string | null;
}

export interface Delivery {
  id: string;
  branchId: string;
  userId: string;
  totalSalesAmount: number;
  date: string;
  idempotencyKey: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  deletionReason: string | null;
  createdAt: string;
}

export interface DeliveryItem {
  id: string;
  deliveryId: string;
  productId: string;
  deliveredQuantity: number;
  returnedQuantity: number;
  netQuantity: number;
  unitPrice: number;
}

export interface Payment {
  id: string;
  branchId: string;
  userId: string;
  deliveryId: string | null;
  amount: number;
  paymentType: PaymentType;
  date: string;
  deletedAt: string | null;
  deletedBy: string | null;
  deletionReason: string | null;
}

export interface AuditLog {
  id: string;
  operationType: OperationType;
  tableName: string;
  recordId: string;
  userId: string;
  oldData: Record<string, unknown> | null;
  deletionReason: string | null;
  createdAt: string;
}

// Input types for RPCs
export interface CreateDeliveryInput {
  branchId: string;
  items: {
    productId: string;
    deliveredQuantity: number;
    returnedQuantity: number;
  }[];
  paymentAmount: number;
  paymentType: PaymentType;
  date: string;
}

export interface UpdateDeliveryInput {
  deliveryId: string;
  items: {
    productId: string;
    deliveredQuantity: number;
    returnedQuantity: number;
  }[];
  date: string;
}

export interface ManualPaymentInput {
  branchId: string;
  amount: number;
  paymentType: PaymentType;
  date: string;
}

// Receipt summary for UI
export interface ReceiptSummary {
  deliveryId: string;
  branchId: string;
  branchName: string;
  date: string;
  items: {
    productName: string;
    deliveredQuantity: number;
    returnedQuantity: number;
    netQuantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  totalSalesAmount: number;
  paymentAmount: number;
  previousBalance: number;
  newBalance: number;
}

// Branch product with effective price and product details for entry screen
export interface BranchProductWithPrice {
  id: string;
  branchId: string;
  productId: string;
  isActive: boolean;
  productName: string;
  productImageUrl: string | null;
  currentPrice: number;
}

// Delivery with expanded relationships for detail/history views
export interface DeliveryWithItems extends Delivery {
  items: DeliveryItemWithProduct[];
  payments: Payment[];
  branchName: string;
}

export interface DeliveryWithBranch extends Delivery {
  branchName: string;
}

export interface DeliveryItemWithProduct extends DeliveryItem {
  productName: string;
}

// ============================================
// Phase 6: Admin Master Data And Balance Operations
// ============================================

// Summary screen range selector
export type SummaryRange = 'week' | 'month' | 'all';

// Özet KPIs — extended in M18 with delivered / returned / return rate
export interface SummaryKpis {
  totalSales: number;
  totalCollection: number;
  deliveredQty: number;
  returnedQty: number;
  /** Percent 0-100; `null` when no deliveries in the range. */
  returnRate: number | null;
  activeBranchCount: number;
  activeProductCount: number;
}

// Distribution pie chart rows (server returns ranked raw rows; UI merges via util)
export interface DistributionRow {
  id: string;
  label: string;
  value: number;
  isMerged?: boolean;
}

// Daily earnings chart series
export interface DailySeriesPoint {
  // Always YYYY-MM-DD; client-side formatter derives display label from granularity.
  bucket: string;
  sales: number;
}

export interface DailySeriesResult {
  granularity: 'day' | 'week' | 'month';
  points: DailySeriesPoint[];
}

// Geography list types (with counts)
export interface CityWithCounts extends City {
  districtCount: number;
  branchCount: number;
  isActive: boolean;
}

export interface DistrictWithCounts extends District {
  branchCount: number;
  activeBranchCount: number;
  isActive: boolean;
}

export interface BranchWithContext extends Branch {
  currentBalance: number;
  activeProductCount: number;
  isActive: boolean;
}

// Branch Hub summary card details (returned by get_branch_hub_details)
// Note: `branchCreatedAt` is `branches.created_at`. Today it is also the date
// the opening balance took effect (create_branch sets opening_balance only at
// row creation). If opening_balance ever becomes editable post-creation, this
// field's name will no longer reflect its semantic; rename then.
export interface BranchHubDetails {
  name: string;
  districtName: string;
  cityName: string;
  openingBalance: number;
  branchCreatedAt: string;
  isActive: boolean;
  activeProductCount: number;
  totalProductCount: number;
  lastMovementDate: string | null;
  auditCount: number;
  /** All-time delivered qty (across all deliveries on this branch). */
  deliveredQty: number;
  /** All-time returned qty. */
  returnedQty: number;
  /** Percent 0-100; `null` when no deliveries ever recorded. */
  returnRate: number | null;
}

// Inputs for geography create mutations
export interface CreateCityInput {
  name: string;
}

export interface CreateDistrictInput {
  cityId: string;
  name: string;
}

export interface CreateBranchInput {
  districtId: string;
  name: string;
  openingBalance: number;
  isActive: boolean;
  products: BranchProductSelection[];
}

// Branch movement entry (from list_deliveries_with_payments RPC)
//
// Each row is either a delivery with its first active payment embedded
// (or null if none), or a standalone manual payment (delivery_id IS NULL).
// Sort order is (date DESC, created_at DESC) and pagination is global,
// applied after the union — so a delivery and its linked payment count
// as one row, and manual payments remain visible as separate rows.

// Embedded payment fields returned alongside a delivery row.
export interface PaymentEmbed {
  id: string;
  amount: number;
  paymentType: string | null;
  createdAt: string;
}

// A delivery with its first active payment embedded.
export interface DeliveryWithPayment {
  kind: 'delivery';
  id: string;
  date: string;
  amount: number;
  isDeleted: boolean;
  createdAt: string;
  payment: PaymentEmbed | null;
}

// A standalone payment (delivery_id IS NULL) — bank_transfer /
// field_collection recorded directly against the branch.
export interface ManualPayment {
  kind: 'payment';
  id: string;
  date: string;
  amount: number;
  isDeleted: boolean;
  createdAt: string;
  paymentType: string | null;
}

// What the MovementsTab iterates over and the sheet accepts.
export type MovementRow = DeliveryWithPayment | ManualPayment;

// Branch product with per-branch activation status (from
// list_branch_products_with_status RPC). Used by the Ürünler & Fiyatlar tab
// to render both active (with price) and inactive ("+ Aktifleştir") items.
export interface BranchProductWithStatus {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  isActive: boolean;
  branchProductId: string | null;
  isActivatedForBranch: boolean;
  currentPrice: number | null;
  isArchived?: boolean;
}

// Inputs for branch product mutations (PR-6.2)
export interface SetBranchProductPriceInput {
  branchProductId: string;
  price: number;
  effectiveFrom: string;
}
export interface SetBranchProductActiveInput {
  branchProductId: string;
  isActive: boolean;
}
export interface ActivateBranchProductInput {
  branchId: string;
  productId: string;
  price: number;
  effectiveFrom: string;
}

// ============================================
// M18: Branches analytics table (Şubeler tab)
// ============================================

/** Day values sent to list_branches_analytics. 0=Sun..6=Sat (matches JS Date.getDay). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BranchAnalyticsStatus = 'all' | 'active' | 'inactive';

export type BranchAnalyticsSortBy =
  | 'name'
  | 'balance'
  | 'return_rate'
  | 'last_activity'
  | 'location';

export type BranchAnalyticsSortDir = 'asc' | 'desc';

export interface BranchAnalyticsFilters {
  search?: string;
  status?: BranchAnalyticsStatus;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  daysOfWeek?: DayOfWeek[];
  cityId?: string;
  districtId?: string;
  sortBy?: BranchAnalyticsSortBy;
  sortDir?: BranchAnalyticsSortDir;
}

export interface BranchAnalyticsRow {
  branchId: string;
  name: string;
  cityName: string;
  districtName: string;
  /** Always as-of today. */
  currentBalance: number;
  /** Computed over the filtered date range + day-of-week mask. */
  deliveredQty: number;
  returnedQty: number;
  /** Percent 0-100; `null` when deliveredQty is 0. */
  returnRate: number | null;
  /** Latest transaction in the selected metric range; null when none matches. */
  lastActivityDate: string | null;
  isActive: boolean;
}

export interface BranchAnalyticsPage {
  rows: BranchAnalyticsRow[];
  totalCount: number;
}
