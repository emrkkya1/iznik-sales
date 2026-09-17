/**
 * Render + share PDFs. Report-agnostic: callers pass HTML and a unique
 * filename. Writes into `Paths.cache` and opens the system share sheet.
 *
 * File lifecycle:
 *   - `renderPdf` moves (not copies-in-memory) the print output into a
 *     uniquely named cache file, verifies it is non-empty, and cleans the
 *     print temp on success.
 *   - `sharePdf` verifies the file still exists (the OS may purge cache) and
 *     throws a recoverable error otherwise.
 *   - `pruneReportCache` best-effort deletes stale generated files.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { printToFileAsync } from 'expo-print';
import * as Sharing from 'expo-sharing';

import { PAGE_HEIGHT, PAGE_WIDTH } from './styles';

export type RenderPdfResult = {
  uri: string;
  pageCount: number;
};

export async function renderPdf(
  html: string,
  fileName: string,
  expectedPages?: number,
): Promise<RenderPdfResult> {
  const { uri, numberOfPages } = await printToFileAsync({
    html,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    // Margins are handled inside each `.pdf-page` (24px padding); iOS uses
    // these options, Android uses the @page rule in styles.ts. Both are zero
    // so the page geometry is byte-identical across platforms.
    margins: { left: 0, right: 0, top: 0, bottom: 0 },
    textZoom: 100,
  });

  if (expectedPages !== undefined && numberOfPages !== expectedPages) {
    // Non-fatal: fixed `.pdf-page` sections should map 1:1, but a mismatch
    // signals a content-overflow bug worth investigating.
    console.warn(
      `[pdf] ${fileName}: expected ${expectedPages} pages, print produced ${numberOfPages}.`,
    );
  }

  const source = new File(uri);
  const target = new File(Paths.cache, fileName);
  await source.move(target);

  if (!target.exists || !target.size || target.size <= 0) {
    throw new Error('PDF oluşturulamadı: çıktı dosyası boş.');
  }

  return { uri: target.uri, pageCount: numberOfPages };
}

export async function sharePdf(uri: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Bu cihazda paylaşım desteklenmiyor.');
  }
  if (!new File(uri).exists) {
    throw new Error('Rapor dosyası bulunamadı. Lütfen yeniden oluşturun.');
  }
  await Sharing.shareAsync(uri, {
    dialogTitle,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
}

/**
 * Delete all cached report files matching `prefixes` except the newest per
 * prefix (filenames embed a sortable timestamp). Best-effort; never throws.
 */
export async function pruneReportCache(prefixes: readonly string[]): Promise<void> {
  try {
    const dir = new Directory(Paths.cache);
    const files = dir.list().filter((entry) => entry instanceof File);
    for (const prefix of prefixes) {
      const matches = files
        .filter((f) => f.name.startsWith(prefix))
        .sort((a, b) => b.name.localeCompare(a.name));
      for (const stale of matches.slice(1)) {
        try {
          stale.delete();
        } catch {
          // Ignore individual delete failures.
        }
      }
    }
  } catch {
    // Cache may be empty or unavailable; pruning is opportunistic.
  }
}
