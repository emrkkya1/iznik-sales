/**
 * Şube Detay PDF export — binds `useReportExport` to the single-branch report
 * snapshot. Params carry the resolved period (dateFrom/dateTo, either null for
 * all-time or explicit dates), picked in the export sheet's config slot.
 */

import { services } from '@/services';
import type { BranchHubReport } from '@/services/supabase/branchHubReportSchema';
import { instrumentQuery, summarizeResult } from '@/utils/logger';
import { buildBranchDetailDocument } from '@/utils/pdf/branchDetail';
import type { PdfReportFilters } from '@/services/contracts';

import {
  useReportExport,
  type ReportExportController,
} from './useReportExport';

export type BranchHubReportParams = {
  branchId: string;
  dateFrom: string | null;
  dateTo: string | null;
  filters?: PdfReportFilters;
};

function describePeriod(data: BranchHubReport): string {
  const p = data.period;
  if (!p.dateFrom && !p.dateTo) return 'Tüm Zamanlar';
  return `${p.dateFrom?.replaceAll('-', '/') ?? '…'} – ${p.dateTo?.replaceAll('-', '/') ?? '…'}`;
}

export function useBranchHubReportExport(): ReportExportController<BranchHubReportParams> {
  return useReportExport<BranchHubReportParams, BranchHubReport>({
    id: 'branch-detail',
    shareTitle: 'Şube raporunu paylaş',
    fetch: instrumentQuery(
      'report_branch_hub_pdf',
      (params: BranchHubReportParams) =>
        services.adminLocations.getBranchHubReport(params.branchId, params.dateFrom, params.dateTo, params.filters),
      summarizeResult,
    ),
    buildDocument: (data) => buildBranchDetailDocument(data),
    fileName: (_params, data) => `sube-detay-${data.snapshotAt.replace(/[:T]/g, '-')}.pdf`,
    describe: (_params, data) => describePeriod(data),
  });
}
