"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconExternalLink,
  IconPencil,
  IconCopy,
  IconFolderSymlink,
  IconStarFilled,
  IconStar,
  IconTrash,
  IconChevronRight,
  IconFolder,
  IconFolderOpen,
  IconFileExport,
  IconFileCode,
} from "@tabler/icons-react";
import type { Diagram, Folder } from "@/types/library";
import { exportAsExcalidraw, exportAsJSON } from "@/lib/io/export";

interface Props {
  diagram: Diagram;
  folders: Folder[];
  position: { x: number; y: number };
  onClose: () => void;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onStar: () => void;
  onMove: (folderId: string | null) => void;
  onTrash: () => void;
}

export default function DiagramCardContextMenu({
  diagram,
  folders,
  position,
  onClose,
  onOpen,
  onRename,
  onDuplicate,
  onStar,
  onMove,
  onTrash,
}: Props) {
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const safeX = Math.min(position.x, window.innerWidth - 220);
  const safeY = Math.min(position.y, window.innerHeight - 360);

  function handleItem(fn: () => void) {
    fn();
    onClose();
  }

  function handleExportExcalidraw() {
    onClose();
    exportAsExcalidraw(diagram);
  }

  function handleExportJSON() {
    onClose();
    exportAsJSON(diagram);
  }

  const sorted = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={menuRef}
        className="pop fixed z-50 min-w-[180px]"
        style={{ top: safeY, left: safeX }}
      >
        <div className="pop-label truncate max-w-[200px]">
          {diagram.name}
        </div>

        <button
          className="pop-item"
          onClick={() => handleItem(onOpen)}
        >
          <IconExternalLink size={14} className="shrink-0" />
          Open
        </button>

        <button
          className="pop-item"
          onClick={() => handleItem(onRename)}
        >
          <IconPencil size={14} className="shrink-0" />
          Rename
        </button>

        <button
          className="pop-item"
          onClick={() => handleItem(onDuplicate)}
        >
          <IconCopy size={14} className="shrink-0" />
          Duplicate
        </button>

        <div
          className="relative"
          onMouseEnter={() => setShowMoveSubmenu(true)}
          onMouseLeave={() => setShowMoveSubmenu(false)}
        >
          <button className="pop-item">
            <IconFolderSymlink size={14} className="shrink-0" />
            <span className="flex-1">Move to</span>
            <IconChevronRight size={12} className="text-placeholder" />
          </button>

          {showMoveSubmenu && (
            <div className="pop absolute left-full top-0 ml-2 w-48 z-10">
              <button
                className={`pop-item ${diagram.folderId === null ? "is-active" : ""}`}
                onClick={() => handleItem(() => onMove(null))}
              >
                <IconFolderOpen size={14} className="shrink-0 text-subtle" />
                Root (no folder)
              </button>
              {sorted.map((folder) => (
                <button
                  key={folder.id}
                  className={`pop-item ${diagram.folderId === folder.id ? "is-active" : ""}`}
                  onClick={() => handleItem(() => onMove(folder.id))}
                >
                  <IconFolder size={14} className="shrink-0 text-subtle" />
                  <span className="truncate">{folder.name}</span>
                </button>
              ))}
              {sorted.length === 0 && (
                <p className="px-3 py-2 text-xs text-placeholder">No folders.</p>
              )}
            </div>
          )}
        </div>

        <div className="pop-sep" />

        <button
          className="pop-item"
          onClick={handleExportExcalidraw}
        >
          <IconFileExport size={14} className="shrink-0" />
          Export as .excalidraw
        </button>

        <button
          className="pop-item"
          onClick={handleExportJSON}
        >
          <IconFileCode size={14} className="shrink-0" />
          Export as JSON
        </button>

        <div className="pop-sep" />

        <button
          className="pop-item"
          onClick={() => handleItem(onStar)}
        >
          {diagram.starred ? (
            <>
              <IconStarFilled size={14} className="shrink-0 text-[#e0a400]" />
              Unstar
            </>
          ) : (
            <>
              <IconStar size={14} className="shrink-0" />
              Star
            </>
          )}
        </button>

        <div className="pop-sep" />

        <button
          className="pop-item pop-item-danger"
          onClick={() => handleItem(onTrash)}
        >
          <IconTrash size={14} className="shrink-0" />
          Move to Trash
        </button>
      </div>
    </>
  );
}
