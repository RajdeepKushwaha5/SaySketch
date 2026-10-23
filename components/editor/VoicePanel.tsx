"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { IconSend, IconX } from "@tabler/icons-react";
import MicButton from "./MicButton";
import InterimIndicator from "./InterimIndicator";
import VersionTimeline, { type VersionTimelineHandle } from "./VersionTimeline";
import { useDeepgram, type SpeechSpeed } from "@/hooks/editor/useDeepgram";
import type { ExcalidrawCanvasHandle } from "@/components/editor/ExcalidrawCanvas";
import type { CommandNotice, CommandPhase } from "@/hooks/editor/useDiagramCommands";
import type { ExcalidrawElement } from "@/types/diagram";
import type { DiagramType } from "@/types/library";

// Deepgram is a separate transcription service; Wispr Flow dictates straight into the composer.
const DEEPGRAM_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEEPGRAM === "1";

export interface VoicePanelHandle {
  focusInput: () => void;
  navigatePrev: () => void;
  navigateNext: () => void;
}

interface VoicePanelProps {
  diagramId: string;
  diagramType: DiagramType;
  isLoading: boolean;
  onSilence: (transcript: string) => void;
  /** Returns true when the instruction was accepted, so the composer can clear. */
  onSubmit: (text: string) => Promise<boolean> | boolean;
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
  notice: CommandNotice | null;
  onApply: () => void;
  onCancel: () => void;
  onDismissNotice: () => void;
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
      diagramType,
      isLoading,
      onSilence,
      onSubmit,
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
      notice,
      onApply,
      onCancel,
      onDismissNotice,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const timelineRef = useRef<VersionTimelineHandle>(null);
    const [draft, setDraft] = useState("");
    const [messages, setMessages] = useState<string[]>([]);
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

    const handleSilence = (transcript: string) => {
      setMessages((prev) => [...prev, transcript]);
      onSilence(transcript);
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
      diagramType === "system-architecture",
      onError,
    );

    const handleToggle = () => {
      if (isListening) {
        stop();
        onMicStop?.();
      } else {
        reset();
        onMicStart?.();
        start();
      }
    };

    const busy = isLoading || phase === "planning" || phase === "applying";

    // The dictated text stays in the box unless the instruction was accepted.
    const send = async (text: string) => {
      const instruction = text.trim();
      if (!instruction || busy) return;
      setMessages((prev) => [...prev, instruction]);
      if (await onSubmit(instruction)) setDraft((current) => (current.trim() === instruction ? "" : current));
    };

    return (
      <div className="flex flex-col h-full bg-background text-foreground">
        <VersionTimeline
          ref={timelineRef}
          diagramId={diagramId}
          canvasRef={canvasRef}
          onRestoreAnimation={onRestoreAnimation}
          pauseSave={pauseSave}
          resumeSave={resumeSave}
        />

        {DEEPGRAM_ENABLED ? (
          <div className="flex flex-col items-center gap-2 pt-5 pb-3">
            <MicButton isListening={isListening} onClick={handleToggle} />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-subtle text-xs">
                {isListening
                  ? "Listening — pause to generate"
                  : isLoading
                    ? "Drawing..."
                    : "Click to start"}
              </span>
              <p className="text-placeholder text-xs">
                Deepgram transcription (separate from Wispr Flow)
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs mt-1">
              {(["fast", "normal", "slow"] as SpeechSpeed[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    speed === s
                      ? "bg-primary text-white"
                      : "text-placeholder hover:text-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-5 pt-5 pb-2">
            <p className="font-display text-[22px] font-extrabold tracking-tight leading-tight text-foreground">Talk your diagram<br />into shape.</p>
            <p className="text-xs text-subtle mt-1 leading-relaxed">
              Dictate with Wispr Flow or type. Select shapes first to point at them — then say what should change.
              Ctrl/Cmd+K jumps to the box.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="py-3 space-y-2 px-4">
            {messages.length === 0 && !finalTranscript && (
              <div className="hidden lg:contents">
                <p className="text-placeholder text-xs px-1 pb-1">
                  Try an example:
                </p>
                {[
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
                ].map(({ label, prompt }) => (
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
            )}
            {messages.map((msg, i) => (
              <p
                key={i}
                className="text-foreground text-sm px-1 leading-relaxed whitespace-pre-wrap"
              >
                {msg}
              </p>
            ))}
            {finalTranscript && (
              <p className="text-foreground text-sm px-1 leading-relaxed whitespace-pre-wrap">
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
                className="shrink-0 text-xs font-medium underline underline-offset-2 disabled:opacity-40"
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
            <p className="text-xs text-subtle mb-2">Highlighted shapes change; everything else stays where it is.</p>
            <div className="flex gap-2">
              <button
                onClick={onApply}
                disabled={phase === "applying"}
                className="btn-ink px-4 py-1.5 text-sm"
              >
                Apply
              </button>
              <button onClick={onCancel} className="btn-paper px-4 py-1.5 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pt-2 pb-3">
          {selectionLabels.length > 0 && (
            <p data-testid="selection-chip" className="inline-block max-w-full text-xs font-semibold text-foreground bg-[#ffd84a] px-2 py-0.5 rounded-md mb-1.5 truncate" title={selectionLabels.join(", ")}>
              Editing: {selectionLabels.join(", ")}
            </p>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              data-testid="composer"
              aria-label="Instruction"
              rows={3}
              className="flex-1 resize-none text-sm bg-paper border-2 border-transparent rounded-xl px-3.5 py-2.5 text-foreground placeholder-placeholder shadow-[0_1px_0_rgba(26,23,20,0.06)] focus:outline-none focus:border-foreground transition-colors"
              placeholder="Describe a change — e.g. “add a Redis cache between the API and Postgres”"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
            />
            <button
              onClick={() => void send(draft)}
              disabled={busy || !draft.trim()}
              aria-label="Send instruction"
              className="btn-ink w-11 h-11 shrink-0"
            >
              <IconSend size={18} />
            </button>
          </div>
          <p className="text-[11px] text-placeholder mt-1 h-4" aria-live="polite">
            {phase === "planning" ? "Planning the change…" : isLoading ? "Drawing…" : "Enter to send · Shift+Enter for a new line"}
          </p>
        </div>
      </div>
    );
  },
);

export default VoicePanel;
