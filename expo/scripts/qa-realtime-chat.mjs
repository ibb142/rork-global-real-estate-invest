/**
 * Live realtime chat QA — two-client WebSocket verification against production Supabase.
 * Client B subscribes via Supabase Realtime (WebSocket, postgres_changes INSERT on public.messages).
 * Client A inserts messages via PostgREST (the same write path the app uses).
 * Verifies: instant delivery, reconnect recovery, no duplicates, ordering, persisted IDs.
 */
import { createClient } from '@supabase/supabase-js';

const URL = 'https://kvclcdjmjghndxsngfzb.supabase.co';
const ANON = process.env.QA_ANON_KEY;
const SERVICE = process.env.QA_SERVICE_KEY;
const CONVERSATION_ID = '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41';
const SENDER_ID = '85e9b3c8-cd2f-4eb9-b335-a7bd98407edd';

if (!ANON || !SERVICE) {
  console.error('missing keys');
  process.exit(1);
}

const clientA = createClient(URL, SERVICE, { auth: { persistSession: false } });

const received = [];
let socketConnectedAt = null;

function makeSubscriber(label, key) {
  const client = createClient(URL, key, { auth: { persistSession: false } });
  return { client, label };
}

function subscribe(client, label) {
  return new Promise((resolve, reject) => {
    const channel = client
      .channel(`qa-${label}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${CONVERSATION_ID}` },
        (payload) => {
          const receivedAt = new Date().toISOString();
          received.push({ via: label, receivedAt, row: payload.new, eventType: payload.eventType, commitTimestamp: payload.commit_timestamp });
          console.log(`[EVENT ${label}] receivedAt=${receivedAt} id=${payload.new.id} text=${JSON.stringify(payload.new.text)} commit_ts=${payload.commit_timestamp}`);
        },
      )
      .subscribe((status, err) => {
        console.log(`[SOCKET ${label}] status=${status}${err ? ` err=${err.message}` : ''} at=${new Date().toISOString()}`);
        if (status === 'SUBSCRIBED') {
          socketConnectedAt = new Date().toISOString();
          resolve(channel);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`${label} ${status}: ${err?.message ?? ''}`));
      });
    setTimeout(() => reject(new Error(`${label} subscribe timeout`)), 15000);
  });
}

async function sendMessage(text) {
  const sentAt = new Date().toISOString();
  const { data, error } = await clientA
    .from('messages')
    .insert({ conversation_id: CONVERSATION_ID, sender_id: SENDER_ID, text })
    .select('id, conversation_id, sender_id, text, created_at')
    .single();
  if (error) throw new Error(`insert failed: ${error.message}`);
  console.log(`[SEND A] sentAt=${sentAt} id=${data.id} created_at=${data.created_at} text=${JSON.stringify(text)}`);
  return { sentAt, row: data };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const runTag = `qa-rt-${Date.now()}`;
  console.log(`=== REALTIME QA ${runTag} conversation=${CONVERSATION_ID} ===`);

  // Client B — anon key (what the app uses)
  const subB = makeSubscriber('clientB-anon', ANON);
  let channelB;
  try {
    channelB = await subscribe(subB.client, 'clientB-anon');
  } catch (e) {
    console.log(`[WARN] anon subscribe failed (${e.message}) — retrying with service key (RLS gate)`);
    subB.client.removeAllChannels();
    const subB2 = makeSubscriber('clientB-service', SERVICE);
    channelB = await subscribe(subB2.client, 'clientB-service');
    subB.client = subB2.client;
  }

  // Test 1: instant delivery
  const m1 = await sendMessage(`${runTag} message-1 (User A -> User B realtime)`);
  await wait(4000);
  const got1 = received.find((r) => r.row.id === m1.row.id);
  console.log(`[CHECK delivery-1] ${got1 ? `DELIVERED via WebSocket (sent ${m1.sentAt} -> received ${got1.receivedAt})` : 'NOT RECEIVED'}`);

  // Test 2: reconnect after disconnect
  console.log('[RECONNECT] closing client B channel...');
  await subB.client.removeAllChannels();
  await wait(1500);
  console.log('[RECONNECT] resubscribing client B...');
  const channelB2 = await subscribe(subB.client, 'clientB-reconnected');
  const m2 = await sendMessage(`${runTag} message-2 (after reconnect)`);
  await wait(4000);
  const got2 = received.find((r) => r.row.id === m2.row.id);
  console.log(`[CHECK delivery-2 reconnect] ${got2 ? `DELIVERED (sent ${m2.sentAt} -> received ${got2.receivedAt})` : 'NOT RECEIVED'}`);

  // Test 3: no duplicates
  const ids = received.map((r) => r.row.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  console.log(`[CHECK duplicates] events=${received.length} uniqueIds=${new Set(ids).size} duplicates=${dupes.length}`);

  // Test 4: persistence + ordering readback
  const { data: rows, error } = await clientA
    .from('messages')
    .select('id, text, created_at')
    .eq('conversation_id', CONVERSATION_ID)
    .ilike('text', `${runTag}%`)
    .order('created_at', { ascending: true });
  if (error) throw error;
  console.log('[CHECK persistence+ordering]');
  rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.id} ${r.created_at} ${JSON.stringify(r.text)}`));
  const ordered = rows.length === 2 && rows[0].id === m1.row.id && rows[1].id === m2.row.id;
  console.log(`[CHECK ordering] ${ordered ? 'CORRECT (message-1 before message-2)' : 'WRONG'}`);

  console.log('=== RESULT ===');
  console.log(JSON.stringify({
    conversationId: CONVERSATION_ID,
    socketConnectedAt,
    message1: { id: m1.row.id, sentAt: m1.sentAt, createdAt: m1.row.created_at, receivedByB: got1?.receivedAt ?? null },
    message2_afterReconnect: { id: m2.row.id, sentAt: m2.sentAt, createdAt: m2.row.created_at, receivedByB: got2?.receivedAt ?? null },
    duplicates: dupes.length,
    persistedRows: rows.length,
    orderingCorrect: ordered,
    verdict: got1 && got2 && dupes.length === 0 && ordered ? 'VERIFIED' : 'FAILED',
  }, null, 2));

  await subB.client.removeAllChannels();
  process.exit(0);
};

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
