// Guards for model-funded routes: kill switch, body size and a per-client rate limit.
// With UPSTASH_REDIS_REST_URL/TOKEN set, the limit is shared across serverless instances (public deploys).
// Without shared configuration, a process-local limiter applies to local/protected previews only.
// When shared limiting is configured, an outage must block funded calls rather than weaken protection.

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

/**
 * Fixed one-minute window counted in Upstash Redis via its REST pipeline.
 * Returns seconds to wait when limited, null when allowed, undefined when not configured or unavailable.
 */
export async function checkSharedRateLimit(key: string, now = Date.now(), limit = limitPerMinute()): Promise<number | null | undefined> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  const window = Math.floor(now / WINDOW_MS);
  const redisKey = `saysketch:rl:${key}:${window}`;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", redisKey], ["EXPIRE", redisKey, String(Math.ceil(WINDOW_MS / 1000) + 5)]]),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return undefined;
    const [incr, expiry] = (await res.json()) as { result?: unknown }[];
    const count = Number(incr?.result);
    if (!Number.isInteger(count) || count < 1 || expiry?.result !== 1) return undefined;
    return count > limit ? Math.ceil(((window + 1) * WINDOW_MS - now) / 1000) : null;
  } catch {
    return undefined;
  }
}

/** Returns an error response when the request must not reach a model provider, else the parsed JSON body. */
export async function guardRequestRate(request: Request, namespace = "ai"): Promise<Response | null> {
  const key = `${namespace}:${clientKey(request)}`;
  const shared = await checkSharedRateLimit(key);
  if (shared === undefined && (process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_TOKEN)) {
    return Response.json({ error: "The service is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  const retryAfter = shared === undefined ? checkRateLimit(key) : shared;
  if (retryAfter !== null) {
    return Response.json({ error: `Too many requests. Try again in ${retryAfter}s.` }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  return null;
}

export async function guardAIRequest(request: Request): Promise<{ error: Response } | { body: unknown }> {
  if (process.env.AI_DISABLED === "1") {
    return { error: Response.json({ error: "AI editing is switched off right now. Manual editing and export still work." }, { status: 503 }) };
  }
  const limited = await guardRequestRate(request);
  if (limited) return { error: limited };
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel();
          return { error: Response.json({ error: "Request is too large." }, { status: 413 }) };
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    }
    return { body: JSON.parse(text) };
  } catch {
    return { error: Response.json({ error: "Request body must be valid JSON." }, { status: 400 }) };
  } finally {
    reader?.releaseLock();
  }
}
