"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  IconStar,
  IconStarFilled,
  IconTrash,
  IconCopy,
} from "@tabler/icons-react";
import type { Diagram, Folder } from "@/types/library";
import DiagramCardContextMenu from "./DiagramCardContextMenu";
import { formatDate } from "@/lib/utils";

interface Props {
  diagram: Diagram;
  folders: Folder[];
  selected?: boolean;
  onStar: (starred: boolean) => void;
  onTrash: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onMove: (folderId: string | null) => void;
  onToggleSelect?: () => void;
}

export default function DiagramCard({
  diagram,
  folders,
  selected,
  onStar,
  onTrash,
  onDuplicate,
  onRename,
  onMove,
  onToggleSelect,
}: Props) {
  const router = useRouter();
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(diagram.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: diagram.id,
      data: { type: "diagram", diagramId: diagram.id },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  function handleOpen() {
    router.push(`/d/${diagram.id}`);
  }

  function handleRenameStart() {
    setIsRenaming(true);
    setRenameValue(diagram.name);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  function handleRenameCommit() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== diagram.name) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleRenameCommit();
    if (e.key === "Escape") setIsRenaming(false);
  }

  const visibleTags = diagram.tags.slice(0, 2);

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onContextMenu={handleContextMenu}
        className={`group relative bg-paper rounded-2xl cursor-pointer overflow-hidden flex flex-col transition-all duration-150 shadow-[0_1px_0_rgba(26,23,20,0.06),0_10px_24px_-18px_rgba(74,52,20,0.5)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[0_0_0_2px_var(--foreground),5px_5px_0_2px_var(--accent)] ${
          selected ? "shadow-[0_0_0_2px_var(--accent)]" : ""
        } ${isDragging ? "shadow-2xl" : ""}`}
        onClick={(e) => {
          if (isRenaming) return;
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            e.preventDefault();
            onToggleSelect?.();
          } else {
            handleOpen();
          }
        }}
      >
        {/* inset tray; multiply blends the export's white background into the paper */}
        <div className="h-40 m-2 mb-0 rounded-xl bg-[#f6f0e4] flex items-center justify-center overflow-hidden shrink-0">
          {diagram.thumbnail ? (
            <img
              src={diagram.thumbnail}
              alt={diagram.name}
              className="w-full h-full object-contain p-3 mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-placeholder">
              <svg width="64" height="40" viewBox="0 0 64 40" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="58" height="34" rx="7" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" />
                <path d="M18 24 C 24 14, 30 28, 38 18 S 46 16, 48 20" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="text-[13px]" style={{ fontFamily: "var(--font-hand)" }}>Blank canvas</span>
            </div>
          )}
        </div>

        <div className="px-4 pt-3 pb-4 flex flex-col gap-1.5 flex-1">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="text-sm font-medium text-foreground bg-surface border border-border rounded px-1.5 py-0.5 outline-none w-full"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameCommit}
              onKeyDown={handleRenameKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="font-display text-[15px] font-bold tracking-tight text-foreground truncate">
              {diagram.name}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-subtle">
            <span>{hasMounted ? formatDate(diagram.updatedAt) : ""}</span>
            <span className="px-2 py-0.5 rounded-full bg-surface text-muted text-[11px] font-medium capitalize">
              {diagram.diagramType.replace(/-/g, " ")}
            </span>
          </div>

          {visibleTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded-full bg-surface text-muted text-[10px] leading-tight"
                >
                  {tag}
                </span>
              ))}
              {diagram.tags.length > 2 && (
                <span className="px-1.5 py-0.5 rounded-full bg-surface text-placeholder text-[10px] leading-tight">
                  +{diagram.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="p-1.5 rounded-lg bg-paper shadow-sm text-subtle hover:text-[#F59E0B] transition-colors"
            onClick={() => onStar(!diagram.starred)}
            title={diagram.starred ? "Unstar" : "Star"}
          >
            {diagram.starred ? (
              <IconStarFilled size={14} className="text-[#F59E0B]" />
            ) : (
              <IconStar size={14} />
            )}
          </button>
          <button
            className="p-1.5 rounded-lg bg-paper shadow-sm text-subtle hover:text-foreground transition-colors"
            onClick={onDuplicate}
            title="Duplicate"
          >
            <IconCopy size={14} />
          </button>
          <button
            className="p-1.5 rounded-lg bg-paper shadow-sm text-subtle hover:text-error transition-colors"
            onClick={onTrash}
            title="Move to trash"
          >
            <IconTrash size={14} />
          </button>
        </div>

        {onToggleSelect && (
          <div
            className={`absolute top-4 left-4 transition-opacity ${
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              className="w-4 h-4 rounded accent-primary cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>

      {contextMenu && (
        <DiagramCardContextMenu
          diagram={diagram}
          folders={folders}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpen={handleOpen}
          onRename={handleRenameStart}
          onDuplicate={onDuplicate}
          onStar={() => onStar(!diagram.starred)}
          onMove={onMove}
          onTrash={onTrash}
        />
      )}
    </>
  );
}
