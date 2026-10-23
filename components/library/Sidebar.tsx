"use client";

import Image from "next/image";
import Link from "next/link";
import {
  IconLayoutGrid,
  IconStar,
IconTrash,
  IconFolderPlus,
} from "@tabler/icons-react";
import type { SidebarSection } from "@/types/library";
import type { FolderNode } from "@/hooks/library/useFolders";
import FolderTree from "./FolderTree";

interface Props {
  activeSection: SidebarSection;
  trashedCount: number;
  onSection: (section: SidebarSection) => void;
  folders: FolderNode[];
  overFolderId: string | null;
  onCreateFolder: () => void;
  onRenameFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onAddSubfolder: (parentId: string) => void;
}

const FIXED_SECTIONS: {
  id: SidebarSection;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "all", label: "All Diagrams", icon: <IconLayoutGrid size={16} /> },
  { id: "starred", label: "Starred", icon: <IconStar size={16} /> },
  { id: "trash", label: "Trash", icon: <IconTrash size={16} /> },
];

export default function Sidebar({
  activeSection,
  trashedCount,
  onSection,
  folders,
  overFolderId,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onAddSubfolder,
}: Props) {
  return (
    <aside className="w-60 shrink-0 bg-surface/60 flex-col overflow-y-auto hidden md:flex">
      <Link
        href="/"
        className="px-4 py-5 flex items-center gap-2.5 group"
      >
        <span className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shadow-[2px_2px_0_var(--accent)] shrink-0">
          <Image src="/saysketch-mark.svg" alt="" width={18} height={18} className="invert" />
        </span>
        <h1 className="font-display text-[17px] font-bold text-foreground tracking-tight">
          SaySketch
        </h1>
      </Link>

      <nav className="flex flex-col gap-0.5 px-2 py-2">
        {FIXED_SECTIONS.map(({ id, label, icon }) => {
          const isActive = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => onSection(id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] transition-all text-left w-full ${
                isActive
                  ? "bg-paper text-foreground font-semibold shadow-[0_1px_0_rgba(26,23,20,0.06),0_6px_14px_-10px_rgba(74,52,20,0.45)]"
                  : "text-subtle hover:bg-paper/60 hover:text-foreground"
              }`}
            >
              <span className={isActive ? "text-foreground" : "text-placeholder"}>
                {icon}
              </span>
              <span>{label}</span>
              {id === "trash" && trashedCount > 0 && (
                <span className="ml-auto count-badge">
                  {trashedCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="h-3" />

      <div className="py-2 flex-1">
        <div className="flex items-center justify-between pl-5 pr-3 py-1.5">
          <span className="section-label">
            Folders
          </span>
          <button
            onClick={onCreateFolder}
            className="ctl p-1.5"
            title="New folder"
          >
            <IconFolderPlus size={14} />
          </button>
        </div>

        {folders.length === 0 ? (
          <button onClick={onCreateFolder} className="mx-3 mt-1 w-[calc(100%-1.5rem)] flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-border text-[13px] text-subtle hover:text-foreground hover:border-foreground transition-colors">
            <IconFolderPlus size={15} />
            <span style={{ fontFamily: "var(--font-hand)" }}>Make your first folder</span>
          </button>
        ) : (
          <FolderTree
            folders={folders}
            activeSection={activeSection}
            overFolderId={overFolderId}
            onSection={onSection}
            onRename={onRenameFolder}
            onDelete={onDeleteFolder}
            onAddSubfolder={onAddSubfolder}
          />
        )}
      </div>
    </aside>
  );
}
