/** Conservative boundary check, not an architecture parser. Never invent a missing destination. */
export function isCompleteThought(text: string): boolean {
  const words = text.trim().replace(/[.,!?;:]+$/g, "").trim();
  if (!words) return false;
  if (/\b(?:a|an|the|on|to|into|through|from|with|for|and|or|which|because|instead of|connects to|hosted on|writes to|pushes to|actually no|wait actually|via|by|so|then|like|is|are|be|let's|let's say|host|use|connect|add|put|call|send|hit|hits|go|goes|um|uh|er|basically)\s*$/i.test(words)) return false;
  return words.split(/\s+/).length >= 3 || /^(?:add|remove|delete|disconnect)\s+\S+/i.test(words);
}

/** Only previously accepted instructions, bounded to keep requests small. */
export function recentInstructions(transcript: string): string[] {
  const result: string[] = [];
  let remaining = 6000;
  for (const line of transcript.split("\n").map(s => s.trim()).filter(Boolean).reverse()) {
    if (result.length === 6 || remaining <= 0) break;
    const clipped = line.slice(0, Math.min(2000, remaining));
    result.unshift(clipped);
    remaining -= clipped.length;
  }
  return result;
}
