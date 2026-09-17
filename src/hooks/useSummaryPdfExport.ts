/**
 * Summary PDF export — binds the generic `useReportExport` controller to the
 * Summary report. Fetches one atomic snapshot on demand (never on screen
 * mount), renders a two-page document, and shares the result.
 */

import { useQueryClient } from '@tanstack/react-query';

import { services } from '@/services';
import type { SummaryPdfSnapshot } from '@/services/supabase/summaryPdfSchema';
import { instrumentQuery, summarizeResult } from '@/utils/logger';
import { buildSummaryDocument } from '@/utils/pdf/summary';
import { rangeLabel } from '@/utils/pdf/styles';
import type { SummaryRange } from '@/types';
import type { PdfReportFilters } from '@/services/contracts';

import {
  useReportExport,
  type ReportExportController,
} from './useReportExport';

export type SummaryPdfParams = { range: SummaryRange; filters?: PdfReportFilters };

const summaryPdfQueryOptions = (params: SummaryPdfParams) => ({
  queryKey: ['reports', 'summary-pdf', params] as const,
  queryFn: instrumentQuery(
    'report_summary_pdf',
    () => services.reports.getSummaryPdfSnapshot(params.range, params.filters),
    summarizeResult,
  ),
  // Always fresh: an explicit export must reflect the current database.
  staleTime: 0,
});

export function useSummaryPdfExport(): ReportExportController<SummaryPdfParams> {
  const queryClient = useQueryClient();

  return useReportExport<SummaryPdfParams, SummaryPdfSnapshot>({
    id: 'summary',
    shareTitle: 'Özet raporunu paylaş',
    fetch: (params) => queryClient.fetchQuery(summaryPdfQueryOptions(params)),
    buildDocument: (data) => buildSummaryDocument(data),
    fileName: (params, data) => {
      const stamp = data.snapshotAt.replace(/[:T]/g, '-');
      return `ozet-${params.range}-${stamp}.pdf`;
    },
    describe: (params) => params.filters?.dateFrom && params.filters.dateTo
      ? `${params.filters.dateFrom.replaceAll('-', '/')} – ${params.filters.dateTo.replaceAll('-', '/')}`
      : rangeLabel(params.range),
  });
}
