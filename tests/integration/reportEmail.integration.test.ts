import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAdminClient, createAnonClient, createStaffClient, type AdminClient } from './_helpers/clients';

const email = `itest-report-${Date.now().toString(36)}@iznik.test`;
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
let recipientId: string;

describe('report email settings RPCs (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();
  });

  afterAll(async () => {
    if (recipientId) await admin.rpc('delete_report_recipient', { p_id: recipientId });
    await admin.rpc('set_report_schedule_mode', { p_mode: 'disabled' });
  });

  it('allows an admin to manage recipients and schedule', async () => {
    const created = await admin.rpc('upsert_report_recipient', { p_email: email, p_is_enabled: true });
    expect(created.error).toBeNull();
    recipientId = created.data as string;
    const listed = await admin.rpc('list_report_recipients');
    expect(listed.error).toBeNull();
    expect((listed.data as { id: string; email: string }[]).some((item) => item.id === recipientId && item.email === email)).toBe(true);
    const scheduled = await admin.rpc('set_report_schedule_mode', { p_mode: 'weekly' });
    expect(scheduled.error).toBeNull();
    const settings = await admin.rpc('get_report_email_settings');
    expect(settings.data).toMatchObject({ scheduleMode: 'weekly' });
  });

  it('rejects staff, anonymous, and malformed input', async () => {
    expect((await staff.rpc('upsert_report_recipient', { p_email: 'staff@iznik.test' })).error?.message).toMatch(/not authorized/i);
    expect((await anon.rpc('list_report_recipients')).error).not.toBeNull();
    expect((await admin.rpc('upsert_report_recipient', { p_email: 'not-an-email' })).error?.message).toMatch(/invalid email/i);
  });
});
