"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/db";
import { createDiagram } from "@/lib/diagram";
import { EXAMPLE_NAME } from "@/lib/example";

function NewDiagramInner() {
  const router = useRouter();
  const params = useSearchParams();
  const created = useRef(false);

  useEffect(() => {
    if (created.current) return;
    created.current = true;

    const folderId = params.get("folder");
    const example = params.get("example") === "1";

    async function create() {
      const diagram = createDiagram({
        name: example ? EXAMPLE_NAME : 'Untitled Diagram',
        folderId: folderId || null,
        ...(example ? { diagramType: "system-architecture" as const } : {}),
      });
      await db.diagrams.add(diagram);
      // the editor fills the example in once its canvas is ready
      router.replace(example ? `/d/${diagram.id}?example=1` : `/d/${diagram.id}`);
    }

    create();
  }, [router, params]);

  return null;
}

export default function NewDiagram() {
  return (
    <div className="flex items-center justify-center h-screen text-subtle">
      Creating diagram…
      <Suspense>
        <NewDiagramInner />
      </Suspense>
    </div>
  );
}
