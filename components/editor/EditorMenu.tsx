"use client";

import {
  forwardRef,
  useImperativeHandle,
  useState,
  useRef,
  useEffect,
} from "react";

export interface EditorMenuHandle {
  toggle: () => void;
}
import {
  IconDotsVertical,
  IconFileExport,
  IconFileCode,
  IconCopy,
  IconLock,
  IconLockOpen,
  IconPhoto,
  IconFileTypeSvg,
  IconBraces,
  IconCheck,
} from "@tabler/icons-react";
import { exportAsExcalidraw, exportAsJSON } from "@/lib/io/export";
import { sceneToMermaid } from "@/lib/scene/mermaid";
import type { Diagram } from "@/types/library";
import type { ExcalidrawCanvasHandle } from "@/components/editor/ExcalidrawCanvas";

interface Props {
  diagram: Diagram;
  canvasRef: React.RefObject<ExcalidrawCanvasHandle | null>;
  onDuplicate: () => void;
  onToggleLock: () => void;
}

const EditorMenu = forwardRef<EditorMenuHandle, Props>(function EditorMenu(
  { diagram, canvasRef, onDuplicate, onToggleLock },
  ref,
) {
  const [isOpen, setIsOpen] = useState(false);

  useImperativeHandle(ref, () => ({ toggle: () => setIsOpen((v) => !v) }));
  const [copied, setCopied] = useState<string | false>(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  // live scene, not the debounced database copy
  function handleExportExcalidraw() {
    setIsOpen(false);
    const canvas = canvasRef.current;
    exportAsExcalidraw(canvas ? { ...diagram, elements: canvas.getElements(), files: canvas.getFiles() } : diagram);
  }

  function handleExportJSON() {
    setIsOpen(false);
    exportAsJSON(diagram);
  }

  function handleExportPng() {
    setIsOpen(false);
    canvasRef.current?.exportPng(diagram.name);
  }

  function handleExportSvg() {
    setIsOpen(false);
    canvasRef.current?.exportSvg(diagram.name);
  }

  // from the live canvas, so manual edits are included; say what Mermaid cannot hold
  function handleCopyMermaid() {
    const { text, omitted } = sceneToMermaid(canvasRef.current?.getElements() ?? diagram.elements);
    navigator.clipboard.writeText(text);
    setCopied(omitted ? `Copied — ${omitted} drawn element${omitted > 1 ? "s" : ""} not included` : "Copied!");
    setTimeout(() => setCopied(false), omitted ? 4000 : 2000);
  }

  function handleDuplicate() {
    setIsOpen(false);
    onDuplicate();
  }

  function handleToggleLock() {
    setIsOpen(false);
    onToggleLock();
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen((v) => !v)}
        className="p-1.5 text-subtle hover:text-foreground hover:bg-surface rounded transition-colors"
        aria-label="More options"
        aria-expanded={isOpen}
      >
        <IconDotsVertical size={16} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="pop absolute right-0 top-full mt-2 w-60 z-[60]"
        >
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

          <button
            className="pop-item"
            onClick={handleExportPng}
          >
            <IconPhoto size={14} className="shrink-0" />
            Export as PNG
          </button>

          <button
            className="pop-item"
            onClick={handleExportSvg}
          >
            <IconFileTypeSvg size={14} className="shrink-0" />
            Export as SVG
          </button>

          <button
            className="pop-item disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleCopyMermaid}
          >
            {copied ? (
              <IconCheck size={14} className="shrink-0 text-success" />
            ) : (
              <IconBraces size={14} className="shrink-0" />
            )}
            {copied || "Copy as Mermaid"}
          </button>

          <div className="pop-sep" />

          <button
            className="pop-item"
            onClick={handleDuplicate}
          >
            <IconCopy size={14} className="shrink-0" />
            Duplicate
          </button>

          <div className="pop-sep" />

          <button
            className="pop-item"
            onClick={handleToggleLock}
          >
            {diagram.locked ? (
              <>
                <IconLockOpen size={14} className="shrink-0 text-warning" />
                <span>Unlock Diagram</span>
              </>
            ) : (
              <>
                <IconLock size={14} className="shrink-0" />
                <span>Lock Diagram</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
});

export default EditorMenu;
