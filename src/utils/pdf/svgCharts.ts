/**
 * Inline SVG chart builders for PDF reports.
 *
 * Why inline SVG: expo-print renders HTML in a WebView, but `<canvas>` is
 * not guaranteed to capture reliably across Android/iOS WebView versions.
 * SVG is part of the DOM, so it survives `printToFileAsync` byte-for-byte.
 *
 * Charts here are intentionally simple — single-series line, single-series
 * bar, single donut. They share the brand palette (`PDF_CHART_PALETTE`) and
 * a common `ChartGeometry` interface so callers can compose layouts without
 * copying numbers around.
 */

import { PDF_CHART_PALETTE } from './styles';

export type Slice = { label: string; value: number; color?: string };

export type LinePoint = { label: string; value: number };

export type BarPoint = { label: string; value: number };

export type ChartGeometry = {
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
};

const DEFAULT_GEOM: ChartGeometry = {
  width: 360,
  height: 160,
  paddingLeft: 36,
  paddingRight: 12,
  paddingTop: 12,
  paddingBottom: 28,
};

// HTML-safe escape so a malicious or weird label can't break the document.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Build a Y-axis label set. We render 4 horizontal rules + 4 labels
// (min/midpoints/max). Returns SVG <g> string.
function buildYAxis(
  geom: ChartGeometry,
  minValue: number,
  maxValue: number,
  labelColor: string,
  axisColor: string,
  valuePrefix = '',
  valueSuffix = '',
): string {
  const innerH = geom.height - geom.paddingTop - geom.paddingBottom;
  const innerW = geom.width - geom.paddingLeft - geom.paddingRight;
  const rules: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i <= 3; i++) {
    const y = geom.paddingTop + (innerH * i) / 3;
    const v = maxValue - ((maxValue - minValue) * i) / 3;
    rules.push(
      `<line x1="${geom.paddingLeft}" y1="${y}" x2="${geom.paddingLeft + innerW}" y2="${y}" stroke="${axisColor}" stroke-width="1" />`,
    );
    labels.push(
      `<text x="${geom.paddingLeft - 4}" y="${y + 3}" text-anchor="end" font-size="8" fill="${labelColor}" font-family="Helvetica, Arial, sans-serif">${escapeHtml(valuePrefix + compactNumber(v) + valueSuffix)}</text>`,
    );
  }
  return rules.join('') + labels.join('');
}

// Compact thousands formatter for axis labels (don't render "₺1.234,56" in
// the axis — keep them tight like "1k", "10k", "100k"). Falls back to the
// full format for small values.
function compactNumber(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return Math.round(v).toString();
}

/**
 * Single-series line chart. `points` is rendered left-to-right; x labels
 * come from each point's `label` field (already formatted by caller).
 * Returns full `<svg>...</svg>` string.
 */
export function buildSvgLineChart(
  points: readonly LinePoint[],
  options: {
    geom?: Partial<ChartGeometry>;
    lineColor?: string;
    pointColor?: string;
    labelColor?: string;
    axisColor?: string;
    showValues?: boolean;
  } = {},
): string {
  const geom: ChartGeometry = { ...DEFAULT_GEOM, ...options.geom };
  const lineColor = options.lineColor ?? PDF_CHART_PALETTE[0] ?? '#6A4715';
  const pointColor = options.pointColor ?? lineColor;
  const labelColor = options.labelColor ?? '#85653D';
  const axisColor = options.axisColor ?? '#E5DCCD';
  const showValues = options.showValues ?? false;

  if (points.length === 0) {
    return `<svg width="${geom.width}" height="${geom.height}" xmlns="http://www.w3.org/2000/svg" />`;
  }

  const innerW = geom.width - geom.paddingLeft - geom.paddingRight;
  const innerH = geom.height - geom.paddingTop - geom.paddingBottom;
  const maxValue = Math.max(...points.map((p) => p.value), 0);
  const minValue = Math.min(...points.map((p) => p.value), 0);

  // Coerce a zero-only series so the line still spans the chart height.
  const effectiveMax = maxValue === 0 ? 1 : maxValue;
  const effectiveMin = minValue === maxValue ? 0 : minValue;

  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = geom.paddingLeft + stepX * i;
    const yNorm = (p.value - effectiveMin) / (effectiveMax - effectiveMin || 1);
    const y = geom.paddingTop + innerH * (1 - yNorm);
    return { x, y, p };
  });

  // Polyline path
  const path = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ');

  // X-axis labels — show every Nth label to avoid overlap.
  const labelStride = Math.max(1, Math.ceil(points.length / 6));
  const xLabels = coords
    .map((c, i) => {
      if (i % labelStride !== 0 && i !== coords.length - 1) return '';
      return `<text x="${c.x.toFixed(2)}" y="${geom.height - geom.paddingBottom + 12}" text-anchor="middle" font-size="8" fill="${labelColor}" font-family="Helvetica, Arial, sans-serif">${escapeHtml(c.p.label)}</text>`;
    })
    .join('');

  const dots = coords
    .map((c) => `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="2" fill="${pointColor}" />`)
    .join('');

  const valueLabels = showValues
    ? coords
        .map(
          (c) =>
            `<text x="${c.x.toFixed(2)}" y="${(c.y - 5).toFixed(2)}" text-anchor="middle" font-size="7" fill="${labelColor}" font-family="Helvetica, Arial, sans-serif">${escapeHtml(compactNumber(c.p.value))}</text>`,
        )
        .join('')
    : '';

  return [
    `<svg width="${geom.width}" height="${geom.height}" xmlns="http://www.w3.org/2000/svg">`,
    buildYAxis(geom, effectiveMin, effectiveMax, labelColor, axisColor),
    `<path d="${path}" fill="none" stroke="${lineColor}" stroke-width="1.5" />`,
    dots,
    valueLabels,
    xLabels,
    `</svg>`,
  ].join('');
}

/**
 * Single-series bar chart. Bars share the brand primary color by default.
 */
export function buildSvgBarChart(
  points: readonly BarPoint[],
  options: {
    geom?: Partial<ChartGeometry>;
    barColor?: string;
    labelColor?: string;
    axisColor?: string;
    showValues?: boolean;
  } = {},
): string {
  const geom: ChartGeometry = { ...DEFAULT_GEOM, ...options.geom };
  const barColor = options.barColor ?? PDF_CHART_PALETTE[0] ?? '#6A4715';
  const labelColor = options.labelColor ?? '#85653D';
  const axisColor = options.axisColor ?? '#E5DCCD';
  const showValues = options.showValues ?? false;

  if (points.length === 0) {
    return `<svg width="${geom.width}" height="${geom.height}" xmlns="http://www.w3.org/2000/svg" />`;
  }

  const innerW = geom.width - geom.paddingLeft - geom.paddingRight;
  const innerH = geom.height - geom.paddingTop - geom.paddingBottom;
  const maxValue = Math.max(...points.map((p) => p.value), 0);
  const effectiveMax = maxValue === 0 ? 1 : maxValue;
  const slot = innerW / points.length;
  const barWidth = Math.max(2, slot * 0.6);

  const bars = points
    .map((p, i) => {
      const xCenter = geom.paddingLeft + slot * i + slot / 2;
      const h = (p.value / effectiveMax) * innerH;
      const y = geom.paddingTop + innerH - h;
      return `<rect x="${(xCenter - barWidth / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="${barColor}" />`;
    })
    .join('');

  const valueLabels = showValues
    ? points
        .map((p, i) => {
          const xCenter = geom.paddingLeft + slot * i + slot / 2;
          const h = (p.value / effectiveMax) * innerH;
          const y = geom.paddingTop + innerH - h;
          return `<text x="${xCenter.toFixed(2)}" y="${(y - 2).toFixed(2)}" text-anchor="middle" font-size="7" fill="${labelColor}" font-family="Helvetica, Arial, sans-serif">${escapeHtml(compactNumber(p.value))}</text>`;
        })
        .join('')
    : '';

  const labelStride = Math.max(1, Math.ceil(points.length / 6));
  const xLabels = points
    .map((p, i) => {
      if (i % labelStride !== 0 && i !== points.length - 1) return '';
      const xCenter = geom.paddingLeft + slot * i + slot / 2;
      return `<text x="${xCenter.toFixed(2)}" y="${geom.height - geom.paddingBottom + 12}" text-anchor="middle" font-size="8" fill="${labelColor}" font-family="Helvetica, Arial, sans-serif">${escapeHtml(p.label)}</text>`;
    })
    .join('');

  return [
    `<svg width="${geom.width}" height="${geom.height}" xmlns="http://www.w3.org/2000/svg">`,
    buildYAxis(geom, 0, effectiveMax, labelColor, axisColor),
    bars,
    valueLabels,
    xLabels,
    `</svg>`,
  ].join('');
}

/**
 * Donut chart with legend. Slices use brand palette colors in order.
 * Returns the SVG (donut only) — caller renders the legend table separately
 * so it can be styled with the table CSS instead of being baked into SVG.
 */
export function buildSvgDonut(
  slices: readonly Slice[],
  options: {
    size?: number;
    innerRatio?: number;
    centerLabel?: string;
  } = {},
): string {
  const size = options.size ?? 140;
  const innerRatio = options.innerRatio ?? 0.55;
  const centerLabel = options.centerLabel;

  if (slices.length === 0) {
    return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" />`;
  }

  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) {
    return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" />`;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const innerR = r * innerRatio;

  let angle = -Math.PI / 2; // start at 12 o'clock
  const arcs: string[] = [];

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const v = Math.max(0, slice.value);
    if (v === 0) continue;
    const fraction = v / total;
    const sweep = fraction * Math.PI * 2;
    const endAngle = angle + sweep;
    const largeArc = sweep > Math.PI ? 1 : 0;
    const xOuter1 = cx + r * Math.cos(angle);
    const yOuter1 = cy + r * Math.sin(angle);
    const xOuter2 = cx + r * Math.cos(endAngle);
    const yOuter2 = cy + r * Math.sin(endAngle);
    const xInner1 = cx + innerR * Math.cos(endAngle);
    const yInner1 = cy + innerR * Math.sin(endAngle);
    const xInner2 = cx + innerR * Math.cos(angle);
    const yInner2 = cy + innerR * Math.sin(angle);
    const color =
      slice.color ??
      PDF_CHART_PALETTE[i % PDF_CHART_PALETTE.length] ??
      '#6A4715';

    const d = [
      `M ${xOuter1.toFixed(2)} ${yOuter1.toFixed(2)}`,
      `A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${xOuter2.toFixed(2)} ${yOuter2.toFixed(2)}`,
      `L ${xInner1.toFixed(2)} ${yInner1.toFixed(2)}`,
      `A ${innerR.toFixed(2)} ${innerR.toFixed(2)} 0 ${largeArc} 0 ${xInner2.toFixed(2)} ${yInner2.toFixed(2)}`,
      'Z',
    ].join(' ');

    arcs.push(`<path d="${d}" fill="${color}" />`);
    angle = endAngle;
  }

  const centerText = centerLabel
    ? `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="#2C2115" font-family="Helvetica, Arial, sans-serif">${escapeHtml(centerLabel)}</text>`
    : '';

  return [
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`,
    arcs.join(''),
    centerText,
    `</svg>`,
  ].join('');
}
