'use client'

import type { SaveStatus } from '@/hooks/editor/useAutoSave'

interface Props {
  status: SaveStatus
}

// a quiet pill: coloured dot plus a short word
const CONFIG = {
  saving: { text: 'Saving…', dot: 'bg-placeholder animate-pulse', tone: 'text-subtle' },
  saved: { text: 'Saved', dot: 'bg-success', tone: 'text-subtle' },
  error: { text: 'Save failed', dot: 'bg-error', tone: 'text-error' },
  quota: { text: 'Storage full — export to free space', dot: 'bg-warning', tone: 'text-warning' },
} as const

export default function SaveStatusIndicator({ status }: Props) {
  if (status === 'idle') return null
  const { text, dot, tone } = CONFIG[status]
  return (
    <span role="status" className={`hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-paper/70 text-xs font-medium ${tone}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  )
}
