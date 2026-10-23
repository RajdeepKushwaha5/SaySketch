"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { encodeAIMeta } from "@/lib/versionMeta";
import { buildPlannerContext, type PlanResult } from "@/lib/ai/plan";
import { buildPatch, sceneSnapshot, type PatchCandidate } from "@/lib/scene/patch";
import { nodeGeometry, relayoutScene, untouchedSince } from "@/lib/scene/relayout";
import type { ExcalidrawElement } from "@/types/diagram";
import { canAutoApply } from "@/lib/scene/auto-draw";
import type { ExcalidrawCanvasHandle } from "@/components/editor/ExcalidrawCanvas";
import type { Diagram } from "@/types/library";
import type { UserSettings } from "@/hooks/useUserSettings";

export type CommandPhase = "idle" | "planning" | "preview" | "applying";

export interface CommandNotice {
  kind: "error" | "question" | "info" | "conflict";
  text: string;
  /** Instruction to re-plan against the current diagram (conflicts and failed plans). */
  retry?: string;
}

export interface Proposal {
  instruction: string;
  candidate: PatchCandidate;
  baseSnapshot: string;
  autoApplicable: boolean;
  /** The user has not arranged anything since the AI last laid the diagram out, so Apply also tidies it. */
  tidy: boolean;
}

interface Options {
  id: string;
  diagram: Diagram | null | undefined;
  canvasRef: React.RefObject<ExcalidrawCanvasHandle | null>;
  settings: UserSettings;
}

const CHANGED_WHILE_PLANNING = "The diagram changed while this was being planned. Nothing was applied.";

/** Instruction lifecycle: plan against a content snapshot, preview, then apply only if the diagram is unchanged. */
export function useDiagramCommands({ id, diagram, canvasRef, settings }: Options) {
  const [phase, setPhase] = useState<CommandPhase>("idle");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [notice, setNotice] = useState<CommandNotice | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // node geometry as the AI last left it; any manual move or drawing switches to "keep my arrangement"
  const aiLayoutRef = useRef<Map<string, string> | null>(null);
  const markAiLayout = (scene: readonly ExcalidrawElement[]) => { aiLayoutRef.current = nodeGeometry(scene); };
  const applyingRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), [id]);

  /** Returns true when the instruction was accepted for planning (the composer may clear it). */
  async function propose(instruction: string): Promise<boolean> {
    const canvas = canvasRef.current;
    if (!canvas || !diagram) return false;
    if (diagram.locked) {
      setNotice({ kind: "error", text: "This diagram is locked. Unlock it to make changes." });
      return false;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (proposal) canvas.select([]);
    setProposal(null);
    setNotice(null);
    setPhase("planning");

    const base = canvas.getElements();
    const baseSnapshot = sceneSnapshot(base);
    try {
      const res = await fetch("/api/plan-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          context: buildPlannerContext(base, canvas.getSelectedIds()),
          providerConfig: settings.apiKey ? { provider: settings.provider, apiKey: settings.apiKey } : undefined,
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
      });
      const data = (await res.json().catch(() => ({}))) as PlanResult & { error?: string };
      if (controller.signal.aborted || abortRef.current !== controller) return false;
      if (!res.ok || data.error) {
        setNotice({ kind: "error", text: data.error ?? "Planning failed. Your diagram is unchanged.", retry: instruction });
        return false;
      }
      if (data.status === "clarification") {
        setNotice({ kind: "question", text: data.question });
        return false;
      }
      if (data.status === "no_change") {
        setNotice({ kind: "info", text: data.reason });
        return true;
      }
      // Never preview a plan for a diagram that no longer exists in that form.
      const current = canvasRef.current?.getElements() ?? [];
      if (sceneSnapshot(current) !== baseSnapshot) {
        setNotice({ kind: "conflict", text: CHANGED_WHILE_PLANNING, retry: instruction });
        return false;
      }
      let candidate: PatchCandidate;
      try {
        candidate = buildPatch(current, data.operations);
      } catch (err) {
        setNotice({ kind: "error", text: err instanceof Error ? err.message : "That change could not be applied.", retry: instruction });
        return false;
      }
      setProposal({ instruction, candidate, baseSnapshot, autoApplicable: canAutoApply(data.operations), tidy: untouchedSince(aiLayoutRef.current, current) });
      setPhase("preview");
      // Highlight what will change: existing shapes/arrows only (new ones appear on apply).
      const existing = new Map(current.map(el => [el.id, el]));
      canvasRef.current?.select(candidate.affectedIds.map(aid => existing.get(aid)).filter(el => el && !el.containerId).map(el => el!.id));
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return false;
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      setNotice({ kind: "error", text: timedOut ? "Planning took too long. Your diagram is unchanged." : "Could not reach the planner. Your diagram is unchanged.", retry: instruction });
      return false;
    } finally {
      if (abortRef.current === controller) setPhase(p => (p === "planning" ? "idle" : p));
    }
  }

  async function apply() {
    const canvas = canvasRef.current;
    if (!canvas || !proposal || applyingRef.current) return;
    if (diagram?.locked) {
      setNotice({ kind: "error", text: "This diagram is locked. Unlock it before applying changes." });
      return;
    }
    applyingRef.current = true;
    setPhase("applying");
    try {
      const current = canvas.getElements();
      if (sceneSnapshot(current) !== proposal.baseSnapshot) {
        setNotice({ kind: "conflict", text: "You edited the diagram after this was proposed. Nothing was applied.", retry: proposal.instruction });
        canvas.select([]);
        setProposal(null);
        return;
      }
      const latest = await db.diagrams.get(id);
      const checkpointId = nanoid();
      try {
        // Complete pre-change checkpoint (elements + files) so the change can be restored after reload.
        await db.versions.add({
          id: checkpointId,
          diagramId: id,
          version: latest?.version ?? 0,
          elements: current,
          files: canvas.getFiles(),
          transcript: latest?.transcript ?? "",
          savedAt: Date.now(),
          label: encodeAIMeta({ prompt: proposal.instruction, summary: proposal.candidate.summary.join(" "), source: "ai" }),
        });
      } catch (err) {
        console.error("checkpoint failed", err);
        setNotice({ kind: "error", text: "Could not save a checkpoint, so nothing was applied. Export a backup and try again." });
        return;
      }
      // The awaits above yield to the browser; a drag in that gap must not be overwritten.
      // No await between this check and applyPatch, so nothing can change in between.
      if (sceneSnapshot(canvas.getElements()) !== proposal.baseSnapshot) {
        await db.versions.delete(checkpointId).catch(() => {});
        setNotice({ kind: "conflict", text: "You edited the diagram while this was being applied. Nothing was applied.", retry: proposal.instruction });
        canvas.select([]);
        setProposal(null);
        return;
      }
      // one undo step either way: the change, plus a tidy layout while nothing was arranged by hand
      let { elements, affectedIds } = proposal.candidate;
      const tidied = proposal.tidy ? relayoutScene(elements) : null;
      if (tidied) {
        elements = tidied.elements;
        affectedIds = [...new Set([...affectedIds, ...tidied.movedIds])];
      }
      canvas.applyPatch(elements, affectedIds);
      if (proposal.tidy) markAiLayout(canvas.getElements());
      canvas.select([]);
      setProposal(null);
      setNotice({ kind: "info", text: tidied ? "Applied and tidied the layout. Move anything and your arrangement is kept from then on." : "Applied. Ctrl/Cmd+Z undoes the whole change." });
      // The canvas change autosaves through onChange; the instruction log is secondary.
      if (latest) {
        await db.diagrams.update(id, {
          transcript: `${latest.transcript}\n${proposal.instruction}`.trim(),
          metadata: { ...latest.metadata, generatedVia: "voice" },
        }).catch(err => console.error("transcript update failed", err));
      }
    } catch (err) {
      console.error("command apply failed", err);
      setNotice({ kind: "error", text: "Could not finish applying. Check the canvas and saved history before retrying." });
    } finally {
      applyingRef.current = false;
      setPhase("idle");
    }
  }

  function cancel() {
    // Once Apply starts, let its short checkpoint/render section finish as a single action.
    if (applyingRef.current) return;
    abortRef.current?.abort();
    abortRef.current = null;
    if (proposal) canvasRef.current?.select([]);
    setProposal(null);
    setPhase("idle");
  }

  /** Explicit re-layout of the whole diagram; a single native undo step restores the previous arrangement. */
  function tidy() {
    const canvas = canvasRef.current;
    if (!canvas || phase !== "idle" || proposal) return;
    if (diagram?.locked) {
      setNotice({ kind: "error", text: "This diagram is locked. Unlock it to tidy the layout." });
      return;
    }
    const result = relayoutScene(canvas.getElements());
    if (!result) {
      setNotice({ kind: "info", text: "Nothing to tidy here (diagrams with groups keep their layout)." });
      return;
    }
    canvas.applyPatch(result.elements, result.movedIds);
    markAiLayout(canvas.getElements());
    setNotice({ kind: "info", text: "Tidied. Ctrl/Cmd+Z restores your previous layout." });
  }

  return { phase, proposal, notice, propose, apply, cancel, tidy, markAiLayout, dismissNotice: () => setNotice(null) };
}
