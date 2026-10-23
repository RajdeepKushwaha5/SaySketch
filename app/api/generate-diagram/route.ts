import { NextRequest } from 'next/server'
import { generateDiagram } from '@/lib/ai/llm'
import type { ProviderConfig } from '@/lib/ai/llm'
import type { GraphResponse } from '@/types/diagram'
import type { DiagramType } from '@/types/library'
import { guardAIRequest } from '@/lib/server/guard'

export const maxDuration = 30

function isAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  // OpenAI SDK folds 401/403 into message text
  return msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('invalid api key')
}

export async function POST(request: NextRequest) {
  try {
    // kill switch, size cap and rate limit before any provider call
    const guarded = await guardAIRequest(request)
    if ('error' in guarded) return guarded.error
    const body = (guarded.body ?? {}) as {
      transcript?: string
      currentGraph?: GraphResponse
      diagramType?: DiagramType
      manualEditDebrief?: { text: string; deletedNodeIds: string[]; deletedEdgeKeys: Array<{ from: string; to: string }> }
      providerConfig?: ProviderConfig
    }

    if (typeof body.transcript !== 'string' || !body.transcript.trim() || body.transcript.length > 2000) {
      return Response.json(
        { error: 'transcript is required and must be 1–2000 characters' },
        { status: 400 }
      )
    }

    const args = [body.transcript, body.currentGraph, body.diagramType, body.manualEditDebrief] as const

    try {
      const { elements, graph, files } = await generateDiagram(...args, body.providerConfig)
      return Response.json({ elements, graph, files })
    } catch (err) {
      // bad BYOK → retry on server Groq
      if (isAuthError(err) && body.providerConfig?.apiKey) {
        const { elements, graph, files } = await generateDiagram(...args, null)
        return Response.json({ elements, graph, files, usedFallback: true })
      }
      throw err
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('empty graph')) {
      return Response.json({ skipped: true })
    }
    if (error instanceof Error && error.message.includes('timeout')) {
      return Response.json({ error: 'LLM request timed out' }, { status: 503 })
    }

    console.error('generate-diagram error:', error)
    return Response.json({ error: 'Failed to generate diagram' }, { status: 500 })
  }
}
