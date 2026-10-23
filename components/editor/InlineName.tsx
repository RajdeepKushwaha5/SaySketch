"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  value: string;
  onCommit: (value: string) => void;
}

export default function InlineName({ value, onCommit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim() || "Untitled Diagram";
    setDraft(trimmed);
    if (trimmed !== value) onCommit(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="font-display bg-paper text-foreground text-[16px] font-bold tracking-tight px-2 py-0.5 rounded-lg border-2 border-foreground focus:outline-none w-64"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <button
      className="font-display text-[16px] font-bold tracking-tight text-foreground hover:text-muted truncate max-w-72 px-2 py-0.5 -mx-2 rounded-lg hover:bg-paper/70 transition-colors"
      onClick={() => setEditing(true)}
      title="Click to rename"
    >
      {value}
    </button>
  );
}
