"use client";

import { useEffect, useState, useRef } from "react";
import rough from "roughjs";
import { Indie_Flower } from "next/font/google";
import {
  siReact,
  siCloudflare,
  siFastify,
  siGo,
  siApachekafka,
  siMysql,
  siSupabase,
  siRedis,
  siDatadog,
  siClerk,
} from "simple-icons";

const indieFlower = Indie_Flower({ subsets: ["latin"], weight: "400" });

const transcriptionText = [
  "so we've got a React frontend...",
  "...it hits a Fastify API gateway...",
  "...Clerk handles the auth...",
  "...which calls into our Go core service...",
  "...that publishes events to a Kafka topic...",
  "...and writes to MySQL.",
  "wait — actually we're on Supabase, not MySQL...",
  "...oh and Redis in front for caching.",
  "...Datadog watching the gateway too.",
  "...and Cloudflare sitting in front of the Go backend.",
];

export default function ArchitectureDemo() {
  const [step, setStep] = useState(0);
  const arrowsRef = useRef<SVGSVGElement>(null);
  const diagramContainerRef = useRef<HTMLDivElement>(null);
  const [diagramScale, setDiagramScale] = useState(1);

  // 12 beats; last two hold frame
  useEffect(() => {
    const interval = setInterval(() => setStep((s) => (s + 1) % 12), 1000);
    return () => clearInterval(interval);
  }, []);

  // DOM overlay scale = svg viewBox meet math
  useEffect(() => {
    const el = diagramContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDiagramScale(Math.min(width / 600, height / 450));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!arrowsRef.current) return;
    const svgNode = arrowsRef.current;
    while (svgNode.firstChild) svgNode.removeChild(svgNode.firstChild);

    const rc = rough.svg(svgNode);

    function drawArrow(
      points: [number, number][],
      tip: [number, number],
      wing1: [number, number],
      wing2: [number, number],
      seed: number,
    ) {
      svgNode.appendChild(
        rc.curve(points, {
          roughness: 1.2,
          strokeWidth: 2.4,
          stroke: "#1a1714",
          bowing: 1,
          seed,
        }),
      );
      svgNode.appendChild(
        rc.line(tip[0], tip[1], wing1[0], wing1[1], {
          roughness: 1,
          strokeWidth: 2.4,
          stroke: "#1a1714",
          seed: seed + 1,
        }),
      );
      svgNode.appendChild(
        rc.line(tip[0], tip[1], wing2[0], wing2[1], {
          roughness: 1,
          strokeWidth: 2.4,
          stroke: "#1a1714",
          seed: seed + 2,
        }),
      );
    }

    if (step >= 1)
      drawArrow(
        [
          [140, 215],
          [160, 215],
          [175, 215],
        ],
        [175, 215],
        [167, 207],
        [167, 223],
        10,
      );
    if (step >= 2)
      drawArrow(
        [
          [230, 255],
          [230, 280],
          [230, 315],
        ],
        [230, 315],
        [222, 307],
        [238, 307],
        20,
      );
    // fastify -> go
    if (step >= 3)
      drawArrow(
        [
          [280, 215],
          [300, 215],
          [315, 215],
        ],
        [315, 215],
        [307, 207],
        [307, 223],
        30,
      );
    if (step >= 4)
      drawArrow(
        [
          [420, 215],
          [440, 215],
          [455, 215],
        ],
        [455, 215],
        [447, 207],
        [447, 223],
        40,
      );
    if (step >= 5)
      drawArrow(
        [
          [380, 250],
          [420, 290],
          [455, 335],
        ],
        [455, 335],
        [452, 323],
        [442, 332],
        50,
      );
    if (step >= 7)
      drawArrow(
        [
          [370, 175],
          [370, 140],
          [370, 115],
        ],
        [370, 115],
        [362, 123],
        [378, 123],
        60,
      );
    if (step >= 8)
      drawArrow(
        [
          [230, 115],
          [230, 140],
          [230, 175],
        ],
        [230, 175],
        [222, 167],
        [238, 167],
        70,
      );
    if (step >= 9)
      drawArrow(
        [
          [370, 315],
          [370, 285],
          [370, 255],
        ],
        [370, 255],
        [362, 263],
        [378, 263],
        80,
      );
  }, [step]);

  // The last three transcript lines read like live captions above the drawing.
  const current = Math.min(step, transcriptionText.length - 1);
  const captions = transcriptionText.slice(0, current + 1).map((text, idx) => ({ text, idx })).slice(-3);

  return (
    <div className="sheet relative w-full h-full flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-2 shrink-0">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-3 rounded-full bg-accent animate-[pulse_1s_ease-in-out_infinite]"></div>
            <div className="w-1.5 h-6 rounded-full bg-accent animate-[pulse_0.8s_ease-in-out_infinite_0.2s]"></div>
            <div className="w-1.5 h-2.5 rounded-full bg-accent animate-[pulse_1.2s_ease-in-out_infinite_0.4s]"></div>
            <div className="w-1.5 h-5 rounded-full bg-accent animate-[pulse_0.9s_ease-in-out_infinite_0.1s]"></div>
            <div className="w-1.5 h-3.5 rounded-full bg-accent animate-[pulse_1.1s_ease-in-out_infinite_0.3s]"></div>
          </div>
          <span className="text-[11px] font-bold text-accent font-mono uppercase tracking-[0.16em]">
            voice stream
          </span>
        </div>
        <div className="h-[78px] flex flex-col justify-end gap-1 overflow-hidden">
          {captions.map(({ text, idx }) => (
            <p
              key={idx}
              className={`font-mono text-[13px] sm:text-[14px] leading-snug pl-3 border-l-[3px] truncate transition-colors duration-300 ${idx === current ? "text-foreground font-semibold border-accent" : "text-subtle border-transparent"}`}
            >
              {idx === 5 && step >= 6 ? <span className="line-through">{text}</span> : text}
            </p>
          ))}
        </div>
      </div>

      <div ref={diagramContainerRef} className="relative flex-1 min-h-0">
        <svg
          ref={arrowsRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 600 450"
          preserveAspectRatio="xMidYMid meet"
        />

        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "450px",
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) scale(${diagramScale})`,
            transformOrigin: "center center",
          }}
        >
          <div
            className={`absolute top-[180px] left-[40px] w-[100px] h-[70px] bg-[#fffdf8] border-2 border-[#1a1714] shadow-[3px_3px_0_#1a1714] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 0 ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              style={{ color: `#${siReact.hex}` }}
              fill="currentColor"
            >
              <path d={siReact.path} />
            </svg>
            <span
              className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
              style={{ fontWeight: 600 }}
            >
              Frontend
            </span>
          </div>

          <div
            className={`absolute top-[180px] left-[180px] w-[100px] h-[70px] bg-[#fffdf8] border-2 border-[#1a1714] shadow-[3px_3px_0_#1a1714] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 1 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              style={{ color: `#${siFastify.hex}` }}
              fill="currentColor"
            >
              <path d={siFastify.path} />
            </svg>
            <span
              className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
              style={{ fontWeight: 600 }}
            >
              API Gateway
            </span>
          </div>

          <div
            className={`absolute top-[320px] left-[180px] w-[100px] h-[70px] bg-[#fffdf8] border-2 border-[#1a1714] shadow-[3px_3px_0_#1a1714] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 2 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              style={{ color: `#${siClerk.hex}` }}
              fill="currentColor"
            >
              <path d={siClerk.path} />
            </svg>
            <span
              className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
              style={{ fontWeight: 600 }}
            >
              Clerk
            </span>
          </div>

          <div
            className={`absolute top-[180px] left-[320px] w-[100px] h-[70px] bg-[#fffdf8] border-2 border-[#1a1714] shadow-[3px_3px_0_#1a1714] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 3 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-4"
              style={{ color: `#${siGo.hex}` }}
              fill="currentColor"
            >
              <path d={siGo.path} />
            </svg>
            <span
              className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
              style={{ fontWeight: 600 }}
            >
              Core Service
            </span>
          </div>

          <div
            className={`absolute top-[180px] left-[460px] w-[100px] h-[70px] bg-[#fffdf8] border-2 border-[#1a1714] shadow-[3px_3px_0_#1a1714] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 4 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              style={{ color: `#${siApachekafka.hex}` }}
              fill="currentColor"
            >
              <path d={siApachekafka.path} />
            </svg>
            <span
              className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
              style={{ fontWeight: 600 }}
            >
              Kafka Topic
            </span>
          </div>

          <div
            className={`absolute top-[320px] left-[460px] w-[100px] h-[70px] bg-[#fffdf8] border-2 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 5 ? "opacity-100 scale-100" : "opacity-0 scale-95"} ${step >= 6 ? "border-[#3FCF8E] shadow-[3px_3px_0_#3FCF8E]" : "border-[#1a1714] shadow-[3px_3px_0_#1a1714]"}`}
          >
            {step < 6 ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  style={{ color: `#${siMysql.hex}` }}
                  fill="currentColor"
                >
                  <path d={siMysql.path} />
                </svg>
                <span
                  className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
                  style={{ fontWeight: 600 }}
                >
                  MySQL
                </span>
              </>
            ) : (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4"
                  style={{ color: `#${siSupabase.hex}` }}
                  fill="currentColor"
                >
                  <path d={siSupabase.path} />
                </svg>
                <span
                  className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
                  style={{ fontWeight: 600 }}
                >
                  Supabase
                </span>
              </>
            )}
          </div>

          <div
            className={`absolute top-[40px] left-[320px] w-[100px] h-[70px] bg-[#fffdf8] border-2 border-[#1a1714] shadow-[3px_3px_0_#1a1714] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 7 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              style={{ color: `#${siRedis.hex}` }}
              fill="currentColor"
            >
              <path d={siRedis.path} />
            </svg>
            <span
              className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
              style={{ fontWeight: 600 }}
            >
              Redis Cache
            </span>
          </div>

          <div
            className={`absolute top-[40px] left-[180px] w-[100px] h-[70px] bg-[#fffdf8] border-2 border-[#1a1714] shadow-[3px_3px_0_#1a1714] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 8 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              style={{ color: `#${siDatadog.hex}` }}
              fill="currentColor"
            >
              <path d={siDatadog.path} />
            </svg>
            <span
              className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
              style={{ fontWeight: 600 }}
            >
              Datadog Agent
            </span>
          </div>

          <div
            className={`absolute top-[320px] left-[320px] w-[100px] h-[70px] bg-[#fffdf8] border-2 border-[#1a1714] shadow-[3px_3px_0_#1a1714] rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ${step >= 9 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              style={{ color: `#${siCloudflare.hex}` }}
              fill="currentColor"
            >
              <path d={siCloudflare.path} />
            </svg>
            <span
              className={`text-[14px] text-[#1a1714] ${indieFlower.className}`}
              style={{ fontWeight: 600 }}
            >
              Cloudflare
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
