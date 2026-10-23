'use client'

import { IconArrowLeft, IconStar, IconStarFilled, IconLock, IconBookmark, IconSettings, IconKeyboard, IconWand } from '@tabler/icons-react'
import type { Diagram } from '@/types/library'
import type { SaveStatus } from '@/hooks/editor/useAutoSave'
import type { ExcalidrawCanvasHandle } from '@/components/editor/ExcalidrawCanvas'
import InlineName from './InlineName'
import SaveStatusIndicator from './SaveStatusIndicator'
import EditorMenu, { type EditorMenuHandle } from './EditorMenu'

interface Props {
  diagram: Diagram
  saveStatus: SaveStatus
  onBack: () => void
  onRename?: (name: string) => void
  onStar?: (starred: boolean) => void
  onDuplicate?: () => void
  onToggleLock?: () => void
  onSaveVersion?: () => void
  onTidy?: () => void
  onOpenSettings?: () => void
  onOpenShortcuts?: () => void
  canvasRef?: React.RefObject<ExcalidrawCanvasHandle | null>
  menuRef?: React.Ref<EditorMenuHandle>
}

export default function EditorTopBar({
  diagram,
  saveStatus,
  onBack,
  onRename,
  onStar,
  onDuplicate,
  onToggleLock,
  onSaveVersion,
  onTidy,
  onOpenSettings,
  onOpenShortcuts,
  canvasRef,
  menuRef,
}: Props) {
  return (
    <header className="flex items-center gap-2 h-16 px-4 bg-background shrink-0">
      {/* breadcrumb: mark → Library / diagram name */}
      <button
        onClick={onBack}
        className="group flex items-center gap-2.5 rounded-xl pr-2 text-subtle hover:text-foreground transition-colors"
        aria-label="Back to library"
      >
        <span className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shadow-[2px_2px_0_var(--accent)] transition-transform group-hover:-translate-x-0.5">
          <IconArrowLeft size={16} className="text-paper" />
        </span>
        <span className="text-sm font-medium hidden sm:inline">Library</span>
      </button>

      <span className="text-placeholder text-lg font-light select-none" aria-hidden="true">/</span>

      <InlineName value={diagram.name} onCommit={name => onRename?.(name)} />

      <button
        onClick={() => onStar?.(!diagram.starred)}
        className="icon-btn !w-8 !h-8"
        aria-label={diagram.starred ? 'Unstar diagram' : 'Star diagram'}
      >
        {diagram.starred
          ? <IconStarFilled size={16} className="text-[#e0a400]" />
          : <IconStar size={16} />
        }
      </button>

      {diagram.locked && (
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-warning-light text-warning text-xs font-semibold">
          <IconLock size={12} />
          Locked
        </span>
      )}

      <div className="flex-1" />

      <SaveStatusIndicator status={saveStatus} />

      {onTidy && (
        <button
          onClick={onTidy}
          className="ctl h-9 px-3 text-[13px] font-medium"
          aria-label="Tidy up layout"
          title="Re-lay out the whole diagram. Ctrl/Cmd+Z restores your layout."
        >
          <IconWand size={15} />
          <span className="hidden md:inline">Tidy up</span>
        </button>
      )}

      {onSaveVersion && (
        <button
          onClick={onSaveVersion}
          className="ctl h-9 px-3 text-[13px] font-medium"
          aria-label="Save version checkpoint"
        >
          <IconBookmark size={15} />
          <span className="hidden sm:inline">Save version</span>
        </button>
      )}

      <div className="flex items-center gap-0.5 ml-1">
        {onOpenShortcuts && (
          <button onClick={onOpenShortcuts} className="icon-btn" aria-label="Keyboard shortcuts">
            <IconKeyboard size={18} />
          </button>
        )}

        {onOpenSettings && (
          <button onClick={onOpenSettings} className="icon-btn" aria-label="Open settings">
            <IconSettings size={18} />
          </button>
        )}

        {canvasRef && onDuplicate && onToggleLock && (
          <EditorMenu
            ref={menuRef}
            diagram={diagram}
            canvasRef={canvasRef}
            onDuplicate={onDuplicate}
            onToggleLock={onToggleLock}
          />
        )}
      </div>
    </header>
  )
}
