// Tells the client whether the live mic can be offered, without exposing any credential.
export const dynamic = "force-dynamic";

export function GET() {
  const live = process.env.DEEPGRAM_ENABLED === "1" && Boolean(process.env.DEEPGRAM_API_KEY) && Boolean(process.env.DEEPGRAM_PROJECT_ID);
  return Response.json({ live });
}
