/**
 * Şubeler PDF export — binds `useReportExport` to the filtered branches
 * snapshot. Params are the exact on-screen filters (applied + search + sort),
 * so the PDF can never disagree with the visible table.
 */

import { services } from '@/services';
import type { BranchReportSnapshot } from '@/services/supabase/branchesReportSchema';
import { instrumentQuery, summarizeResult } from '@/utils/logger';
import { buildBranchesDocument } from '@/utils/pdf/branchesReport';
import type { BranchAnalyticsFilters } from '@/types';
import type { PdfReportFilters } from '@/services/contracts';

import {
  useReportExport,
  type ReportExportController,
} from './useReportExport';

function describeFilters(snap: BranchReportSnapshot): string {
  const f = snap.filters;
  const parts: string[] = [`${snap.summary.branchCount} şube`];
  if (f.status !== 'all') parts.push(f.status === 'active' ? 'Aktif' : 'Pasif');
  if (f.cityName) parts.push(f.cityName);
  if (f.search) parts.push(`"${f.search}"`);
  return parts.join(' · ');
}

export function useBranchesReportExport(): ReportExportController<BranchAnalyticsFilters & Pick<PdfReportFilters, 'productIds'>> {
  return useReportExport<BranchAnalyticsFilters & Pick<PdfReportFilters, 'productIds'>, BranchReportSnapshot>({
    id: 'branches',
    shareTitle: 'Şubeler raporunu paylaş',
    fetch: instrumentQuery(
      'report_branches_pdf',
      (params: BranchAnalyticsFilters) => services.analytics.getBranchesReport(params),
      summarizeResult,
    ),
    buildDocument: (data) => buildBranchesDocument(data),
    fileName: (_params, data) => `subeler-${data.snapshotAt.replace(/[:T]/g, '-')}.pdf`,
    describe: (_params, data) => describeFilters(data),
  });
}
