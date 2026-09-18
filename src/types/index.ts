export type { Database, Json } from './database.types';

export type {
  UserRole,
  PaymentType,
  OperationType,
  User,
  City,
  District,
  Branch,
  BranchLocation,
  Product,
  CatalogProduct,
  BranchProductSelection,
  BranchProduct,
  BranchProductPrice,
  Delivery,
  DeliveryItem,
  Payment,
  AuditLog,
  CreateDeliveryInput,
  UpdateDeliveryInput,
  ManualPaymentInput,
  ReceiptSummary,
  BranchProductWithPrice,
  BranchProductWithStatus,
  DeliveryWithItems,
  DeliveryWithBranch,
  DeliveryItemWithProduct,
  SummaryRange,
  SummaryKpis,
  DistributionRow,
  DailySeriesPoint,
  DailySeriesResult,
  CityWithCounts,
  DistrictWithCounts,
  BranchWithContext,
  BranchHubDetails,
  CreateCityInput,
  CreateDistrictInput,
  CreateBranchInput,
  PaymentEmbed,
  DeliveryWithPayment,
  ManualPayment,
  MovementRow,
  SetBranchProductPriceInput,
  SetBranchProductActiveInput,
  ActivateBranchProductInput,
  DayOfWeek,
  BranchAnalyticsStatus,
  BranchAnalyticsSortBy,
  BranchAnalyticsSortDir,
  BranchAnalyticsFilters,
  BranchAnalyticsRow,
  BranchAnalyticsPage,
} from './domain.types';

export type AuthSession = {
  accessToken: string;
  expiresAt: number | null;
  user: {
    id: string;
    email: string | null;
  };
};
