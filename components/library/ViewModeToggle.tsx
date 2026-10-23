'use client'

import { IconLayoutGrid, IconList } from '@tabler/icons-react'
import type { ViewMode } from '@/types/library'

interface Props {
  viewMode: ViewMode
  onToggle: (mode: ViewMode) => void
}

export default function ViewModeToggle({ viewMode, onToggle }: Props) {
  return (
    <div className="seg">
      <button
        onClick={() => onToggle('grid')}
        className={viewMode === 'grid' ? 'is-active' : ''}
        aria-pressed={viewMode === 'grid'}
        title="Grid view"
      >
        <IconLayoutGrid size={15} />
      </button>
      <button
        onClick={() => onToggle('list')}
        className={viewMode === 'list' ? 'is-active' : ''}
        aria-pressed={viewMode === 'list'}
        title="List view"
      >
        <IconList size={15} />
      </button>
    </div>
  )
}
