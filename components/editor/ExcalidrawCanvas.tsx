"use client";

import "@excalidraw/excalidraw/index.css";
import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  type ComponentProps,
} from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ExcalidrawElement, BinaryFileData } from "@/types/diagram";
import {
  mergeElements,
  prepareForConversion,
  enrichArrows,
} from "@/lib/render/excalidraw-helpers";
import { bindGeneratedArrows, repairTextElements } from "@/lib/scene/bindings";

export interface ExcalidrawCanvasHandle {
  updateDiagram: (
    elements: ExcalidrawElement[],
    opts?: { replace?: boolean; files?: BinaryFileData[] },
  ) => void;
  /** Commit a reviewed patch candidate as one native undo step; viewport is left alone. */
  applyPatch: (elements: ExcalidrawElement[], affectedIds: string[]) => void;
  getSelectedIds: () => string[];
  /** Highlight elements by selecting them; not recorded in undo history. */
  select: (ids: string[]) => void;
  getElements: () => ExcalidrawElement[];
  getFiles: () => Record<string, BinaryFileData>;
  exportThumbnail?: () => Promise<string>;
  exportPng: (name: string) => Promise<void>;
  exportSvg: (name: string) => Promise<void>;
}

const BROWSER_CANVAS_LIMIT = 16384;

function getSafeMaxDimension(): number {
  if (typeof window === "undefined") return 4096;
  const dpr = window.devicePixelRatio || 1;
  return Math.floor(BROWSER_CANVAS_LIMIT / dpr);
}

// browser tests only: NEXT_PUBLIC_E2E is inlined at build time, so production builds drop this
function exposeForE2E(
  handle: ExcalidrawCanvasHandle,
  apiRef: { current: ExcalidrawImperativeAPI | null },
): ExcalidrawCanvasHandle {
  if (process.env.NEXT_PUBLIC_E2E === "1" && typeof window !== "undefined") {
    Object.assign(window, { __saysketch: { handle, api: () => apiRef.current } });
  }
  return handle;
}

function isNativeFormat(el: Record<string, unknown>): boolean {
  return el.version != null || el.versionNonce != null;
}

interface Props {
  initialElements?: ExcalidrawElement[];
  initialFiles?: Record<string, BinaryFileData>;
  onChange?: (elements: ExcalidrawElement[]) => void;
  onSelectionChange?: (ids: string[]) => void;
}

const ExcalidrawCanvas = forwardRef<ExcalidrawCanvasHandle, Props>(
  ({ initialElements, initialFiles, onChange, onSelectionChange }, ref) => {
    const [Excalidraw, setExcalidraw] = useState<
      typeof import("@excalidraw/excalidraw").Excalidraw | null
    >(null);
    const [convertToExcalidrawElements, setConvertToExcalidrawElements] =
      useState<
        | typeof import("@excalidraw/excalidraw").convertToExcalidrawElements
        | null
      >(null);
    const [exportToBlob, setExportToBlob] = useState<
      typeof import("@excalidraw/excalidraw").exportToBlob | null
    >(null);
    const [exportToSvg, setExportToSvg] = useState<
      typeof import("@excalidraw/excalidraw").exportToSvg | null
    >(null);
    const excalidrawModRef = useRef<typeof import("@excalidraw/excalidraw") | null>(null);

    const initialDataRef = useRef<
      | {
          elements: ExcalidrawElement[];
          files?: Record<string, BinaryFileData>;
        }
      | undefined
    >(undefined);
    const [hasMountedWithData, setHasMountedWithData] = useState(false);
    const [safeMax, setSafeMax] = useState(4096);
    const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      setSafeMax(getSafeMaxDimension());
    }, []);

    useEffect(() => {
      return () => {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      };
    }, []);

    useEffect(() => {
      if (!hasMountedWithData || !initialDataRef.current?.elements?.length)
        return;
      scrollTimeoutRef.current = setTimeout(() => {
        scrollTimeoutRef.current = null;
        apiRef.current?.scrollToContent(undefined, {
          fitToContent: true,
          animate: false,
        });
      }, 100);
      return () => {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      };
    }, [hasMountedWithData]);

    useEffect(() => {
      import("@excalidraw/excalidraw").then((mod) => {
        excalidrawModRef.current = mod;
        if (initialElements && initialElements.length > 0) {
          const elements = isNativeFormat(
            initialElements[0] as Record<string, unknown>,
          )
            ? repairTextElements(initialElements)
            : mod.convertToExcalidrawElements(
                initialElements as Parameters<
                  typeof mod.convertToExcalidrawElements
                >[0],
                { regenerateIds: false },
              );
          initialDataRef.current = { elements, files: initialFiles };
        }
        setExcalidraw(() => mod.Excalidraw);
        setConvertToExcalidrawElements(() => mod.convertToExcalidrawElements);
        setExportToBlob(() => mod.exportToBlob);
        setExportToSvg(() => mod.exportToSvg);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only excalidraw import
    }, []);

    useImperativeHandle(ref, () => exposeForE2E({
      updateDiagram(
        incoming: ExcalidrawElement[],
        {
          replace = false,
          files = [],
        }: { replace?: boolean; files?: BinaryFileData[] } = {},
      ) {
        if (!apiRef.current || !convertToExcalidrawElements) return;

        // addFiles before updateScene so image els resolve
        if (files.length > 0) {
          const fileMap: Record<string, unknown> = {};
          for (const f of files) fileMap[f.id] = f;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          apiRef.current.addFiles(fileMap as any);
        }

        // native elements (version/versionNonce): skip convert — preserves bindings + z-order
        if (
          incoming.length === 0 ||
          isNativeFormat(incoming[0] as Record<string, unknown>)
        ) {
          incoming = repairTextElements(incoming);
          if (replace) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            apiRef.current.updateScene({ elements: incoming as any });
          } else {
            const existing = [
              ...apiRef.current.getSceneElements(),
            ] as ExcalidrawElement[];
            const merged = mergeElements(existing, incoming);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            apiRef.current.updateScene({ elements: merged as any });
          }
          apiRef.current.scrollToContent(undefined, {
            fitToContent: true,
            animate: true,
            duration: 400,
          });
          return;
        }

        const prepared = prepareForConversion(incoming);

        // layout arrows: native x/y/points — convert breaks bindings; shapes still need convert for labels
        const isLinear = (el: ExcalidrawElement) =>
          el.type === "arrow" || el.type === "line";
        const shapes = prepared.filter((el) => !isLinear(el));
        const arrows = prepared.filter((el) => isLinear(el));

        const convertedShapes = convertToExcalidrawElements(
          shapes as Parameters<typeof convertToExcalidrawElements>[0],
          { regenerateIds: false },
        ).map((el) =>
          // convert leaves bound text top-aligned
          el.type === "text" && (el as Record<string, unknown>).containerId
            ? { ...el, textAlign: "center", verticalAlign: "middle" }
            : el,
        );
        const enrichedArrows = enrichArrows(arrows);
        // bind both sides after shape conversion so arrows follow dragged nodes
        const allElements = bindGeneratedArrows([
          ...convertedShapes,
          ...enrichedArrows,
        ] as ExcalidrawElement[]);

        // drop stale fractional index so merge keeps bound children after containers
        const stripIndex = (els: ExcalidrawElement[]) =>
          els.map((el) => {
            const copy = { ...el };
            delete (copy as Record<string, unknown>).index;
            return copy as ExcalidrawElement;
          });

        if (replace) {
          apiRef.current.updateScene({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            elements: stripIndex(allElements) as any,
          });
        } else {
          const existing = [
            ...apiRef.current.getSceneElements(),
          ] as ExcalidrawElement[];
          const merged = mergeElements(existing, allElements);
          apiRef.current.updateScene({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            elements: stripIndex(merged) as any,
          });
        }

        apiRef.current.scrollToContent(undefined, {
          fitToContent: true,
          animate: true,
          duration: 400,
        });
      },

      applyPatch(incoming, affectedIds) {
        const api = apiRef.current;
        const mod = excalidrawModRef.current;
        if (!api || !mod) throw new Error("The canvas is not ready yet.");
        // re-measure only patched labels; unrelated elements pass through untouched
        const affected = new Set(affectedIds);
        const byId = new Map(incoming.map((el) => [el.id, el]));
        const texts = incoming.filter((el) => affected.has(el.id) && el.type === "text" && el.containerId && !el.isDeleted);
        const refreshed = new Map(
          mod.restoreElements(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [...texts, ...texts.map((t) => byId.get(t.containerId)).filter(Boolean)] as any,
            null,
            { refreshDimensions: true },
          ).filter((el) => affected.has(el.id)).map((el) => [el.id, el as unknown as ExcalidrawElement]),
        );
        api.updateScene({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          elements: incoming.map((el) => refreshed.get(el.id) ?? el) as any,
          captureUpdate: mod.CaptureUpdateAction.IMMEDIATELY,
        });
      },

      getSelectedIds() {
        const selected = apiRef.current?.getAppState().selectedElementIds ?? {};
        return Object.keys(selected).filter((id) => selected[id]);
      },

      select(ids) {
        const api = apiRef.current;
        const mod = excalidrawModRef.current;
        if (!api || !mod) return;
        api.updateScene({
          appState: { selectedElementIds: Object.fromEntries(ids.map((id) => [id, true as const])) },
          captureUpdate: mod.CaptureUpdateAction.NEVER,
        });
      },

      getElements() {
        if (!apiRef.current) return [];
        return [...apiRef.current.getSceneElements()] as ExcalidrawElement[];
      },

      getFiles() {
        if (!apiRef.current) return {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return apiRef.current.getFiles() as any as Record<
          string,
          BinaryFileData
        >;
      },

      async exportPng(name: string) {
        if (!apiRef.current || !exportToBlob) return;
        const elements = apiRef.current.getSceneElements();
        if (elements.length === 0) return;
        const blob = await exportToBlob({
          elements: elements as Parameters<typeof exportToBlob>[0]["elements"],
          appState: {
            exportBackground: true,
            exportWithDarkMode: false,
          } as Parameters<typeof exportToBlob>[0]["appState"],
          files: apiRef.current.getFiles(),
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.png`;
        a.click();
        URL.revokeObjectURL(url);
      },

      async exportSvg(name: string) {
        if (!apiRef.current || !exportToSvg) return;
        const elements = apiRef.current.getSceneElements();
        if (elements.length === 0) return;
        const svg = await exportToSvg({
          elements: elements as Parameters<typeof exportToSvg>[0]["elements"],
          appState: {
            exportBackground: true,
            exportWithDarkMode: false,
          } as Parameters<typeof exportToSvg>[0]["appState"],
          files: apiRef.current.getFiles(),
        });
        const serialized = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([serialized], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${name}.svg`;
        a.click();
        URL.revokeObjectURL(url);
      },

      async exportThumbnail() {
        if (!apiRef.current || !exportToBlob) return "";
        try {
          const elements = apiRef.current.getSceneElements();
          if (elements.length === 0) return "";
          const blob = await exportToBlob({
            elements: elements as Parameters<
              typeof exportToBlob
            >[0]["elements"],
            appState: {
              exportBackground: true,
              exportWithDarkMode: false,
            } as Parameters<typeof exportToBlob>[0]["appState"],
            files: apiRef.current.getFiles(),
            getDimensions: (width: number, height: number) => {
              const scale = Math.min(400 / width, 300 / height, 1);
              return {
                width: Math.round(width * scale),
                height: Math.round(height * scale),
                scale,
              };
            },
          });
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch {
          return "";
        }
      },
    }, apiRef));

    const selectionKeyRef = useRef("");
    const handleChange = useCallback(
      (elements: readonly { id: string }[], appState: { selectedElementIds: Readonly<Record<string, true>> }) => {
        if (!apiRef.current) return;
        onChange?.([...elements] as ExcalidrawElement[]);
        // onChange fires on every pointer move; report selection only when it changes
        const ids = Object.keys(appState.selectedElementIds).sort();
        const key = ids.join(",");
        if (key !== selectionKeyRef.current) {
          selectionKeyRef.current = key;
          onSelectionChange?.(ids);
        }
      },
      [onChange, onSelectionChange],
    );

    const wrapperStyle = {
      width: "100%",
      height: "100%",
      minWidth: 0,
      minHeight: 0,
      maxWidth: safeMax,
      maxHeight: safeMax,
      position: "relative" as const,
      overflow: "hidden" as const,
    };

    if (!Excalidraw) {
      return (
        <div
          className="flex items-center justify-center bg-white w-full h-full self-stretch"
          style={wrapperStyle}
        >
          <span className="text-[#94A3B8]">Loading canvas…</span>
        </div>
      );
    }

    return (
      <div
        className="excalidraw-wrapper w-full h-full self-stretch"
        style={wrapperStyle}
      >
        <Excalidraw
          initialData={
            initialDataRef.current as ComponentProps<
              typeof Excalidraw
            >["initialData"]
          }
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
            apiRef.current = api;
            setHasMountedWithData(true);
          }}
          onChange={handleChange}
          theme="light"
          UIOptions={{ canvasActions: { export: false, saveAsImage: false } }}
        />
      </div>
    );
  },
);

ExcalidrawCanvas.displayName = "ExcalidrawCanvas";
export default ExcalidrawCanvas;
