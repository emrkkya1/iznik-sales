/**
 * Generic report-export controller (Summary, Şubeler, Şube Detay).
 *
 * Owns the pipeline + panel-open state and drives rendering imperatively:
 *
 *   idle ──trigger(params)──▶ fetching ──▶ rendering ──▶ ready
 *                              │             │
 *                              └── error ◀───┘   (retry replays params)
 *
 * A monotonically-increasing operation token guards against stale async
 * completions: only the latest `trigger`/`retry` may update state. `share`
 * is a separate sub-state inside `ready` (a share failure keeps the file
 * valid and merely surfaces a recoverable message).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { assembleReportDocument, type ReportDocument } from '@/utils/pdf/document';
import { logMutation } from '@/utils/logger';
import { renderPdf, sharePdf } from '@/utils/pdf/render';

export type ReportExportState =
  | { status: 'idle' }
  | { status: 'fetching'; stage: 'fetching' }
  | { status: 'rendering'; stage: 'rendering' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      uri: string;
      fileName: string;
      pageCount: number;
      contextLabel: string;
      shareBusy?: boolean;
      shareError?: string;
    };

export type ReportExportConfig<TParams, TData> = {
  /** Stable id for log names + cache prefix ('summary' | 'branches' | 'branch-detail'). */
  id: string;
  shareTitle: string;
  fetch: (params: TParams) => Promise<TData>;
  buildDocument: (data: TData, params: TParams) => ReportDocument;
  fileName: (params: TParams, data: TData) => string;
  /** Human-readable context for the ready receipt (period / filter summary). */
  describe: (params: TParams, data: TData) => string;
};

export type ReportExportController<TParams> = {
  state: ReportExportState;
  isOpen: boolean;
  isBusy: boolean;
  open: () => void;
  close: () => void;
  reset: () => void;
  trigger: (params: TParams) => Promise<void>;
  retry: () => void;
  share: () => Promise<void>;
};

export function useReportExport<TParams, TData>(
  config: ReportExportConfig<TParams, TData>,
): ReportExportController<TParams> {
  const [state, setState] = useState<ReportExportState>({ status: 'idle' });
  const [isOpen, setIsOpen] = useState(false);
  const opRef = useRef(0);
  const paramsRef = useRef<TParams | null>(null);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const reset = useCallback(() => {
    opRef.current += 1;
    paramsRef.current = null;
    setState({ status: 'idle' });
  }, []);

  const run = useCallback(async (params: TParams) => {
    const cfg = configRef.current;
    const op = ++opRef.current;
    paramsRef.current = params;
    setIsOpen(true);
    setState({ status: 'fetching', stage: 'fetching' });

    try {
      const data = await cfg.fetch(params);
      if (op !== opRef.current) return;

      setState({ status: 'rendering', stage: 'rendering' });
      logMutation(`generate_${cfg.id}_pdf`, 'start', {});

      const document = cfg.buildDocument(data, params);
      const fileName = cfg.fileName(params, data);
      const html = assembleReportDocument(document);
      const { uri, pageCount } = await renderPdf(html, fileName, document.pages.length);
      if (op !== opRef.current) return;

      logMutation(`generate_${cfg.id}_pdf`, 'success', { uri, pageCount });
      setState({
        status: 'ready',
        uri,
        fileName,
        pageCount,
        contextLabel: cfg.describe(params, data),
      });
    } catch (error) {
      if (op !== opRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      logMutation(`generate_${cfg.id}_pdf`, 'error', error);
      setState({ status: 'error', message });
    }
  }, []);

  const trigger = useCallback(
    (params: TParams) => run(params),
    [run],
  );

  const retry = useCallback(() => {
    if (paramsRef.current !== null) {
      void run(paramsRef.current);
    }
  }, [run]);

  const share = useCallback(async () => {
    const cfg = configRef.current;
    if (state.status !== 'ready' || state.shareBusy) return;
    const { uri } = state;
    setState({ ...state, shareBusy: true, shareError: undefined });
    logMutation(`share_${cfg.id}_pdf`, 'start', { uri });
    try {
      await sharePdf(uri, cfg.shareTitle);
      logMutation(`share_${cfg.id}_pdf`, 'success', {});
      setState({ ...state, shareBusy: false, shareError: undefined });
    } catch (error) {
      logMutation(`share_${cfg.id}_pdf`, 'error', error);
      setState({
        ...state,
        shareBusy: false,
        shareError: error instanceof Error ? error.message : String(error),
      });
    }
  }, [state]);

  const isBusy =
    state.status === 'fetching' ||
    state.status === 'rendering' ||
    (state.status === 'ready' && !!state.shareBusy);

  return {
    state,
    isOpen,
    isBusy,
    open,
    close,
    reset,
    trigger,
    retry,
    share,
  };
}
