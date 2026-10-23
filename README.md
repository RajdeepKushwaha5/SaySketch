# SaySketch

**Talk your diagrams into shape.**

SaySketch is a diagramming project being developed for the Wispr challenge. The goal is to create and refine architecture diagrams and process flows conversationally while preserving the user's layout and manual edits.

**How it works:** on an empty canvas, describe a diagram and it is generated. After that, every instruction becomes a small reviewed patch: the model proposes operations (add, rename, connect, remove), the app validates them against the live canvas, shows what will change, and applies only on **Apply** — nothing else moves. One Ctrl/Cmd+Z undoes a whole instruction. Select shapes first to point at them ("connect this to the database"). See [PROJECT-PLAN.md](PROJECT-PLAN.md) for the finalized direction and [BUILD-CHECKLIST.md](BUILD-CHECKLIST.md) for verified progress.

## Features

- Editable Excalidraw canvas and automatic graph layout.
- AI diagram generation on an empty canvas; reviewed, preserving patches for every later instruction.
- Browser-local diagram library, folders and saved versions.
- Native/project import and visual/graph export entry points.
- Optional Deepgram microphone transcription and provider settings.

Full generation (with automatic layout) only runs on an empty canvas. Edits never relayout: new nodes are placed next to the node they relate to, clear of shapes and arrows, and a change that has no free space is refused rather than moving your work.

## Development

Use Node 22 (verified locally with 22.20.0). The repository's `.npmrc` uses legacy peer resolution because the Excalidraw package declares older React peers. This does not establish browser compatibility; runtime editor tests remain required.

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

Copy `.env.example` to `.env.local` and configure a server model credential. `GROQ_API_KEY` funds the inherited default model path. Model availability and quotas must be verified before release. Deepgram credentials are optional for its microphone feature. Do not enable its public token endpoint without the protection described in the plan.

```sh
npm run dev
```

Open http://localhost:3000. Set `NEXT_PUBLIC_BASE_URL` to your own deployment URL when deploying; no production domain is configured by this rebrand.

Baseline checks:

```sh
npm run lint
npm run typecheck
npm test          # unit tests, no credentials needed
npm run test:e2e  # browser tests (Playwright; model calls are stubbed)
npm run build
```

Lint has zero errors (six inherited warnings). The browser suite verifies arrow binding, select-dictate-preview-apply, one-step undo/redo, stale-edit conflicts, clarifications and that the live-canvas Mermaid export parses. Live-model accuracy is **not** measured yet (it needs a configured key), and diagrams saved before arrow binding keep their old unbound arrows.

### Current implementation boundary

Supported edits: add node, add connection (optionally labelled), rename node/connection, remove node (with its connections) or connection. Moving, recolouring, grouping and re-arranging are answered with a clarification for now. Model-funded routes have a kill switch (`AI_DISABLED=1`), request-size and instruction limits, and a per-process rate limit — enough for a protected preview, **not** for a public multi-instance deployment, which needs a shared limiter (see the plan).

## Wispr and data handling

Wispr Flow dictates straight into the instruction box (Ctrl/Cmd+K focuses it; Enter sends, Shift+Enter adds a line). Dictated text stays in the box if the planner asks a question or fails. The old Deepgram microphone is hidden unless `NEXT_PUBLIC_ENABLE_DEEPGRAM=1`, and its key-minting route is off unless `DEEPGRAM_ENABLED=1`.

Diagrams are stored in this browser. AI instructions and diagram context are processed by external model services; microphone audio goes to Deepgram when that feature is used. Local storage is not cloud sync or an offline-processing guarantee. Keep editable backups and avoid sensitive content until handling is suitable for your use.

## License

MIT — see [LICENSE](LICENSE).
