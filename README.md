# SaySketch

**Talk your diagrams into shape.**

Turn a spoken explanation into an editable diagram, then refine it without starting over. SaySketch combines natural-language instructions with a drawing canvas for system architecture, process flows and technical documentation.

Describe the system. Move things by hand. Ask for a change. Keep the work you already did.

## Try it

Choose **Try the example** on the home page, or open `/d/new?example=1` for a ready-made checkout architecture.

> Add a queue for confirmation emails after the orders service.

Review the proposed change and select **Apply**. Click the canvas and press **Ctrl/Cmd+Z** to undo it.

## Features

- Create architecture diagrams and process flows from a description.
- Add, rename, connect and remove components through instructions.
- Select a component before referring to it as "this" in an instruction.
- Combine conversational edits with native drawing, text, colors and positioning.
- Review changes before applying them, or enable Auto draw for additions and renames.
- Undo and redo edits using canvas history.
- Organize documents in a browser-local library with folders, search and saved checkpoints.
- Import editable backups and export .excalidraw, JSON, PNG and SVG.
- Copy supported graph structure as Mermaid for documentation.

Ordinary instruction edits do not run a full-scene layout. New components are placed without moving unrelated content. Ambiguous instructions, unsupported edits and placement failures can require clarification or manual adjustment.

## Using Wispr Flow

1. Open a diagram and press **Ctrl/Cmd+K** to focus the instruction box.
2. Activate your configured Wispr Flow shortcut and dictate.
3. In review mode, press **Enter**, inspect the proposal and select **Apply**.

**Auto draw** submits after text stops changing for 1.8 seconds. It draws an initial description and automatically applies validated additions and renames. Deletions still require review. Turn it off when you want to compose without submitting on a pause.

This mode responds to inserted text, including typing and paste. If Flow inserts text when you finish dictating, drawing starts after that insertion. Keep the instruction box focused while speaking.

**Shift+Enter** inserts a new line. Failed instructions remain available for correction or retry.

## Run locally

Requires Node.js 22 and npm.

```sh
npm ci --ignore-scripts --no-audit --no-fund
```

Copy `.env.example` to `.env.local` and configure your Groq credential:

```dotenv
GROQ_API_KEY=your_key_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Optionally set `GROQ_MODEL` to a supported model available to your account. Never commit `.env.local` or publish credentials.

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). The included `.npmrc` accommodates peer dependency declarations in the canvas dependency tree.

For a production build:

```sh
npm run build
npm start
```

Before public hosting, configure shared request limiting with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, verify provider quotas and set your public base URL. Without shared configuration, limiting is per server process. If a configured shared limiter becomes unavailable, requests are blocked rather than silently weakening protection. See `.env.example` for operational switches.

The optional Deepgram microphone is separate from Wispr Flow and disabled by default. Its client and server switches, credentials and access protection must be configured before enabling it. Flow dictation does not require Deepgram.

## Saving and backups

Documents are stored in this browser using IndexedDB. They do not automatically synchronize across devices. Wait for **Saved** before refreshing or closing, and export important documents as editable backups.

JSON and .excalidraw backups include embedded image data. PNG and SVG are visual exports. Mermaid represents supported nodes and connections; it cannot preserve every annotation, image or canvas style.

Use one editing tab per document. Concurrent editing across tabs is not supported. History previews are read-only; return to the current scene before issuing instructions.

Instructions and relevant diagram context are sent to the configured external provider. This is not an entirely offline application. Personal credentials entered in Settings are kept in session storage for the current tab.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

Browser tests use controlled service responses. Verify actual Wispr dictation, provider behavior and the deployed experience separately before publishing or recording the final demo.

## Built with

Next.js, React, TypeScript, Excalidraw, Dagre and Dexie. Regression checks use Vitest and Playwright.

## License

MIT. See [LICENSE](LICENSE) for the original copyright and terms. SaySketch builds on [YapDraw](https://github.com/rickytang666/yapdraw) and [Excalidraw](https://github.com/excalidraw/excalidraw).
