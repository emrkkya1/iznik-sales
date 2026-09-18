import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

export const serviceClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase service configuration is missing.');
  return createClient(url, key, { auth: { persistSession: false } });
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(result);
}

export async function sendWithResend(input: {
  to: string;
  subject: string;
  text: string;
  fileName: string;
  pdf: Uint8Array;
  idempotencyKey: string;
}): Promise<string> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('REPORTS_FROM_EMAIL');
  if (!apiKey || !from) throw new Error('Email delivery is not configured.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      attachments: [{ filename: input.fileName, content: bytesToBase64(input.pdf) }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? `Resend request failed (${response.status}).`);
  if (!payload.id) throw new Error('Resend did not return an email id.');
  return payload.id as string;
}

export function safePdfText(value: unknown): string {
  return String(value ?? '—')
    .replace(/[()\\]/g, '\\$&')
    .replace(/[^\x20-\x7E]/g, '?');
}

/** A small, dependency-free server PDF used for scheduled summary delivery. */
export function buildScheduledSummaryPdf(snapshot: Record<string, unknown>, period: string): Uint8Array {
  const kpis = (snapshot.kpis ?? {}) as Record<string, unknown>;
  const lines = [
    'Tarihi Iznik Firini',
    'Haftalik / Aylik Yonetici Ozeti',
    `Donem: ${period}`,
    '',
    `Toplam Satis: ${kpis.totalSales ?? 0} TRY`,
    `Toplam Tahsilat: ${kpis.totalCollection ?? 0} TRY`,
    `Aktif Sube: ${kpis.activeBranchCount ?? 0}`,
    `Aktif Urun: ${kpis.activeProductCount ?? 0}`,
    `Teslim / Iade: ${kpis.deliveredQty ?? 0} / ${kpis.returnedQty ?? 0}`,
    '',
    'Bu rapor otomatik olarak olusturulmustur.',
  ];
  const content = ['BT', '/F1 16 Tf', '50 790 Td']
    .concat(lines.flatMap((line, index) => index === 0
      ? [`(${safePdfText(line)}) Tj`]
      : ['0 -24 Td', `(${safePdfText(line)}) Tj`]))
    .concat(['ET'])
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
