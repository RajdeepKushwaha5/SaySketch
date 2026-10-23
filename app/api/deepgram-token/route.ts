import { guardRequestRate } from '@/lib/server/guard'

// Mints provider keys, so it is off unless explicitly enabled (and should sit behind access protection when it is).
export async function GET(request: Request) {
  if (process.env.DEEPGRAM_ENABLED !== '1') return Response.json({ error: 'Not found' }, { status: 404 })
  const limited = await guardRequestRate(request, 'deepgram')
  if (limited) return limited
  const apiKey = process.env.DEEPGRAM_API_KEY
  const projectId = process.env.DEEPGRAM_PROJECT_ID
  if (!apiKey) return Response.json({ error: 'DEEPGRAM_API_KEY not set' }, { status: 500 })
  if (!projectId) return Response.json({ error: 'DEEPGRAM_PROJECT_ID not set' }, { status: 500 })

  let res: Response
  try { res = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      comment: 'tmp',
      scopes: ['usage:write'],
      time_to_live_in_seconds: 10,
    }),
  }) } catch { return Response.json({ error: 'Speech service unavailable. Try again.' }, { status: 502 }) }

  if (!res.ok) {
    return Response.json({ error: 'Speech service unavailable. Check the server configuration.' }, { status: 502 })
  }

  const { key } = await res.json()
  return Response.json({ key })
}
