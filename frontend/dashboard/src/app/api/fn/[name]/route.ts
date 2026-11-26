// Server-side pass-through to Supabase Edge Functions (avoids browser CORS).
// Forwards only the caller's Authorization header and body; adds the public anon key.
// The functions still verify the JWT and the caller's role themselves.
// Known limitation: the functions' rate limits see this server's IP, not each user's.
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED = new Set(["auth-sign-in", "staff-admin", "reports-export"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!ALLOWED.has(name)) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const headers: Record<string, string> = {
    apikey: key,
    "content-type": req.headers.get("content-type") ?? "application/json",
    authorization: req.headers.get("authorization") ?? `Bearer ${key}`,
  };
  const res = await fetch(`${base}/functions/v1/${name}`, { method: "POST", headers, body: await req.text() });
  return new NextResponse(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json",
      ...(res.headers.get("content-disposition") ? { "content-disposition": res.headers.get("content-disposition")! } : {}) },
  });
}
