// M7 concurrency suite (BACKEND_PLAN.md §16): real parallel DB connections against the local stack.
//   1. N parallel redeems of one claim (different keys)  -> exactly 1 success, rest ALREADY_REDEEMED
//   2. N parallel redeems of one claim (same key)        -> 1 original, rest replays of the same row
//   3. M customers race for an offer with total limit L  -> exactly L successes, total_redeemed = L
// Needs DB_URL (supabase status -o env). Local instance only: fixtures are throwaway rows.
import postgres from "npm:postgres@3.4.4";

const DB_URL = Deno.env.get("DB_URL");
if (!DB_URL) throw new Error("DB_URL missing");
const N = Number(Deno.env.get("CONCURRENCY_N") ?? "20");
const M = Number(Deno.env.get("CONCURRENCY_M") ?? "12");
const L = Number(Deno.env.get("CONCURRENCY_LIMIT") ?? "3");

const sql = postgres(DB_URL, { max: Math.max(N, M) + 2, onnotice: () => {} });
let failed = 0;
function check(name: string, ok: boolean, info: unknown) {
  console.log(`${ok ? "ok    " : "FAIL  "} ${name} ${ok ? "" : JSON.stringify(info)}`);
  if (!ok) failed++;
}

const uuid = () => crypto.randomUUID();
const rndPhone = () => "9197" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

type Actor = { uid: string; sid: string };
async function as<T>(a: Actor, q: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.uid, role: "authenticated", session_id: a.sid })}, true)`;
    return await q(tx);
  }) as T;
}

async function user(meta: Record<string, unknown>, app: Record<string, unknown>): Promise<Actor> {
  const a = { uid: uuid(), sid: uuid() };
  await sql`insert into auth.users (id, phone, raw_user_meta_data, raw_app_meta_data)
            values (${a.uid}, ${rndPhone()}, ${sql.json(meta)}, ${sql.json(app)})`;
  await sql`insert into auth.sessions (id, user_id) values (${a.sid}, ${a.uid})`;
  return a;
}

// ---------------------------------------------------------------- fixtures
const biz = uuid();
await sql`insert into public.businesses (id, slug, name, timezone)
          values (${biz}, ${"conc-" + biz.slice(0, 8)}, 'Concurrency Biz', 'UTC')`;
const owner = await user({ full_name: "Conc Owner" }, { account_type: "staff" });
const exec = await user({ full_name: "Conc Exec" }, { account_type: "staff" });
await sql`select private.grant_role(${owner.uid}, 'owner', null, null)`;
await sql`select private.grant_role(${exec.uid}, 'executive', ${biz}, null)`;
await sql`insert into public.staff (user_id, business_id, display_name) values (${exec.uid}, ${biz}, 'Conc Exec')`;
const batch = uuid();
await sql`insert into public.card_batches (id, label, quantity, created_by) values (${batch}, 'concurrency', ${M + 1}, ${owner.uid})`;

async function customer(i: number): Promise<Actor> {
  const c = await user({ full_name: `Conc Cust ${i}` }, {});
  await sql`update public.profiles set membership_status = 'active' where id = ${c.uid}`;
  await sql`insert into public.cards (batch_id, card_number, token_hash, status, current_customer_id)
            values (${batch}, ${"T-CONC-" + c.uid.slice(0, 8)}, ${new TextEncoder().encode(c.uid)}, 'active', ${c.uid})`;
  return c;
}
async function offer(total: number | null, perCustomer: number | null): Promise<string> {
  const id = uuid();
  await sql`insert into public.offers (id, business_id, title, status, starts_at, max_uses_per_customer, total_usage_limit)
            values (${id}, ${biz}, 'conc', 'active', now() - interval '1 day', ${perCustomer}, ${total})`;
  return id;
}
async function claim(c: Actor, offerId: string): Promise<string> {
  const r = await as(c, (tx) => tx`select api.create_claim_token(${offerId}) as r`);
  return r[0].r.qr_payload as string;
}
async function redeem(payload: string, key: string) {
  try {
    const r = await as(exec, (tx) => tx`select api.redeem_claim(${payload}, ${key}) as r`);
    return { ok: true, r: r[0].r };
  } catch (e) {
    return { ok: false, code: (e as { message?: string }).message };
  }
}

// ---------------------------------------------------------------- 1. one claim, N different keys
{
  const c = await customer(0);
  const o = await offer(null, null);
  const p = await claim(c, o);
  const res = await Promise.all(Array.from({ length: N }, (_, i) => redeem(p, `conc-diff-${i}-${uuid().slice(0, 8)}`)));
  const wins = res.filter((x) => x.ok).length;
  const others = res.filter((x) => !x.ok).map((x) => x.code);
  check(`${N} parallel redeems of one claim -> exactly 1 success`, wins === 1, { wins, others });
  check("losers all get ALREADY_REDEEMED", others.every((c) => c === "ALREADY_REDEEMED"), others);
  const [row] = await sql`select count(*)::int n from public.redemptions where offer_id = ${o}`;
  const [off] = await sql`select total_redeemed from public.offers where id = ${o}`;
  check("one redemption row, total_redeemed = 1", row.n === 1 && off.total_redeemed === 1, { row, off });
}

// ---------------------------------------------------------------- 2. one claim, N requests with the same key
{
  const c = await customer(1);
  const o = await offer(null, null);
  const p = await claim(c, o);
  const key = `conc-same-${uuid().slice(0, 8)}`;
  const res = await Promise.all(Array.from({ length: N }, () => redeem(p, key)));
  const ok = res.filter((x) => x.ok);
  const ids = new Set(ok.map((x) => x.r.redemption_id));
  const originals = ok.filter((x) => x.r.replayed === false).length;
  check(`${N} parallel same-key redeems all succeed`, ok.length === N, res.filter((x) => !x.ok).map((x) => x.code));
  check("exactly 1 original, rest replay the same redemption", originals === 1 && ids.size === 1, { originals, ids: ids.size });
}

// ---------------------------------------------------------------- 3. total limit under parallel load
{
  const o = await offer(L, null);
  const custs = await Promise.all(Array.from({ length: M }, (_, i) => customer(10 + i)));
  const payloads = [];
  for (const c of custs) payloads.push(await claim(c, o));
  const res = await Promise.all(payloads.map((p, i) => redeem(p, `conc-lim-${i}-${uuid().slice(0, 8)}`)));
  const wins = res.filter((x) => x.ok).length;
  const others = res.filter((x) => !x.ok).map((x) => x.code);
  check(`${M} customers race for total limit ${L} -> exactly ${L} successes`, wins === L, { wins, others });
  check("losers get OFFER_LIMIT_REACHED", others.every((c) => c === "OFFER_LIMIT_REACHED"), others);
  const [off] = await sql`select total_redeemed from public.offers where id = ${o}`;
  check(`total_redeemed = ${L}`, off.total_redeemed === L, off);
}

await sql.end();
console.log(failed === 0 ? "concurrency suite: all passed" : `concurrency suite: ${failed} failed`);
Deno.exit(failed === 0 ? 0 : 1);
