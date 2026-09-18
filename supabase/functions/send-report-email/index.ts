import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { corsHeaders, errorMessage, json, sendWithResend, serviceClient } from '../_shared/report-email.ts';

type RequestBody = {
  artifactPath: string;
  fileName: string;
  reportType: 'summary' | 'branches' | 'branch-detail';
  reportLabel: string;
  recipientIds: string[];
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ message: 'Method not allowed' }, 405);
  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!token || !url || !anonKey) return json({ message: 'Unauthorized' }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return json({ message: 'Unauthorized' }, 401);
    const body = await request.json() as RequestBody;
    if (!body.artifactPath?.startsWith(`${userData.user.id}/`) || !body.fileName?.endsWith('.pdf')) {
      return json({ message: 'Invalid report artifact.' }, 400);
    }
    if (!Array.isArray(body.recipientIds) || body.recipientIds.length === 0) {
      return json({ message: 'En az bir alıcı seçmelisiniz.' }, 400);
    }

    const admin = serviceClient();
    const { data: profile } = await admin.from('users').select('id, role, is_active').eq('id', userData.user.id).maybeSingle();
    if (!profile || profile.role !== 'admin' || !profile.is_active) return json({ message: 'Not authorized' }, 403);

    const { data: recipients, error: recipientsError } = await admin
      .from('report_recipients').select('id, email').eq('is_enabled', true).in('id', body.recipientIds);
    if (recipientsError) throw recipientsError;
    if (!recipients || recipients.length !== new Set(body.recipientIds).size) {
      return json({ message: 'Seçili alıcılardan biri artık etkin değil.' }, 400);
    }
    const { data: file, error: downloadError } = await admin.storage.from('report-artifacts').download(body.artifactPath);
    if (downloadError || !file) throw downloadError ?? new Error('Rapor dosyası bulunamadı.');
    const pdf = new Uint8Array(await file.arrayBuffer());
    const key = crypto.randomUUID();
    const { data: run, error: runError } = await admin.from('report_email_runs').insert({
      trigger: 'manual', report_type: body.reportType, artifact_path: body.artifactPath,
      requested_by: userData.user.id, status: 'sending', idempotency_key: key,
    }).select('id').single();
    if (runError || !run) throw runError ?? new Error('Email run could not be created.');

    let failures = 0;
    for (const recipient of recipients) {
      try {
        const resendId = await sendWithResend({
          to: recipient.email, subject: `${body.reportLabel} · Tarihi İznik Fırını`,
          text: `${body.reportLabel} PDF raporu ektedir.`, fileName: body.fileName, pdf,
          idempotencyKey: `${key}:${recipient.id}`,
        });
        await admin.from('report_email_attempts').insert({ run_id: run.id, recipient_id: recipient.id, resend_email_id: resendId, status: 'sent', completed_at: new Date().toISOString() });
      } catch (error) {
        failures += 1;
        console.error('[send-report-email] recipient delivery failed', {
          recipientId: recipient.id,
          message: errorMessage(error),
        });
        await admin.from('report_email_attempts').insert({ run_id: run.id, recipient_id: recipient.id, status: 'failed', error_message: errorMessage(error), completed_at: new Date().toISOString() });
      }
    }
    const status = failures === 0 ? 'sent' : failures === recipients.length ? 'failed' : 'partial_failure';
    await admin.from('report_email_runs').update({ status, completed_at: new Date().toISOString(), error_message: failures ? `${failures} recipient delivery failed.` : null }).eq('id', run.id);
    return json({ runId: run.id, sentCount: recipients.length - failures, failedCount: failures });
  } catch (error) {
    const message = errorMessage(error);
    console.error('[send-report-email] invocation failed', { message });
    return json({ message }, 500);
  }
});
