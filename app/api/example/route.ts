import { EXAMPLE_GRAPH, EXAMPLE_NAME } from "@/lib/example";
import { layoutGraph } from "@/lib/render/layout";
import { fetchIcons } from "@/lib/render/icons";

// Static: laid out once at build time. No model call, so no credits and no rate limit needed.
export const dynamic = "force-static";

export function GET() {
  const { elements, iconRequests } = layoutGraph(EXAMPLE_GRAPH);
  return Response.json({ name: EXAMPLE_NAME, graph: EXAMPLE_GRAPH, elements, files: fetchIcons(iconRequests) });
}
