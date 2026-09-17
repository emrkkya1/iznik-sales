import type {
  ActivateBranchProductInput,
  AuthSession,
  Branch,
  BranchAnalyticsFilters,
  BranchAnalyticsPage,
  BranchHubDetails,
  BranchLocation,
  BranchProductWithPrice,
  BranchProductWithStatus,
  BranchWithContext,
  City,
  CityWithCounts,
  CreateBranchInput,
  CreateCityInput,
  CreateDeliveryInput,
  CreateDistrictInput,
  DailySeriesResult,
  DeliveryWithBranch,
  DeliveryWithItems,
  District,
  DistrictWithCounts,
  DistributionRow,
  ManualPaymentInput,
  MovementRow,
  Payment,
  Product,
  ReceiptSummary,
  SetBranchProductActiveInput,
  SetBranchProductPriceInput,
  SummaryKpis,
  SummaryRange,
  UpdateDeliveryInput,
  User,
} from '@/types';
import type { SummaryPdfSnapshot } from './supabase/summaryPdfSchema';
import type { BranchReportSnapshot } from './supabase/branchesReportSchema';
import type { BranchHubReport } from './supabase/branchHubReportSchema';

export interface AuthRepository {
  getSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  onAuthStateChange(callback: (session: AuthSession | null) => void): () => void;
}

export interface SessionRepository {
  getCurrentUser(): Promise<User | null>;
}

export interface LocationRepository {
  listCities(): Promise<City[]>;
  listDistricts(cityId: string): Promise<District[]>;
  listBranches(districtId?: string): Promise<Branch[]>;
  getBranch(branchId: string): Promise<BranchLocation | null>;
}

export interface ProductRepository {
  listProducts(): Promise<Product[]>;
  listBranchProducts(
    branchId: string,
    date: string,
  ): Promise<BranchProductWithPrice[]>;
  // PR-6.2: Branch Hub Ürünler & Fiyatlar tab
  listBranchProductsWithStatus(branchId: string): Promise<BranchProductWithStatus[]>;
  setBranchProductPrice(input: SetBranchProductPriceInput): Promise<void>;
  setBranchProductActive(input: SetBranchProductActiveInput): Promise<void>;
  activateBranchProduct(input: ActivateBranchProductInput): Promise<string>;
}

export interface DeliveryRepository {
  listMyDeliveries(): Promise<DeliveryWithBranch[]>;
  getDelivery(id: string): Promise<DeliveryWithItems | null>;
  createDelivery(
    input: CreateDeliveryInput,
    idempotencyKey: string,
  ): Promise<ReceiptSummary>;
  updateDelivery(input: UpdateDeliveryInput): Promise<ReceiptSummary>;
  softDeleteDelivery(id: string, reason: string): Promise<void>;
}

export interface PaymentRepository {
  recordManualPayment(input: ManualPaymentInput): Promise<Payment>;
}

export interface LedgerRepository {
  getBranchBalance(branchId: string): Promise<number>;
}

export interface AdminLocationRepository {
  listCitiesWithCounts(): Promise<CityWithCounts[]>;
  listDistrictsWithCounts(cityId: string): Promise<DistrictWithCounts[]>;
  listBranchesWithContext(districtId: string): Promise<BranchWithContext[]>;
  createCity(input: CreateCityInput): Promise<City>;
  createDistrict(input: CreateDistrictInput): Promise<District>;
  createBranch(input: CreateBranchInput): Promise<Branch>;
  setCityActive(id: string, isActive: boolean): Promise<void>;
  setDistrictActive(id: string, isActive: boolean): Promise<void>;
  setBranchActive(id: string, isActive: boolean): Promise<void>;
  setOpeningBalancesLocked(locked: boolean): Promise<void>;
  getOpeningBalancesLocked(): Promise<boolean>;
  getBranchHubDetails(branchId: string): Promise<BranchHubDetails>;
  listDeliveriesWithPayments(
    branchId: string,
    limit?: number,
    offset?: number,
  ): Promise<MovementRow[]>;
  /**
   * M27: single-branch report snapshot for the Şube Detay PDF (period-scoped
   * metrics, product performance, and a capped movement ledger).
   */
  getBranchHubReport(branchId: string, dateFrom: string | null, dateTo: string | null, filters?: PdfReportFilters): Promise<BranchHubReport>;
}

export interface ReportsRepository {
  getKpis(range: SummaryRange): Promise<SummaryKpis>;
  getProductDistribution(range: SummaryRange): Promise<DistributionRow[]>;
  getBranchDistribution(range: SummaryRange): Promise<DistributionRow[]>;
  getBranchIncome(range: SummaryRange): Promise<DistributionRow[]>;
  getBranchReturnRate(range: SummaryRange): Promise<DistributionRow[]>;
  getDailySeries(range: SummaryRange): Promise<DailySeriesResult>;
  // M25: Summary PDF support. One atomic, Zod-validated snapshot that feeds
  // the whole PDF document.
  getSummaryPdfSnapshot(range: SummaryRange, filters?: PdfReportFilters): Promise<SummaryPdfSnapshot>;
}

export interface AnalyticsRepository {
  /**
   * Paginated, filterable, sortable branches list for the Şubeler table.
   * Returns one page plus the unpaginated total count for "showing X of Y".
   */
  listBranches(
    filters: BranchAnalyticsFilters,
    pagination: { limit: number; offset: number },
  ): Promise<BranchAnalyticsPage>;
  /**
   * M26: full filtered branch set + summary + filter echo for the Şubeler
   * PDF (same filter semantics as listBranches, but no pagination).
   */
  getBranchesReport(filters: BranchAnalyticsFilters & Pick<PdfReportFilters, 'productIds'>): Promise<BranchReportSnapshot>;
}

export type PdfReportFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  daysOfWeek?: number[] | null;
  productIds?: string[] | null;
};

export interface AppServices {
  auth: AuthRepository;
  session: SessionRepository;
  locations: LocationRepository;
  products: ProductRepository;
  deliveries: DeliveryRepository;
  payments: PaymentRepository;
  ledger: LedgerRepository;
  adminLocations: AdminLocationRepository;
  reports: ReportsRepository;
  analytics: AnalyticsRepository;
}
