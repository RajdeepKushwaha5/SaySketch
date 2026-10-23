"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useEffectEvent,
} from "react";
import { LIVE_MIC_SEND_MS, remainingAfterSend, scheduleAutoDraw } from "@/lib/scene/auto-draw";
import { IconSend, IconX } from "@tabler/icons-react";
import MicButton from "./MicButton";
import InterimIndicator from "./InterimIndicator";
import VersionTimeline, { type VersionTimelineHandle } from "./VersionTimeline";
import { useDeepgram, type SpeechSpeed } from "@/hooks/editor/useDeepgram";
import type { ExcalidrawCanvasHandle } from "@/components/editor/ExcalidrawCanvas";
import type { CommandNotice, CommandPhase } from "@/hooks/editor/useDiagramCommands";
import type { ExcalidrawElement } from "@/types/diagram";
import type { DiagramType } from "@/types/library";


export interface VoicePanelHandle {
  focusInput: () => void;
  navigatePrev: () => void;
  navigateNext: () => void;
}

interface VoicePanelProps {
  diagramId: string;
  diagramType: DiagramType;
  isLoading: boolean;
  /** Returns true when the instruction was accepted, so the composer can clear. */
  onSubmit: (text: string) => Promise<boolean> | boolean;
  autoDraw: boolean;
  onAutoDrawChange: (enabled: boolean) => void;
  onMicStart?: () => void;
  onMicStop?: () => void;
  canvasRef: React.RefObject<ExcalidrawCanvasHandle | null>;
  onRestoreAnimation: () => void;
  pauseSave: (liveElements: ExcalidrawElement[]) => void;
  resumeSave: () => void;
  onError?: (msg: string) => void;
  selectionLabels: string[];
  phase: CommandPhase;
  proposalSummary: string[] | null;
  /** Apply will also tidy the layout (nothing has been arranged by hand yet). */
  proposalTidy?: boolean;
  notice: CommandNotice | null;
  onApply: () => void;
  onCancel: () => void;
  onDismissNotice: () => void;
  /** Overrides the default creation prompts (e.g. edit suggestions for the example diagram). */
  examples?: { label: string; prompt: string }[];
}

const NOTICE_STYLES: Record<CommandNotice["kind"], string> = {
  error: "bg-error-light text-error",
  conflict: "bg-warning-light text-[#7a4206]",
  question: "bg-[#ffd84a]/50 text-foreground",
  info: "bg-surface text-muted",
};

const VoicePanel = forwardRef<VoicePanelHandle, VoicePanelProps>(
  function VoicePanel(
    {
      diagramId,
      isLoading,
      onSubmit,
      autoDraw,
      onAutoDrawChange,
      onMicStart,
      onMicStop,
      canvasRef,
      onRestoreAnimation,
      pauseSave,
      resumeSave,
      onError,
      selectionLabels,
      phase,
      proposalSummary,
      proposalTidy,
      notice,
      onApply,
      onCancel,
      onDismissNotice,
      examples,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const timelineRef = useRef<VersionTimelineHandle>(null);
    const [draft, setDraft] = useState("");
    const [composing, setComposing] = useState(false);
    const [historyPreview, setHistoryPreview] = useState(false);
    const submittingRef = useRef(false);
    const attemptedDraftRef = useRef("");
    const [messages, setMessages] = useState<string[]>([]);
    // the live mic is offered only when the server has Deepgram configured
    const [micAvailable, setMicAvailable] = useState(false);
    useEffect(() => {
      let cancelled = false;
      fetch("/api/voice").then(r => r.json()).then(d => { if (!cancelled) setMicAvailable(Boolean(d?.live)); }).catch(() => {});
      return () => { cancelled = true; };
    }, []);
    const [speed, setSpeed] = useState<SpeechSpeed>(() => {
      if (typeof window === "undefined") return "normal";
      return (
        (localStorage.getItem("yapdraw-speech-speed") as SpeechSpeed) ??
        "normal"
      );
    });

    useEffect(() => {
      localStorage.setItem("yapdraw-speech-speed", speed);
    }, [speed]);

    useImperativeHandle(ref, () => ({
      focusInput() {
        inputRef.current?.focus();
      },
      navigatePrev() {
        timelineRef.current?.navigatePrev();
      },
      navigateNext() {
        timelineRef.current?.navigateNext();
      },
    }));

    // Each spoken utterance joins the same queue as dictated text, so speech during a request is never lost.
    const micSendRef = useRef(false);
    const handleSilence = (transcript: string) => {
      const words = transcript.trim();
      if (!words) return;
      micSendRef.current = true;
      setDraft((current) => (current.trim() ? `${current.trimEnd()} ${words}` : words));
    };

    const {
      isListening,
      interimTranscript,
      finalTranscript,
      start,
      stop,
      reset,
    } = useDeepgram(
      handleSilence,
      speed,
      true, // diagrams are technical: always boost terms like Postgres, GraphQL, RabbitMQ
      onError,
    );

    const handleToggle = () => {
      if (isListening) {
        stop();
        onMicStop?.();
      } else {
        reset();
        // talking live means drawing live: additions apply as you go, deletions still ask
        onAutoDrawChange(true);
        onMicStart?.();
        start();
      }
    };

    const operationBusy = isLoading || phase === "planning" || phase === "applying";
    const busy = operationBusy || historyPreview;

    // The dictated text stays in the box unless the instruction was accepted.
    const send = async (text: string) => {
      const instruction = text.trim();
      if (!instruction || busy || submittingRef.current) return;
      submittingRef.current = true;
      attemptedDraftRef.current = instruction;
      setMessages((prev) => [...prev, instruction]);
      try {
        // keep anything dictated while this was in flight; it becomes the next instruction
        if (await onSubmit(instruction)) setDraft((current) => remainingAfterSend(current, text));
      } finally {
        submittingRef.current = false;
      }
    };

    const submitAfterPause = useEffectEvent(() => {
      // A failed/ambiguous instruction stays editable, without a paid automatic retry loop.
      if (attemptedDraftRef.current !== draft.trim()) void send(draft);
    });
    useEffect(() => {
      const live = isListening || micSendRef.current;
      if (!(autoDraw || live) || !draft.trim() || busy || composing || phase !== "idle") return;
      // the mic already waited for a pause; typed or Flow text gets the normal pause
      return scheduleAutoDraw(() => { micSendRef.current = false; submitAfterPause(); }, live ? LIVE_MIC_SEND_MS : undefined);
    }, [autoDraw, draft, busy, isListening, composing, phase]);

    return (
      <div className="flex flex-col h-full bg-background text-foreground">
        <VersionTimeline
          ref={timelineRef}
          diagramId={diagramId}
          canvasRef={canvasRef}
          onRestoreAnimation={onRestoreAnimation}
          pauseSave={pauseSave}
          resumeSave={resumeSave}
          disabled={operationBusy}
          onPreviewChange={setHistoryPreview}
        />

        {micAvailable ? (
          <div className="px-5 pt-5 pb-2">
            <div className="flex items-center gap-4">
              <MicButton isListening={isListening} onClick={handleToggle} />
              <div className="min-w-0">
                <p className="font-display text-[20px] font-extrabold tracking-tight leading-tight text-foreground">
                  {isListening ? "Listening…" : "Talk your diagram into shape."}
                </p>
                <p className="text-[13px] text-subtle mt-1 leading-snug">
                  {isListening
                    ? "Keep talking — it draws on every pause."
                    : isLoading || phase === "planning"
                      ? "Drawing…"
                      : "Tap the mic and describe your system. Or dictate with Wispr Flow below."}
                </p>
              </div>
            </div>
            <div className="seg mt-3" role="group" aria-label="Pause before drawing">
              {(["fast", "normal", "slow"] as SpeechSpeed[]).map((s) => (
                <button key={s} onClick={() => setSpeed(s)} className={speed === s ? "is-active" : ""} aria-pressed={speed === s}>
                  <span className="px-1.5 text-[11px] font-semibold capitalize">{s}</span>
                </button>
              ))}
            </div>
          </div>
        ) : messages.length === 0 && !finalTranscript ? (
          <div className="px-5 pt-5 pb-1">
            <p className="font-display text-[24px] font-extrabold tracking-tight leading-[1.1] text-foreground">Talk your diagram<br />into shape.</p>
            <p className="text-[13px] text-subtle mt-2 leading-relaxed">
              Dictate with Wispr Flow or type. Select shapes to point at them, then say what should change.
            </p>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 space-y-2">
            {messages.length === 0 && !finalTranscript ? (
              <div className="hidden lg:block space-y-2">
                <p className="section-label px-1 pb-0.5">{examples ? "Try saying" : "Try an example"}</p>
                {(examples ?? [
                  {
                    label: "React → Node API → Postgres & Redis",
                    prompt:
                      "React frontend calls a Node API, which reads from Postgres and caches in Redis",
                  },
                  {
                    label: "Form validation flow",
                    prompt:
                      "User submits a form, it gets validated, if valid send a confirmation email, if not show an error",
                  },
                  {
                    label: "Order fulfillment process",
                    prompt:
                      "Customer places an order, warehouse picks and packs it, courier delivers it, customer confirms receipt",
                  },
                ]).map(({ label, prompt }) => (
                  <button
                    key={label}
                    disabled={busy || isListening}
                    onClick={() => void send(prompt)}
                    className="w-full text-left text-[13px] px-3.5 py-2.5 rounded-xl bg-paper text-muted shadow-[0_1px_0_rgba(26,23,20,0.06)] hover:text-foreground hover:-translate-y-px hover:shadow-[3px_3px_0_var(--accent)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="section-label px-1 pb-0.5">Your instructions</p>
            )}
            {messages.map((msg, i) => {
              const latest = i === messages.length - 1 && !finalTranscript;
              return (
                <p
                  key={i}
                  className={`text-[14px] leading-relaxed whitespace-pre-wrap rounded-xl px-3.5 py-2.5 border-l-[3px] transition-colors ${
                    latest
                      ? "bg-paper text-foreground border-accent shadow-[0_8px_20px_-14px_rgba(74,52,20,0.55)]"
                      : "bg-paper/55 text-muted border-transparent"
                  }`}
                >
                  {msg}
                </p>
              );
            })}
            {finalTranscript && (
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap rounded-xl px-3.5 py-2.5 bg-paper text-foreground border-l-[3px] border-accent">
                {finalTranscript}
              </p>
            )}
            <InterimIndicator text={interimTranscript} />
          </div>
        </div>

        {notice && (
          <div
            role="status"
            data-testid="notice"
            data-kind={notice.kind}
            className={`mx-4 mb-2 rounded-xl px-3.5 py-2.5 text-sm flex gap-2 items-start ${NOTICE_STYLES[notice.kind]}`}
          >
            <p className="flex-1 leading-snug">{notice.text}</p>
            {notice.retry && (
              <button
                onClick={() => { onDismissNotice(); void onSubmit(notice.retry!); }}
                disabled={busy}
                className="shrink-0 text-xs font-semibold underline underline-offset-2 disabled:opacity-40"
              >
                Plan again
              </button>
            )}
            <button aria-label="Dismiss" onClick={onDismissNotice} className="shrink-0 opacity-60 hover:opacity-100">
              <IconX size={14} />
            </button>
          </div>
        )}

        {proposalSummary && (
          <div data-testid="proposal" className="mx-4 mb-2 rounded-xl bg-paper p-3.5 border-l-4 border-accent shadow-[0_10px_28px_-16px_rgba(74,52,20,0.45)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent mb-1.5">Proposed change</p>
            <ul className="text-sm space-y-0.5 mb-2 list-disc pl-4">
              {proposalSummary.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
            <p className="text-xs text-subtle mb-2.5">
              {proposalTidy
                ? "Highlighted shapes change, and the layout is tidied (you haven't arranged anything yet)."
                : "Highlighted shapes change; everything else stays where it is."}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onApply}
                disabled={phase === "applying" || historyPreview}
                className="btn-ink px-4 py-1.5 text-sm"
              >
                Apply
              </button>
              <button onClick={onCancel} disabled={phase === "applying"} className="btn-paper px-4 py-1.5 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* composer dock: selection, text and controls as one card */}
        <div className="px-4 pt-1 pb-4">
          <div className="sheet p-2.5 transition-shadow focus-within:shadow-[0_0_0_2px_var(--foreground),0_18px_40px_-22px_rgba(74,52,20,0.35)]">
            {selectionLabels.length > 0 && (
              <p data-testid="selection-chip" className="inline-block max-w-full text-xs font-semibold text-foreground bg-[#ffd84a] px-2 py-0.5 rounded-md mx-1 mt-0.5 mb-1 truncate" title={selectionLabels.join(", ")}>
                Editing: {selectionLabels.join(", ")}
              </p>
            )}
            <textarea
              ref={inputRef}
              data-testid="composer"
              aria-label="Instruction"
              rows={3}
              disabled={historyPreview}
              className="block w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-foreground placeholder-placeholder focus:outline-none"
              placeholder="Describe a change — e.g. “add a Redis cache between the API and Postgres”"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
            />
            <div className="flex items-center gap-2.5 pt-2 px-1">
              <button
                type="button"
                role="switch"
                disabled={historyPreview}
                aria-checked={autoDraw}
                aria-label="Auto draw after a pause"
                title="Sends 1.8 s after text stops arriving. Additions and renames apply automatically; deletions still need your review. Keep this box focused while dictating."
                onClick={() => onAutoDrawChange(!autoDraw)}
                className="flex items-center gap-2 text-xs font-semibold text-muted hover:text-foreground shrink-0"
              >
                <span className={`relative inline-block w-8 h-[18px] rounded-full transition-colors ${autoDraw ? "bg-foreground" : "bg-surface-hover"}`}>
                  <span className={`absolute top-[3px] left-0 w-3 h-3 rounded-full transition-transform ${autoDraw ? "translate-x-[17px] bg-accent" : "translate-x-[3px] bg-paper shadow-sm"}`} />
                </span>
                Auto draw
              </button>
              <span className="flex-1 min-w-0 text-[11px] text-placeholder truncate" aria-live="polite">
                {historyPreview
                  ? "History preview — return to current to edit"
                  : phase === "planning"
                  ? "Planning the change…"
                  : isLoading
                    ? "Drawing…"
                    : autoDraw
                      ? "Sends after a pause · deletions need review"
                      : "Enter to send · Shift+Enter for a new line"}
              </span>
              <button
                onClick={() => void send(draft)}
                disabled={busy || !draft.trim()}
                aria-label="Send instruction"
                className="btn-ink w-10 h-10 shrink-0"
              >
                <IconSend size={17} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

export default VoicePanel;
