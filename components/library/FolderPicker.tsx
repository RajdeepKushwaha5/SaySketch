'use client'

import { useEffect, useRef } from 'react'
import { IconFolder, IconFolderOpen } from '@tabler/icons-react'
import type { Folder } from '@/types/library'

interface Props {
  folders: Folder[]
  currentFolderId: string | null
  onSelect: (folderId: string | null) => void
  onClose: () => void
}

export default function FolderPicker({ folders, currentFolderId, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSelect(folderId: string | null) {
    onSelect(folderId)
    onClose()
  }

  const sorted = [...folders].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={ref}
        className="pop absolute z-50 mt-2 w-60"
      >
        <div className="max-h-60 overflow-y-auto">
          <button
            className={`pop-item ${currentFolderId === null ? 'is-active' : ''}`}
            onClick={() => handleSelect(null)}
          >
            <IconFolderOpen size={15} className="text-placeholder shrink-0" />
            <span>Root (no folder)</span>
          </button>

          {sorted.map(folder => (
            <button
              key={folder.id}
              className={`pop-item ${currentFolderId === folder.id ? 'is-active' : ''}`}
              onClick={() => handleSelect(folder.id)}
            >
              <IconFolder size={15} className="text-placeholder shrink-0" />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}

          {folders.length === 0 && (
            <p className="px-3 py-2 text-xs text-subtle">No folders created yet.</p>
          )}
        </div>
      </div>
    </>
  )
}
