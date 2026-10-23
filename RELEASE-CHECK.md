# SaySketch release checks

23 October 2026. This is a verification checklist, not a claim of completed manual testing.

## Automated audit

Speech/context follow-up: 113 unit tests pass with the two opt-in provider suites skipped by default. Sixteen browser checks passed together, followed by a dedicated speech-stop regression. A separately enabled real-provider scenario passed three sequential requests checking database correction, backend dependencies, hosting and CI/CD against the evolving scene. This is one live scenario, not an accuracy percentage. TypeScript and the production Webpack build pass; lint has zero errors and three inherited warnings. New behavior includes bounded recent-instruction context, conservative clause buffering, graceful microphone shutdown, consistent hosting representation and shared protection for speech tokens. Actual microphone recognition quality, network behavior and hosted quotas still require manual checks.

Final local result for this pass: 88 unit tests passed; the live-provider test was skipped. All 11 Chromium browser tests passed in one clean run (model requests stubbed). TypeScript passed; lint reported zero errors and five inherited warnings. The production build passed with `next build --webpack`. Generated verification output was redirected through ignored `.next-audit` / `.next-audit-e2e` junctions into C: temporary storage because D: was low on space; `NODE_PATH` pointed to this repository's node_modules for those relocated runs. This is not a deployed or live-provider verification.

Repairs in this pass: bulk JSON image preservation; collision-safe ZIP filenames; bounded UTF-8 request reads; fail-closed behavior when configured shared limiting is unavailable; obsolete/cancelled response rejection; locked-document Apply protection; Apply/Cancel race prevention; bounded backup validation; read-only history previews; save-before-navigation on Back to library. The original LICENSE was restored from the archived source.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:e2e` and `npm run build`. The opt-in live model evaluation is separate from the normal suite. Browser tests stub model responses; they do not measure current provider quality or Wispr desktop behavior.

## Manual acceptance: actual Flow and model

Use a fresh diagram and your own normal Flow shortcut. Keep the instruction box focused (Ctrl/Cmd+K). Do not expose Settings credentials in a recording.

1. With Auto draw off, dictate: “A React web app and a mobile app call an API Gateway. The gateway calls Auth, Orders and Inventory. Auth reads Postgres. Orders publishes to Kafka, which feeds Notifications. Inventory reads Redis and falls back to MySQL.” Send it. Verify every requested component and connection, with no invented services.
2. Drag Orders and Inventory to different positions; change one color; add a manual note “Do not move this”. Export a native backup now.
3. Dictate: “Add an Email Queue after Orders and connect it to a Notification Worker. Keep everything else unchanged.” Review, then Apply. Existing positions, colors, labels and the note must remain unchanged.
4. Click empty canvas and press Ctrl/Cmd+Z once: the whole instruction must disappear together. Redo must restore it. Earlier manual work must remain.
5. Enable Auto draw. Focus the box and dictate: “Add an Audit service after Auth.” After Flow inserts the text, wait for the pause, model request and automatic Apply. Expect one service and one connection, with no repeated submissions.
6. Dictate: “Remove Audit.” A review must appear; nothing disappears until Apply. Cancel must leave the diagram intact.
7. Make a proposal in review mode, then drag a node before Apply. Apply must refuse the stale proposal without undoing your drag. Plan again should work against the new scene.
8. Add two similarly named databases. Ask to rename “the database”: expect clarification if ambiguous. Select the intended database, focus the composer and ask to rename “this”. Verify only that node changes.
9. Turn off network access while submitting an instruction. The diagram and instruction must survive the error; reconnect and retry deliberately. Auto draw must not repeatedly submit the failed text.

## Manual acceptance: save, history and backups

1. Add a small image using the native canvas. Wait for Saved; reload. Verify the image, labels, layout and manual note remain.
2. Export JSON and .excalidraw. Import each into a new document. Verify images, connections and text remain editable. Also check PNG/SVG visually and Mermaid in a real renderer; Mermaid cannot represent every annotation/image.
3. Export two diagrams with the same name as a JSON ZIP. Both files must exist under different filenames, with embedded image data.
4. Save a named checkpoint, make another edit, inspect the earlier checkpoint, then choose Back to current. The newer work must return. Restore an earlier checkpoint, reload, and verify it remains restored.
5. Make a rapid edit and immediately click Back to library: it must save before leaving. Repeat while viewing a historical snapshot: reopening must retain the original current scene, not persist the preview. Separately test a rapid browser reload; do not assume browser-unload asynchronous saves are guaranteed. Wait for Saved before closing or refreshing.

## Manual acceptance: fresh hosted judge session

- Open the submitted URL in an incognito window with no personal provider key. Open example, make one new edit, undo, reload and download a native backup.
- Test both normal and Auto draw modes. Confirm loading/error messages are visible and buttons recover after errors.
- Configure and verify a shared rate limiter before exposing funded endpoints publicly. A configured limiter outage now returns 503; missing shared configuration still leaves process-local limiting only. Verify provider spend controls separately.
- Verify Deepgram remains disabled unless deliberately configured and protected. It is a separate service from Flow.
- Check Chromium and one other desktop browser. Test keyboard focus and Ctrl/Cmd+K.
- Keep the submission demo under two minutes. Show real Flow use and a real result; report only measured benefits.

## Remaining limits

- Cross-tab durable revision conflict detection is not implemented. Use one editing tab per document; concurrent tabs are not a supported editing workflow.
- Closing a tab/browser before Saved may lose pending changes. Editable exports are the recovery route; browser-local storage is not cloud backup.
- History previews are read-only and block AI instructions; restore/reload with your own real image-containing document still needs the manual check above.
- Public quota enforcement, actual hosted access, live-model accuracy and actual desktop Flow behavior require the checks above. Automated mocks do not establish those results.
