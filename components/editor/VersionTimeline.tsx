"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  IconArrowBackUp,
  IconX,
} from "@tabler/icons-react";
import { useVersionHistory } from "@/hooks/editor/useVersionHistory";
import { decodeAIMeta } from "@/lib/versionMeta";
import type { ExcalidrawCanvasHandle } from "@/components/editor/ExcalidrawCanvas";
import type { ExcalidrawElement } from "@/types/diagram";
import type { DiagramVersion } from "@/types/library";
import { relativeTime } from "@/lib/utils";

export interface VersionTimelineHandle {
  navigatePrev: () => void;
  navigateNext: () => void;
}

interface Props {
  diagramId: string;
  canvasRef: React.RefObject<ExcalidrawCanvasHandle | null>;
  onRestoreAnimation: () => void;
  pauseSave: (liveElements: ExcalidrawElement[]) => void;
  resumeSave: () => void;
  disabled?: boolean;
  onPreviewChange?: (viewing: boolean) => void;
}

function versionLabel(v: DiagramVersion): string | null {
  const meta = decodeAIMeta(v.label);
  if (meta) return meta.prompt;
  if (v.label && v.label !== "Before restore") return v.label;
  return null;
}

const VersionTimeline = forwardRef<VersionTimelineHandle, Props>(
  function VersionTimeline(
    { diagramId, canvasRef, onRestoreAnimation, pauseSave, resumeSave, disabled, onPreviewChange },
    ref,
  ) {
    const { versions, restoreVersion } = useVersionHistory(diagramId);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isViewing, setIsViewing] = useState(false);
    const liveSnapshotRef = useRef<ExcalidrawElement[] | null>(null);
    useEffect(() => { onPreviewChange?.(isViewing); }, [isViewing, onPreviewChange]);

    const [, setTick] = useState(0);
    useEffect(() => {
      // re-render for relativeTime() labels
      const id = setInterval(() => setTick((t) => t + 1), 30000);
      return () => clearInterval(id);
    }, []);

    const handleCancelView = useCallback(() => {
      if (liveSnapshotRef.current) {
        canvasRef.current?.updateDiagram(liveSnapshotRef.current, {
          replace: true,
        });
      }
      resumeSave();
      canvasRef.current?.setReadOnly(false);
      setSelectedId(null);
      setIsViewing(false);
      liveSnapshotRef.current = null;
    }, [canvasRef, resumeSave]);

    const handleSelect = useCallback(
      (v: DiagramVersion) => {
        if (disabled) return;
        if (selectedId === v.id) {
          handleCancelView();
          return;
        }
        if (!isViewing) {
          const live = canvasRef.current?.getElements() ?? [];
          liveSnapshotRef.current = live;
          pauseSave(live);
        }
        setSelectedId(v.id);
        setIsViewing(true);
        canvasRef.current?.setReadOnly(true);
        canvasRef.current?.updateDiagram(v.elements as ExcalidrawElement[], {
          replace: true,
          files: Object.values(v.files ?? {}),
        });
      },
      [selectedId, isViewing, canvasRef, pauseSave, handleCancelView, disabled],
    );

    const handleRevert = async (versionId: string) => {
      const target = versions.find((v) => v.id === versionId);
      if (!target) return;
      if (!isViewing) {
        canvasRef.current?.updateDiagram(
          target.elements as ExcalidrawElement[],
          { replace: true, files: Object.values(target.files ?? {}) },
        );
      }
      resumeSave();
      await restoreVersion(versionId);
      canvasRef.current?.setReadOnly(false);
      onRestoreAnimation();
      setSelectedId(null);
      setIsViewing(false);
      liveSnapshotRef.current = null;
    };

    useEffect(() => {
      if (!isViewing) return;
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") handleCancelView();
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [isViewing, handleCancelView]);

    useImperativeHandle(
      ref,
      () => ({
        navigatePrev() {
          if (versions.length === 0) return;
          if (!selectedId) {
            if (versions.length > 1) handleSelect(versions[1]);
            return;
          }
          const idx = versions.findIndex((v) => v.id === selectedId);
          if (idx < versions.length - 1) handleSelect(versions[idx + 1]);
        },
        navigateNext() {
          if (!selectedId) return;
          const idx = versions.findIndex((v) => v.id === selectedId);
          if (idx === 0) handleCancelView();
          else handleSelect(versions[idx - 1]);
        },
      }),
      [versions, selectedId, handleSelect, handleCancelView],
    );

    const selectedVersion = selectedId
      ? versions.find((v) => v.id === selectedId)
      : null;
    const selectedDisplayNum = selectedVersion
      ? versions.length - versions.findIndex((v) => v.id === selectedVersion.id)
      : 0;

    if (versions.length === 0) {
      return (
        <div className="px-5 pt-4 pb-1 flex items-center gap-2">
          <span className="section-label">History</span>
          <span className="text-[12px] text-placeholder">appears as you edit</span>
        </div>
      );
    }

    return (
      <div>
        <div className="px-5 pt-4 pb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="section-label">History</span>
            <span className="text-[11px] font-semibold text-muted bg-surface px-1.5 rounded-full tabular-nums">
              {versions.length}
            </span>
          </div>
          {isViewing && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Previewing
            </span>
          )}
        </div>

        {/* newest first; the current version is solid ink, the previewed one is highlighted */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto px-5 pb-2 pt-0.5 hide-scrollbar"
          style={{ scrollbarWidth: "none" }}
        >
          {versions.map((v, i, arr) => {
            const displayNum = arr.length - i;
            const isSelected = v.id === selectedId;
            const isCurrent = i === 0;
            return (
              <button
                key={v.id}
                disabled={disabled}
                onClick={() => handleSelect(v)}
                title={`Version ${displayNum} \u00b7 ${relativeTime(v.savedAt)} \u00b7 ${v.elements.length} elements${versionLabel(v) ? ` \u00b7 ${versionLabel(v)}` : ""}`}
                className={`shrink-0 h-7 px-2.5 rounded-lg text-[12px] font-semibold tabular-nums transition-all ${
                  isSelected
                    ? "bg-[#ffd84a] text-foreground shadow-[0_0_0_2px_var(--foreground)]"
                    : isCurrent
                      ? "bg-foreground text-paper"
                      : "bg-paper text-muted hover:text-foreground shadow-[0_1px_0_rgba(26,23,20,0.06)] hover:-translate-y-px"
                }`}
              >
                v{displayNum}
                {isCurrent && !isSelected && <span className="ml-1.5 font-normal opacity-70">now</span>}
              </button>
            );
          })}
        </div>

        {selectedVersion && (
          <div className="mx-4 mb-2 mt-1 rounded-xl bg-paper p-3 shadow-[0_10px_24px_-16px_rgba(74,52,20,0.5)]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-[15px] font-bold text-foreground">
                    Version {selectedDisplayNum}
                  </span>
                  <span className="text-[11px] text-placeholder">
                    {relativeTime(selectedVersion.savedAt)} \u00b7 {selectedVersion.elements.length} elements
                  </span>
                </div>
                {versionLabel(selectedVersion) && (
                  <p className="text-[12px] text-subtle line-clamp-2 mt-0.5">
                    {'\u201c'}
                    {versionLabel(selectedVersion)}
                    {'\u201d'}
                  </p>
                )}
              </div>
              <button
                onClick={handleCancelView}
                className="p-1 text-placeholder hover:text-foreground transition-colors rounded"
                title="Close preview"
                aria-label="Close preview"
              >
                <IconX size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={() => handleRevert(selectedVersion.id)}
                className="btn-ink px-3 py-1.5 text-[12px]"
              >
                <IconArrowBackUp size={13} />
                Restore
              </button>
              <button
                onClick={handleCancelView}
                className="btn-paper px-3 py-1.5 text-[12px]"
              >
                Back to current
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default VersionTimeline;
