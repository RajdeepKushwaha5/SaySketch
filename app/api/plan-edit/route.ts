import { guardAIRequest } from "@/lib/server/guard";
import { modelOptions, resolveClient, type ProviderConfig } from "@/lib/ai/llm";
import { parseModelJSON, parsePlannerContext, plannerMessages, validatePlan, type PlannerContext } from "@/lib/ai/plan";

export const maxDuration = 30;

const MAX_INSTRUCTION = 2000;

// Logs carry status/category only — never prompts, diagram content or keys.
function providerError(err: unknown, serverFunded: boolean): Response {
  const status = (err as { status?: number })?.status;
  const name = err instanceof Error ? err.name : "unknown";
  console.error("plan-edit provider error", { status, name });
  if (status === 401 || status === 403) {
    return serverFunded
      ? Response.json({ error: "The AI service is not available right now." }, { status: 503 })
      : Response.json({ error: "Your API key was rejected. Check it in Settings, or clear it to use the shared model." }, { status: 401 });
  }
  if (status === 429) return Response.json({ error: "The AI provider is busy. Try again in a moment." }, { status: 429 });
  if (name.includes("Timeout")) return Response.json({ error: "The AI took too long. Your diagram is unchanged — try again." }, { status: 504 });
  return Response.json({ error: "The AI service failed. Your diagram is unchanged — try again." }, { status: 502 });
}

export async function POST(request: Request) {
  const guarded = await guardAIRequest(request);
  if ("error" in guarded) return guarded.error;
  const body = (guarded.body ?? {}) as { instruction?: unknown; context?: unknown; providerConfig?: ProviderConfig };

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!instruction || instruction.length > MAX_INSTRUCTION) {
    return Response.json({ error: `Instruction must be 1–${MAX_INSTRUCTION} characters.` }, { status: 400 });
  }
  let context: PlannerContext;
  try {
    context = parsePlannerContext(body.context);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Invalid diagram context." }, { status: 400 });
  }
  if (!body.providerConfig?.apiKey && !process.env.GROQ_API_KEY) {
    return Response.json({ error: "AI is not configured on this server. Add your own key in Settings." }, { status: 503 });
  }
  let resolved: ReturnType<typeof resolveClient>;
  try {
    resolved = resolveClient(body.providerConfig);
  } catch {
    return Response.json({ error: "Unsupported provider." }, { status: 400 });
  }
  const { client, model, serverFunded } = resolved;

  // One corrective retry: the validation error is fed back so the model can fix references or format.
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = plannerMessages(instruction, context);
  // JSON mode is requested only for the server model; if the provider rejects it (400), drop it once and rely on validation.
  let jsonMode = serverFunded;
  for (let attempt = 0; attempt < 2; attempt++) {
    let content = "";
    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages,
          temperature: 0,
          max_tokens: 1500,
          ...modelOptions(model),
          ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        },
        { timeout: 20_000, maxRetries: 1 },
      );
      content = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      if (jsonMode && (err as { status?: number })?.status === 400) {
        jsonMode = false;
        attempt--;
        continue;
      }
      return providerError(err, serverFunded);
    }
    try {
      return Response.json(validatePlan(parseModelJSON(content), context));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Invalid reply.";
      console.error("plan-edit invalid model reply", { attempt, reason });
      messages.push({ role: "assistant", content }, { role: "user", content: `That reply was rejected: ${reason} Reply again with one valid JSON object only.` });
    }
  }
  return Response.json({ error: "The AI could not produce a valid change. Try rephrasing, or select the elements you mean." }, { status: 502 });
}
