// Guards for model-funded routes: kill switch, body size and a per-client rate limit.
// The limiter is process-local, which is enough for a protected single-instance preview only.
// A public multi-instance deployment needs a shared store (PROJECT-PLAN §3.1 / W11).

const WINDOW_MS = 60_000;
export const MAX_BODY_BYTES = 64 * 1024;
const hits = new Map<string, number[]>();

function limitPerMinute() {
  const n = Number(process.env.AI_RATE_LIMIT_PER_MINUTE);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

/** First hop of x-forwarded-for is only trustworthy behind a proxy that sets it (e.g. Vercel). */
function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}

export function checkRateLimit(key: string, now = Date.now(), limit = limitPerMinute()): number | null {
  const recent = (hits.get(key) ?? []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) for (const [k, times] of hits) if (!times.some(t => now - t < WINDOW_MS)) hits.delete(k);
  return null;
}

export function resetRateLimits() {
  hits.clear();
}

/** Returns an error response when the request must not reach a model provider, else the parsed JSON body. */
export async function guardAIRequest(request: Request): Promise<{ error: Response } | { body: unknown }> {
  if (process.env.AI_DISABLED === "1") {
    return { error: Response.json({ error: "AI editing is switched off right now. Manual editing and export still work." }, { status: 503 }) };
  }
  const retryAfter = checkRateLimit(clientKey(request));
  if (retryAfter !== null) {
    return { error: Response.json({ error: `Too many requests. Try again in ${retryAfter}s.` }, { status: 429, headers: { "Retry-After": String(retryAfter) } }) };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: Response.json({ error: "Request is too large." }, { status: 413 }) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: Response.json({ error: "Request body must be valid JSON." }, { status: 400 }) };
  }
}
