"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { isCompleteThought } from "@/lib/scene/speech";

const SPEED_PRESETS = { fast: 800, normal: 1200, slow: 1800 } as const;
export type SpeechSpeed = keyof typeof SPEED_PRESETS;
export { SPEED_PRESETS };

// Nova-3 keyterm prompting: correctly cased stack names, so speech like "Spring Boot", "RabbitMQ"
// or "Vercel" is not heard as "string root", "GraviTE MKV" or "Versa". Kept far under the 500-token cap.
// Diagram labels are deliberately not added: a misheard label would then be reinforced.
export const TECH_KEYTERMS = [
  "Spring Boot", "RabbitMQ", "Kafka", "Redis", "Elasticsearch", "PostgreSQL", "MySQL", "MongoDB", "DynamoDB",
  "Supabase", "Firebase", "Prisma", "GraphQL", "gRPC", "REST API", "Node.js", "Next.js", "Astro", "React", "Vue",
  "FastAPI", "Django", "Vercel", "Netlify", "Cloudflare", "AWS", "GCP", "GCS", "Azure", "S3", "Lambda", "Kubernetes",
  "Docker", "Nginx", "GitLab", "GitHub Actions", "Jenkins", "CI/CD", "Stripe", "Auth0", "Clerk", "Datadog", "Sentry",
  "Grafana", "Prometheus", "CDN", "LLM", "OpenAI", "LangChain", "BigQuery", "Snowflake",
];

const SYSARCH_REGEX_REPLACEMENTS: [RegExp, string][] = [
  [/\b(lang|line|lam|lambda|land|lon)\s*(chain|Shane|chains)\b/gi, "LangChain"],
  [/\b(lang|line|lam|lambda|land|lon)\s*graph\b/gi, "LangGraph"],
  [/\bfast\s*(api|app\s*I|happy|app)\b/gi, "FastAPI"],
  [/\bspring\s*boot\b/gi, "Spring Boot"],
  [/\bnext\s*\.?\s*js\b/gi, "Next.js"],
  [/\bgraph\s*ql\b/gi, "GraphQL"],
  [/\bg\s*rpc\b/gi, "gRPC"],
  [/\bmongo\s*db\b/gi, "MongoDB"],
  [/\bdynamo\s*db\b/gi, "DynamoDB"],
  [/\bfire\s*base\b/gi, "Firebase"],
  [/\bver\s*cel\b/gi, "Vercel"],
  [/\bpost\s*gres\s*(sql)?\b/gi, "PostgreSQL"],
  [/\bpostgresql\s+sql\b/gi, "PostgreSQL"],
  [/\bL\.?R\.?M\b/g, "LLM"],
];

function applyReplacements(text: string): string {
  let result = text;
  for (const [pattern, to] of SYSARCH_REGEX_REPLACEMENTS) {
    result = result.replace(pattern, to);
  }
  return result;
}

export function useDeepgram(
  onSilence: (transcript: string) => void,
  speed: SpeechSpeed = "normal",
  boostTechTerms = false,
  onError?: (msg: string) => void,
) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stoppingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = useRef("");
  const onSilenceRef = useRef(onSilence);
  const onErrorRef = useRef(onError);
  const activeSessionRef = useRef(0); // bump on start; stale handlers no-op
  onSilenceRef.current = onSilence;
  onErrorRef.current = onError;

  const teardown = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stoppingRef.current = false;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const speedRef = useRef(speed);
  speedRef.current = speed;

  const resetSilenceTimer = useCallback((session: number) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (session !== activeSessionRef.current) return;
      if (finalTranscriptRef.current.trim() && isCompleteThought(finalTranscriptRef.current)) {
        onSilenceRef.current(finalTranscriptRef.current);
        finalTranscriptRef.current = "";
        setFinalTranscript("");
      }
    }, SPEED_PRESETS[speedRef.current]);
  }, []);

  const start = useCallback(async () => {
    teardown();
    finalTranscriptRef.current = "";

    const session = ++activeSessionRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== activeSessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      // Mint only after permission is granted: a short-lived key can expire in the permission dialog.
      const res = await fetch("/api/deepgram-token");
      const { key, error } = await res.json();
      if (!res.ok || error || typeof key !== "string") throw new Error(error || "Speech service unavailable");
      if (session !== activeSessionRef.current) return;
      setIsListening(true); // UI: mic live before WS open

      const params = new URLSearchParams({
        model: "nova-3",
        interim_results: "true",
        smart_format: "true",
        utterance_end_ms: "1000",
        endpointing: "300",
      });
      if (boostTechTerms) {
        // one keyterm per parameter; multi-word terms are URL-encoded by URLSearchParams
        TECH_KEYTERMS.forEach((term) => params.append("keyterm", term));
      }

      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, [
        "token",
        key,
      ]);
      wsRef.current = ws;

      ws.onopen = () => {
        if (session !== activeSessionRef.current) {
          ws.close();
          return;
        }
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (e) => {
          if (
            session === activeSessionRef.current &&
            ws.readyState === WebSocket.OPEN &&
            e.data.size > 0
          ) {
            ws.send(e.data);
          }
        };
        mediaRecorder.start(250);
      };

      ws.onmessage = (event) => {
        if (session !== activeSessionRef.current) return;
        const data = JSON.parse(event.data);

        if (data.type === "UtteranceEnd") {
          // Deepgram has already waited ~1 s of silence. A complete sentence goes now (no second wait);
          // an unfinished clause ("...connects to") stays buffered for the rest of the thought.
          if (finalTranscriptRef.current.trim() && isCompleteThought(finalTranscriptRef.current)) {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            onSilenceRef.current(finalTranscriptRef.current);
            finalTranscriptRef.current = "";
            setFinalTranscript("");
          } else {
            resetSilenceTimer(session);
          }
          return;
        }
        if (data.type === "Metadata" && stoppingRef.current) {
          const pending = finalTranscriptRef.current.trim();
          finalTranscriptRef.current = "";
          if (pending) onSilenceRef.current(pending);
          activeSessionRef.current++;
          teardown();
          setFinalTranscript("");
          return;
        }

        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript) return;

        if (data.is_final) {
          const fixed = boostTechTerms
            ? applyReplacements(transcript)
            : transcript;
          finalTranscriptRef.current = (
            finalTranscriptRef.current +
            " " +
            fixed
          ).trim();
          setFinalTranscript(finalTranscriptRef.current);
          setInterimTranscript("");
          resetSilenceTimer(session);
        } else {
          // Speech resumed before the correction window elapsed; do not commit its earlier half yet.
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          setInterimTranscript(transcript);
        }
      };

      ws.onerror = () => {
        if (session === activeSessionRef.current) teardown();
      };
      ws.onclose = (e) => {
        if (session !== activeSessionRef.current) return;
        // 1005: no status — normal when we close the socket
        if (
          e.code !== 1000 &&
          e.code !== 1005 &&
          session === activeSessionRef.current
        ) {
          console.error(
            `deepgram ws closed unexpectedly: code=${e.code} reason="${e.reason}"`,
          );
          onErrorRef.current?.("mic error — check browser permissions");
        }
        const pending = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = "";
        if (pending) onSilenceRef.current(pending);
        activeSessionRef.current++;
        teardown();
        setFinalTranscript("");
      };
    } catch (err) {
      console.error("Failed to start Deepgram", err);
      if (session === activeSessionRef.current) {
        teardown();
        onErrorRef.current?.("mic error — check browser permissions");
      }
    }
  }, [teardown, resetSilenceTimer, boostTechTerms]);

  const stop = useCallback(() => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    const ws = wsRef.current;
    const recorder = mediaRecorderRef.current;
    const finish = () => {
      const pending = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = "";
      if (pending) onSilenceRef.current(pending);
      activeSessionRef.current++;
      teardown();
      setFinalTranscript("");
    };
    stopTimerRef.current = setTimeout(finish, 2500);
    // Deliver the recorder's last audio blob before asking the socket to finalize.
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" })); };
      recorder.stop();
    } else if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
    else finish();
  }, [teardown]);

  const reset = useCallback(() => {
    finalTranscriptRef.current = "";
    setFinalTranscript("");
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    const session = activeSessionRef;
    return () => {
      session.current++;
      teardown();
    };
  }, [teardown]);

  return {
    isListening,
    interimTranscript,
    finalTranscript,
    start,
    stop,
    reset,
  };
}
