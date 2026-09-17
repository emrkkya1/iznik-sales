import { describe, expect, it } from 'vitest';

import {
  assembleReportDocument,
  chunkRows,
  esc,
  type ReportDocument,
} from '@/utils/pdf/document';

function doc(): ReportDocument {
  return {
    label: 'Genel Özet Raporu',
    generatedAt: '2026-09-03T14:25:33',
    pages: [
      { title: 'Sayfa Bir', contextLine: 'Bu Hafta', bodyHtml: '<p>içerik</p>' },
      { title: 'Sayfa İki', contextLine: 'Bu Hafta', bodyHtml: '<p>içerik 2</p>' },
    ],
  };
}

describe('assembleReportDocument', () => {
  it('produces a complete HTML document', () => {
    expect(assembleReportDocument(doc())).toMatch(/^<!DOCTYPE html>/);
  });

  it('injects page numbers with total count', () => {
    const html = assembleReportDocument(doc());
    expect(html).toContain('sayfa 1 / 2');
    expect(html).toContain('sayfa 2 / 2');
  });

  it('renders one .pdf-page section per page', () => {
    const html = assembleReportDocument(doc());
    expect((html.match(/class="pdf-page"/g) ?? []).length).toBe(2);
  });

  it('escapes page titles and context lines', () => {
    const html = assembleReportDocument({
      ...doc(),
      pages: [{ title: '<b>', contextLine: '"x"', bodyHtml: '' }],
    });
    expect(html).toContain('&lt;b&gt;');
    expect(html).toContain('&quot;x&quot;');
  });

  it('injects the brand stylesheet', () => {
    const html = assembleReportDocument(doc());
    expect(html).toContain('@page');
    expect(html).toContain('#E5DCCD');
  });
});

describe('chunkRows', () => {
  it('splits into fixed-size chunks', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunkRows([], 2)).toEqual([]);
  });
});

describe('esc', () => {
  it('escapes the five dangerous characters', () => {
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('returns empty string for null/undefined', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});
