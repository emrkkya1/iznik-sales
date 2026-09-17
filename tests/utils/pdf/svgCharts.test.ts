import { describe, expect, it } from 'vitest';

import {
  buildSvgBarChart,
  buildSvgDonut,
  buildSvgLineChart,
} from '@/utils/pdf/svgCharts';

describe('buildSvgLineChart', () => {
  it('returns an empty svg for empty points', () => {
    const svg = buildSvgLineChart([]);
    expect(svg).toMatch(/<svg[^>]*\/>/);
  });

  it('renders polyline path + dots for points', () => {
    const svg = buildSvgLineChart([
      { label: '01 Ağu', value: 100 },
      { label: '02 Ağu', value: 200 },
      { label: '03 Ağu', value: 150 },
    ]);
    expect(svg).toMatch(/<path[^>]+d="M/);
    expect(svg).toMatch(/<circle/);
    expect(svg).toMatch(/<text/);
  });

  it('honors custom lineColor', () => {
    const svg = buildSvgLineChart(
      [{ label: 'a', value: 1 }],
      { lineColor: '#FF00FF' },
    );
    expect(svg).toContain('stroke="#FF00FF"');
  });

  it('renders value labels when showValues=true', () => {
    const svg = buildSvgLineChart(
      [{ label: 'a', value: 1000 }, { label: 'b', value: 2000 }],
      { showValues: true },
    );
    expect(svg).toMatch(/1k/);
    expect(svg).toMatch(/2k/);
  });

  it('escapes html in labels', () => {
    const svg = buildSvgLineChart([{ label: '<script>', value: 1 }]);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('buildSvgBarChart', () => {
  it('renders rects for non-empty points', () => {
    const svg = buildSvgBarChart([
      { label: 'a', value: 10 },
      { label: 'b', value: 20 },
    ]);
    expect(svg).toMatch(/<rect/);
    expect(svg).not.toMatch(/<svg[^>]*\/>/);
  });

  it('renders empty svg for empty points', () => {
    const svg = buildSvgBarChart([]);
    expect(svg).toMatch(/<svg[^>]*\/>/);
  });

  it('shows value labels when showValues=true', () => {
    const svg = buildSvgBarChart(
      [{ label: 'a', value: 5000 }],
      { showValues: true },
    );
    expect(svg).toMatch(/5k/);
  });
});

describe('buildSvgDonut', () => {
  it('renders one arc per slice', () => {
    const svg = buildSvgDonut([
      { label: 'A', value: 30 },
      { label: 'B', value: 70 },
    ]);
    const arcs = svg.match(/<path d="M/g) ?? [];
    expect(arcs.length).toBe(2);
  });

  it('renders empty svg for empty slices', () => {
    expect(buildSvgDonut([])).toMatch(/<svg[^>]*\/>/);
  });

  it('renders empty svg when all values are zero', () => {
    const svg = buildSvgDonut([
      { label: 'A', value: 0 },
      { label: 'B', value: 0 },
    ]);
    expect(svg).toMatch(/<svg[^>]*\/>/);
  });

  it('renders center label when provided', () => {
    const svg = buildSvgDonut(
      [{ label: 'A', value: 50 }, { label: 'B', value: 50 }],
      { centerLabel: '100' },
    );
    expect(svg).toContain('>100<');
  });

  it('uses brand palette colors in slice order', () => {
    const svg = buildSvgDonut([
      { label: 'A', value: 50 },
      { label: 'B', value: 50 },
    ]);
    // First palette color is #6A4715 (chart-1).
    expect(svg).toContain('fill="#6A4715"');
  });

  it('respects explicit slice color when provided', () => {
    const svg = buildSvgDonut([
      { label: 'A', value: 50, color: '#123456' },
      { label: 'B', value: 50 },
    ]);
    expect(svg).toContain('fill="#123456"');
  });
});
