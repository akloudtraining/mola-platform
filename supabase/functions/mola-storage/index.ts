import { createClient } from 'npm:@supabase/supabase-js@2';

type RequestBody = {
  operation?: 'read' | 'submit_contribution' | 'review_contribution' | 'mark_activity_read';
  payload?: Record<string, unknown>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const parsed = (value: unknown): any => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
};

function validActivityEvent(snapshot: any, orgId: string, eventId: string) {
  const organization = Array.isArray(snapshot?.organizations)
    ? snapshot.organizations.find((row: any) => row?.id === orgId)
    : null;
  const org = parsed(organization?.data);
  if (!org || org.id !== orgId || org.mode !== 'Shared ownership') return false;
  const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
  const contribution = (id: string) => {
    const row = entries.find((candidate: any) => candidate?.id === id && candidate?.org_id === orgId);
    const entry = parsed(row?.data);
    return entry?.type === 'contribution' ? entry : null;
  };
  if (eventId.endsWith(':submitted')) return !!contribution(eventId.slice(0, -':submitted'.length));
  const review = eventId.match(/^(.*):review:(\d+)$/);
  if (review) {
    const entry = contribution(review[1]);
    const index = Number(review[2]);
    return !!entry && Number.isInteger(index) && index >= 0 && Array.isArray(entry.reviews) && index < entry.reviews.length;
  }
  const overdue = eventId.match(/^(.*):overdue:(\d+)$/);
  if (overdue) {
    const row = entries.find((candidate: any) => candidate?.id === overdue[1] && candidate?.org_id === orgId);
    const entry = parsed(row?.data);
    return entry?.type === 'obligation' && Number(overdue[2]) > 0;
  }
  return false;
}

async function validateActivityRead(admin: any, actor: string, payload: Record<string, unknown>) {
  const orgId = typeof payload.org_id === 'string' ? payload.org_id.trim() : '';
  const eventIds = payload.event_ids;
  if (!orgId || orgId.length > 200 || !Array.isArray(eventIds) || !eventIds.length || eventIds.length > 100 || !eventIds.every((id) => typeof id === 'string' && id.length < 500)) {
    return { error: 'Select up to 100 activity records.', status: 400 };
  }
  const snapshotResult = await admin.rpc('mola_storage_read', { p_actor: actor });
  if (snapshotResult.error) return { error: 'Storage operation failed.', status: 500 };
  const ids = [...new Set(eventIds as string[])];
  if (ids.some((id) => !validActivityEvent(snapshotResult.data, orgId, id))) {
    return { error: 'Activity changed. Refresh before marking it read.', status: 409 };
  }
  return { ids };
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'POST is required.' }, 405);

  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!token || !url || !serviceRoleKey) return json({ error: 'Storage authentication is unavailable.' }, 503);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ error: 'A valid member session is required.' }, 401);

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid storage request.' }, 400);
  }
  const actor = `supabase:${userData.user.id}`;
  if (body.operation === 'read') {
    const result = await admin.rpc('mola_storage_read', { p_actor: actor });
    if (result.error) {
      console.error('mola-storage read rpc failed', result.error.message);
      return json({ error: 'Storage operation failed.' }, 500);
    }
    return json({ data: result.data });
  }
  if (body.operation === 'submit_contribution' || body.operation === 'review_contribution') {
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return json({ error: 'A structured storage payload is required.' }, 400);
    }
    const rpcName = body.operation === 'submit_contribution'
      ? 'mola_storage_submit_contribution'
      : 'mola_storage_review_contribution';
    const result = await admin.rpc(rpcName, {
      p_actor: actor,
      p_payload: body.payload,
    });
    if (result.error) {
      console.error(`mola-storage ${body.operation} rpc failed`, result.error.message);
      return json({ error: body.operation === 'submit_contribution' ? 'Contribution was not recorded.' : 'Review was not recorded.' }, 400);
    }
    return json({ data: result.data });
  }
  if (body.operation === 'mark_activity_read') {
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return json({ error: 'A structured activity-read payload is required.' }, 400);
    }
    const validation = await validateActivityRead(admin, actor, body.payload);
    if ('error' in validation) return json({ error: validation.error }, validation.status);
    const result = await admin.rpc('mola_storage_mutate', {
      p_actor: actor,
      p_action: 'mark_read',
      p_payload: { org_id: body.payload.org_id, event_ids: validation.ids },
    });
    if (result.error) {
      console.error('mola-storage mark_activity_read rpc failed', result.error.message);
      return json({ error: 'Activity read state was not saved.' }, 400);
    }
    return json({ data: result.data });
  }
  return json({ error: 'Unsupported storage operation.' }, 400);
});
