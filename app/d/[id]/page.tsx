"use client";

import { useRef, useState, useEffect, useEffectEvent, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";
import ExcalidrawCanvas, {
  ExcalidrawCanvasHandle,
} from "@/components/editor/ExcalidrawCanvas";
import VoicePanel, { type VoicePanelHandle } from "@/components/editor/VoicePanel";
import EditorTopBar from "@/components/editor/EditorTopBar";
import { type EditorMenuHandle } from "@/components/editor/EditorMenu";
import { useAutoSave } from "@/hooks/editor/useAutoSave";
import { useAIGeneration } from "@/hooks/editor/useAIGeneration";
import { useDiagramCommands } from "@/hooks/editor/useDiagramCommands";
import { buildPlannerContext } from "@/lib/ai/plan";
import { EXAMPLE_NAME, EXAMPLE_TRY } from "@/lib/example";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { Diagram } from "@/types/library";
import { useUserSettings } from "@/hooks/useUserSettings";
import SettingsPanel from "@/components/editor/SettingsPanel";
import ShortcutsModal from "@/components/editor/ShortcutsModal";
import StorageBanner from "@/components/editor/StorageBanner";

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditorPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const canvasRef = useRef<ExcalidrawCanvasHandle>(null);
  const canvasReadyRef = useRef(false);
  const voicePanelRef = useRef<VoicePanelHandle>(null);
  const menuRef = useRef<EditorMenuHandle>(null);
  const [restoreFlash, setRestoreFlash] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { settings, setSettings } = useUserSettings();

  const diagram = useLiveQuery(() => db.diagrams.get(id), [id]);

  useEffect(() => {
    if (diagram) db.diagrams.update(id, { lastOpenedAt: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, diagram?.id]);

  const { triggerSave, forceSave, saveVersion, saveStatus, pauseSave, resumeSave } = useAutoSave(id, canvasRef);
  const { loadingPhase, isLoading, errorMessage, showError, handleMicStart, handleMicStop, handleSilence } =
    useAIGeneration({ id, diagram, canvasRef, settings });
  const commands = useDiagramCommands({ id, diagram, canvasRef, settings });
  const [autoDraw, setAutoDraw] = useState(false);
  const autoAttemptedRef = useRef<object | null>(null);
  const applyAutomatically = useEffectEvent(() => {
    const proposal = commands.proposal;
    if (!proposal?.autoApplicable || autoAttemptedRef.current === proposal) return;
    autoAttemptedRef.current = proposal;
    void commands.apply();
  });
  useEffect(() => {
    if (autoDraw && commands.proposal) applyAutomatically();
  }, [autoDraw, commands.proposal]);
  const [selection, setSelection] = useState<string[]>([]);

  // Labels for the "Editing: …" chip, resolved from the live scene.
  const selectionLabels = useMemo(() => {
    if (!selection.length) return [];
    const ctx = buildPlannerContext(canvasRef.current?.getElements() ?? [], selection);
    const label = (nodeId: string) => ctx.nodes.find((n) => n.id === nodeId)?.label || "shape";
    return ctx.selected.map((sid) => {
      const node = ctx.nodes.find((n) => n.id === sid);
      if (node) return node.label || "shape";
      const edge = ctx.edges.find((e) => e.id === sid)!;
      return edge.label || `${label(edge.from)} → ${label(edge.to)}`;
    });
  }, [selection]);

  // /d/new?example=1 lands here with an empty canvas; fill it from the static example route once.
  const exampleLoadingRef = useRef(false);
  async function handleCanvasReady() {
    canvasReadyRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas || exampleLoadingRef.current) return;
    if (new URLSearchParams(window.location.search).get("example") !== "1") return;
    exampleLoadingRef.current = true;
    router.replace(`/d/${id}`);
    if (canvas.getElements().length > 0) return;
    try {
      const res = await fetch("/api/example");
      const example = await res.json();
      canvasRef.current?.updateDiagram(example.elements, { replace: true, files: example.files });
      commands.markAiLayout(canvasRef.current?.getElements() ?? []);
      await db.diagrams.update(id, { graph: example.graph, updatedAt: Date.now() });
    } catch {
      showError("couldn't load the example — try again");
    }
  }

  // Full generation replaces the canvas, so it only runs on an empty one; everything else is a reviewed patch.
  async function submitInstruction(text: string): Promise<boolean> {
    const live = canvasRef.current?.getElements() ?? [];
    if (live.length === 0) {
      const drawn = await handleSilence(text);
      // a fresh generation is the AI's layout; later edits tidy it until the user arranges something
      if (drawn) commands.markAiLayout(canvasRef.current?.getElements() ?? []);
      return drawn;
    }
    return commands.propose(text);
  }

  useEffect(() => {
    if (diagram === null) router.replace("/");
  }, [diagram, router]);

  function triggerRestoreAnimation() {
    setRestoreFlash(true);
    setTimeout(() => setRestoreFlash(false), 500);
  }

  useKeyboardShortcuts({
    "mod+s": () => { if (canvasReadyRef.current) void forceSave(canvasRef.current?.getElements() ?? []); },
    "mod+k": () => voicePanelRef.current?.focusInput(),
    "mod+e": () => menuRef.current?.toggle(),
    "mod+shift+l": () => handleToggleLock(),
    "[": () => voicePanelRef.current?.navigatePrev(),
    "]": () => voicePanelRef.current?.navigateNext(),
    "?": () => setShortcutsOpen(true),
  });

  async function handleDuplicate() {
    if (!diagram) return;
    const newId = nanoid();
    const now = Date.now();
    const duplicate: Diagram = {
      ...diagram,
      id: newId,
      name: `${diagram.name} (copy)`,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      version: 1,
      trashedAt: null,
      starred: false,
    };
    await db.diagrams.add(duplicate);
    router.push(`/d/${newId}`);
  }

  async function handleToggleLock() {
    if (!diagram) return;
    await db.diagrams.update(id, { locked: !diagram.locked });
  }

  if (diagram === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-subtle">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <EditorTopBar
        diagram={diagram!}
        saveStatus={saveStatus}
        onBack={async () => {
          if (!canvasReadyRef.current) { router.push("/library"); return; }
          const saved = await forceSave(canvasRef.current?.getElements() ?? diagram.elements);
          if (saved) router.push("/library");
          else showError("couldn't save — stay here and export a backup before leaving");
        }}
        onRename={(name) => db.diagrams.update(id, { name, updatedAt: Date.now() })}
        onStar={(starred) => db.diagrams.update(id, { starred })}
        onDuplicate={handleDuplicate}
        onToggleLock={handleToggleLock}
        onSaveVersion={saveVersion}
        onTidy={commands.tidy}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        menuRef={menuRef}
        canvasRef={canvasRef}
      />

      <div className="lg:hidden flex items-center justify-center py-1.5 px-4 bg-surface text-muted text-xs shrink-0">
        For best experience, open on a desktop browser.
      </div>

      <StorageBanner />

      {errorMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="px-4 py-2 bg-red-500/90 text-white text-sm rounded-lg shadow-lg">
            {errorMessage}
          </div>
        </div>
      )}

      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}

      {settingsOpen && (
        <SettingsPanel settings={settings} onSave={setSettings} onClose={() => setSettingsOpen(false)} />
      )}

      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
        <div className="h-[42vh] lg:h-full w-full lg:w-[30%] lg:max-w-[440px] shrink-0 overflow-hidden">
          <VoicePanel
            ref={voicePanelRef}
            diagramId={id}
            diagramType={diagram.diagramType}
            isLoading={isLoading}
            onSubmit={submitInstruction}
            autoDraw={autoDraw}
            onAutoDrawChange={setAutoDraw}
            selectionLabels={selectionLabels}
            examples={diagram.name === EXAMPLE_NAME ? EXAMPLE_TRY.map((prompt) => ({ label: prompt, prompt })) : undefined}
            phase={commands.phase}
            proposalSummary={commands.proposal?.candidate.summary ?? null}
            proposalTidy={commands.proposal?.tidy ?? false}
            notice={commands.notice}
            onApply={commands.apply}
            onCancel={commands.cancel}
            onDismissNotice={commands.dismissNotice}
            onMicStart={handleMicStart}
            onMicStop={handleMicStop}
            canvasRef={canvasRef}
            onRestoreAnimation={triggerRestoreAnimation}
            pauseSave={pauseSave}
            resumeSave={resumeSave}
            onError={showError}
          />
        </div>
        <div className="flex-1 min-h-0 min-w-0 p-2 mx-3 lg:mx-0 lg:p-3 bg-background">
          <div
            className="sheet relative w-full h-full overflow-hidden"
            style={{ maxWidth: 4096, maxHeight: 4096 }}
          >
            <div
              className={`absolute inset-0 z-20 pointer-events-none bg-white transition-opacity duration-500 ${
                restoreFlash ? "opacity-20" : "opacity-0"
              }`}
            />
            <ExcalidrawCanvas
              ref={canvasRef}
              initialElements={diagram!.elements}
              initialFiles={diagram!.files ?? {}}
              onChange={(elements) => triggerSave(elements)}
              onSelectionChange={setSelection}
              onReady={() => void handleCanvasReady()}
            />
            {(loadingPhase !== "idle" || commands.phase === "planning") && (
              <div className="absolute bottom-3 right-3 w-2 h-2 rounded-full bg-zinc-400 animate-pulse pointer-events-none" />
            )}
            {diagram?.locked && (
              <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-6 z-10">
                <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 border border-yellow-500/40 rounded-lg backdrop-blur-sm">
                  <span className="text-yellow-400 text-sm font-medium">
                    This diagram is locked. Voice input is disabled.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
