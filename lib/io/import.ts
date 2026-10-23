import { db } from "@/lib/db";
import { createDiagram } from "@/lib/diagram";
import type { DiagramType } from "@/types/library";
import { readBackup } from "./validate";

export async function importExcalidrawFile(file: File): Promise<string> {
  const parsed = await readBackup(file);
  const { elements, files } = parsed;
  const name = file.name.replace(/\.excalidraw$/i, "") || "Imported Diagram";

  const diagram = createDiagram({ name, elements, files, generatedVia: "import" });
  await db.diagrams.add(diagram);
  return diagram.id;
}

export async function importYapDrawJSON(file: File): Promise<string> {
  const parsed = await readBackup(file);
  const { elements, files } = parsed;
  const name: string =
    typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name.trim()
      : file.name.replace(/\.json$/i, "") || "Imported Diagram";

  const validTypes: DiagramType[] = [
    "freeform",
    "system-architecture",
    "operations-flowchart",
  ];
  const diagramType: DiagramType = validTypes.includes(parsed.diagramType as DiagramType)
    ? parsed.diagramType as DiagramType
    : "freeform";

  const transcript =
    typeof parsed.transcript === "string" ? parsed.transcript : "";
  const metadata = parsed.metadata as { colorPalette?: unknown } | undefined;
  const colorPalette = Array.isArray(metadata?.colorPalette)
    ? metadata.colorPalette.filter((color): color is string => typeof color === "string")
    : [];

  const diagram = createDiagram({
    name,
    elements,
    files,
    transcript,
    diagramType,
    generatedVia: "import",
    colorPalette,
  });
  await db.diagrams.add(diagram);
  return diagram.id;
}
