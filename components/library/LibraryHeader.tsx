'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { IconPlus, IconSearch, IconUpload, IconSettings, IconKey } from '@tabler/icons-react'
import SortDropdown from './SortDropdown'
import ViewModeToggle from './ViewModeToggle'
import type { SortField, SortDirection, ViewMode } from '@/types/library'
import type { UserSettings } from '@/hooks/useUserSettings'

interface LibraryHeaderProps {
  sectionLabel: string
  isTrash: boolean
  searchQuery: string
  onSearch: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  sortField: SortField
  sortDirection: SortDirection
  onSort: (field: SortField, direction: SortDirection) => void
  viewMode: ViewMode
  onViewMode: (mode: ViewMode) => void
  onImport: () => void
  settings: UserSettings
  onOpenSettings: () => void
  onNewDiagram: () => void
}

export default function LibraryHeader({
  sectionLabel,
  isTrash,
  searchQuery,
  onSearch,
  searchRef,
  sortField,
  sortDirection,
  onSort,
  viewMode,
  onViewMode,
  onImport,
  settings,
  onOpenSettings,
  onNewDiagram,
}: LibraryHeaderProps) {
  return (
    <header className="flex items-center gap-2 md:gap-3 h-16 px-4 md:px-6 bg-background shrink-0">
      <Link href="/" className="sm:hidden shrink-0">
        <Image src="/saysketch-mark.svg" alt="SaySketch" width={24} height={24} className="rounded" />
      </Link>
      <h2 className="font-display text-foreground font-extrabold text-[22px] tracking-tight shrink-0 hidden sm:block">{sectionLabel}</h2>

      {!isTrash && (
        <div className="flex items-center gap-2 sm:ml-4 bg-paper rounded-xl px-3 py-2 flex-1 max-w-xs shadow-[0_1px_0_rgba(26,23,20,0.06)] focus-within:shadow-[0_0_0_2px_var(--foreground)] transition-shadow">
          <IconSearch size={14} className="text-placeholder shrink-0" />
          <input
            ref={searchRef}
            className="bg-transparent text-sm text-foreground placeholder-placeholder outline-none flex-1"
            placeholder="Search diagrams…"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
          />
          {!searchQuery && (
            <kbd className="hidden sm:flex items-center gap-0.5 text-placeholder text-xs font-sans pointer-events-none">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          )}
        </div>
      )}

      <div className="flex-1" />

      {!isTrash && (
        <div className="hidden md:flex items-center gap-2">
          <SortDropdown
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={onSort}
          />
          <ViewModeToggle viewMode={viewMode} onToggle={onViewMode} />
        </div>
      )}

      {!isTrash && (
        <button
          className="ctl hidden sm:inline-flex px-3 py-2 text-sm"
          onClick={onImport}
          title="Import .excalidraw file"
        >
          <IconUpload size={15} />
          <span className="hidden sm:inline">Import</span>
        </button>
      )}

      <button
        onClick={onOpenSettings}
        className="ctl relative p-2"
        title={settings.apiKey ? "Settings" : "Settings — using the shared model"}
        aria-label="Open settings"
      >
        {!settings.apiKey
          ? <><IconKey size={17} /><span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent animate-pulse" /></>
          : <IconSettings size={17} />
        }
      </button>

      {!isTrash && (
        <button
          className="btn-ink px-4 py-2 text-sm"
          onClick={onNewDiagram}
        >
          <IconPlus size={16} />
          <span className="hidden sm:inline">New Diagram</span>
        </button>
      )}
    </header>
  )
}
