import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderPdf } from '@/utils/pdf/render';
import { PAGE_HEIGHT, PAGE_WIDTH } from '@/utils/pdf/styles';

const mocks = vi.hoisted(() => ({ print: vi.fn(), move: vi.fn() }));
vi.mock('expo-print', () => ({ printToFileAsync: mocks.print }));
vi.mock('expo-sharing', () => ({}));
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  Directory: class {},
  File: class {
    exists = true;
    size = 100;
    uri: string;
    constructor(base: string, name?: string) { this.uri = base + (name ?? ''); }
    move = mocks.move;
  },
}));

describe('renderPdf paper geometry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.print.mockResolvedValue({ uri: 'file:///print.pdf', numberOfPages: 2 });
  });

  it('passes portrait A4 dimensions matching ordinary A4 print paper', async () => {
    const result = await renderPdf('<html>Report</html>', 'report.pdf', 2);
    expect(mocks.print).toHaveBeenCalledWith({
      html: '<html>Report</html>', width: PAGE_WIDTH, height: PAGE_HEIGHT,
      margins: { left: 0, right: 0, top: 0, bottom: 0 }, textZoom: 100,
    });
    expect(PAGE_WIDTH).toBe(595);
    expect(PAGE_HEIGHT).toBe(842);
    expect(PAGE_WIDTH / PAGE_HEIGHT).toBeCloseTo(210 / 297, 2);
    expect(result).toEqual({ uri: 'file:///cache/report.pdf', pageCount: 2 });
    expect(mocks.move).toHaveBeenCalledOnce();
  });
});
