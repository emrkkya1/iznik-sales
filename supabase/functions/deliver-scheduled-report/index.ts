import { buildScheduledSummaryPdf, corsHeaders, errorMessage, json, sendWithResend, serviceClient } from '../_shared/report-email.ts';

function istanbulDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function scheduledPeriod(mode: 'weekly' | 'monthly'): { start: string; end: string } {
  const today = new Date(`${istanbulDate()}T00:00:00Z`);
  if (mode === 'monthly') {
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  const day = today.getUTCDay() || 7;
  const end = new Date(today); end.setUTCDate(today.getUTCDate() - day);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);
  try {
    const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
    if (request.headers.get('Authorization') !== expected) return json({ message: 'Unauthorized' }, 401);
    const admin = serviceClient();
    const { data: setting, error: settingError } = await admin.from('report_email_settings').select('schedule_mode').eq('singleton', true).single();
    if (settingError) throw settingError;
    const mode = setting.schedule_mode as 'weekly' | 'monthly' | 'disabled';
    if (mode === 'disabled') return json({ status: 'skipped', reason: 'disabled' });
    const today = new Date(`${istanbulDate()}T00:00:00Z`);
    if (mode === 'weekly' && today.getUTCDay() !== 1) return json({ status: 'skipped', reason: 'not_weekly_due' });
    if (mode === 'monthly' && today.getUTCDate() !== 1) return json({ status: 'skipped', reason: 'not_monthly_due' });
    const period = scheduledPeriod(mode);
    const key = `scheduled:${mode}:${period.end}`;
    const { data: existing } = await admin.from('report_email_runs').select('id, status').eq('idempotency_key', key).maybeSingle();
    if (existing) return json({ status: 'skipped', reason: 'already_sent', runId: existing.id });
    const { data: run, error: runError } = await admin.from('report_email_runs').insert({ trigger: 'scheduled', report_type: 'summary', period_start: period.start, period_end: period.end, status: 'sending', idempotency_key: key }).select('id').single();
    if (runError || !run) throw runError ?? new Error('Scheduled run could not be created.');
    const { data: snapshot, error: snapshotError } = await admin.rpc('report_summary_pdf_for_email', { p_date_from: period.start, p_date_to: period.end });
    if (snapshotError) throw snapshotError;
    const { data: recipients, error: recipientsError } = await admin.from('report_recipients').select('id, email').eq('is_enabled', true);
    if (recipientsError) throw recipientsError;
    if (!recipients?.length) {
      await admin.from('report_email_runs').update({ status: 'skipped', completed_at: new Date().toISOString(), error_message: 'No active recipients.' }).eq('id', run.id);
      return json({ status: 'skipped', reason: 'no_recipients' });
    }
    const pdf = buildScheduledSummaryPdf(snapshot as Record<string, unknown>, `${period.start} – ${period.end}`);
    let failures = 0;
    for (const recipient of recipients) {
      try {
        const resendId = await sendWithResend({ to: recipient.email, subject: `${mode === 'weekly' ? 'Haftalık' : 'Aylık'} Özet Raporu · Tarihi İznik Fırını`, text: `${period.start} – ${period.end} döneminin PDF raporu ektedir.`, fileName: `ozet-${period.start}-${period.end}.pdf`, pdf, idempotencyKey: `${key}:${recipient.id}` });
        await admin.from('report_email_attempts').insert({ run_id: run.id, recipient_id: recipient.id, resend_email_id: resendId, status: 'sent', completed_at: new Date().toISOString() });
      } catch (error) {
        failures += 1;
        console.error('[deliver-scheduled-report] recipient delivery failed', {
          recipientId: recipient.id,
          message: errorMessage(error),
        });
        await admin.from('report_email_attempts').insert({ run_id: run.id, recipient_id: recipient.id, status: 'failed', error_message: errorMessage(error), completed_at: new Date().toISOString() });
      }
    }
    const status = failures === 0 ? 'sent' : failures === recipients.length ? 'failed' : 'partial_failure';
    await admin.from('report_email_runs').update({ status, completed_at: new Date().toISOString(), error_message: failures ? `${failures} recipient delivery failed.` : null }).eq('id', run.id);
    return json({ runId: run.id, status, sentCount: recipients.length - failures, failedCount: failures });
  } catch (error) {
    const message = errorMessage(error);
    console.error('[deliver-scheduled-report] invocation failed', { message });
    return json({ message }, 500);
  }
});
