'use client'

import { useEffect } from 'react'
import {
  IconPencil,
  IconFolderPlus,
  IconTrash,
} from '@tabler/icons-react'
import type { Folder } from '@/types/library'

interface Props {
  folder: Folder
  position: { x: number; y: number }
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onAddSubfolder: () => void
}

export default function FolderContextMenu({
  folder,
  position,
  onClose,
  onRename,
  onDelete,
  onAddSubfolder,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleItem(fn: () => void) {
    fn()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="pop fixed z-50 min-w-[160px]"
        style={{ top: position.y, left: position.x }}
      >
        <div className="pop-label truncate">
          {folder.name}
        </div>

        <button
          className="pop-item"
          onClick={() => handleItem(onRename)}
        >
          <IconPencil size={14} className="shrink-0" />
          Rename
        </button>

        <button
          className="pop-item"
          onClick={() => handleItem(onAddSubfolder)}
        >
          <IconFolderPlus size={14} className="shrink-0" />
          Add Subfolder
        </button>

        <div className="pop-sep" />

        <button
          className="pop-item pop-item-danger"
          onClick={() => handleItem(onDelete)}
        >
          <IconTrash size={14} className="shrink-0" />
          Delete
        </button>
      </div>
    </>
  )
}
