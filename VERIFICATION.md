# Verification record

Verified October 4, 2026, using Node 24.12 and local Chromium on Windows. This record describes the release that removes the custom PWA service worker.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 69 tests passed across eight test files, including the 21 existing integration/reader/data tests |
| `npm run test:e2e` | Six deterministic browser tests passed |
| `npm run test:e2e:production` | Two production browser tests passed: fresh installation and legacy-worker migration |
| `npm run build` | Passed; complete static output in `dist/` |
| `npm run preview -- --port 5184 --strictPort` | Production build served successfully; live browser checks completed |

Production registration was removed from `src/main.tsx`. The `localPWA()` Vite plugin and its source were deleted; the obsolete `/sw.js` header rule was removed. `dist/` contains no `sw.js`. The manifest and application icons remain. No replacement PWA library was added, and dependencies did not change.

The temporary production startup migration inspects registrations, unregisters the known legacy `/sw.js` worker, and deletes only `cadence-shell-` / `cadence-runtime-` cache names. It runs before the app mounts. A controlled document reloads once to release its controller, guarded against reload loops. Independent failures and unavailable/restricted browser APIs do not prevent online startup. Unit coverage checks active/waiting/installing workers, preservation of unrelated workers/caches, failures, already-removed registrations and reload guarding.

The fresh production browser test completes a session, saves a pronunciation setting, refreshes three times and reopens saved results/settings. It observes zero worker registrations, a null controller and no `/sw.js` requests. The legacy migration test uses a test-only HTTP server with an old worker fixture, without writing any worker file into `dist/`. It verifies one automatic reload, zero registrations, a null controller, removal of both old Cadence caches, preservation of sample contents in `transformers-cache`, `kokoro-voices` and an unrelated cache, and retained IndexedDB results/settings after migration and another refresh.

Migration delivery limitation: the new JavaScript must load for startup cleanup to execute. A previously installed cache-first worker can continue serving the old release after deployment. Chrome/Edge's Ctrl+Shift+R bypasses the worker and loads the new release so migration can run. Removing the server's worker script alone does not retire an installed worker. Close stale app tabs to prevent their former startup code from registering again; avoid clearing all site data, which would delete saved IndexedDB data. See the [service worker lifecycle documentation](https://web.dev/articles/service-worker-lifecycle#shift-reload).

Browser tests cover a complete Match with prompt clarification, scoring, every bonus part and saved results after reload; a neg that resumes with buzz lockout and zero bonus requests when disabled; setup validation, saved presets, theme and a 390px viewport; and two tossups with refresh recovery at a paused buzz checkpoint.

The existing browser tests also cover durable pronunciation edit/delete, versioned export/import and invalid-version rejection, mobile Settings layout, and preview honoring the voice just selected in Setup without starting a game. Production diagnostics remain absent. Offline app-shell access is no longer supported; About and README were updated accordingly.

New unit/integration coverage includes eight vocabulary domains with stable spoken text; guide/parenthesis handling; Unicode whole names and nonrecursive precedence; chunk continuity and short-tail prevention; dictionary delivery to system speech; preview bypassing a second lexicon pass; strict nested import validation; idempotent merge; durable dictionary edits; and transaction rollback after a simulated storage write failure.

Additional verification used the live official API, including its current `difficulties` parameter, CORS headers, formatted question responses and answer endpoint. A real question was played progressively, buzzed, frozen, given up and saved through session results. Desktop/gameplay screenshots were visually reviewed; the phone viewport had no horizontal overflow.

The updated live cross-origin browser check returned HTTP 200 and `response.type === 'cors'` for **random-tossup**, **random-bonus** and **check-answer**, with an accepted answer ruling. A request using `Origin: https://cadence-example.pages.dev` returned `Access-Control-Allow-Origin: *`. No proxy is needed. This is a current architecture/CORS check, not verification of an already deployed Cloudflare site.

`dist/` was inspected: no `sw.js`, no `.onnx` weights, no diagnostic component, and no file above Pages' 25 MiB limit. The largest runtime WASM asset is 21,596,019 bytes. The Kokoro worker bundle is unchanged (`kokoro.worker-BAgzNuTq.js`). The model still downloads from its supported remote source and caches separately. Node selection is specified by `.node-version`; application/build configuration needs no secrets or environment variables.

The actual production Kokoro worker downloaded and initialized the **q8 WASM model**, listed 28 voices, and synthesized 67,200 nonzero PCM samples at 24,000 Hz (2.8 seconds). Browser caches `transformers-cache` and `kokoro-voices` were created. Remote speech-resource requests used Hugging Face and its model download CDN; runtime assets came from the local app.

The actual Kokoro/Web Audio UI then read a synthetic test tossup. Space froze progressive text immediately; an incorrect interrupt earned a neg; Resume continued the audio from the paused point with buzz lockout; and the session completed with a `0 / 0 / 1` stat line.

The updated production worker and real UI repeated this check successfully. While the neg's tossup was paused, **Fix pronunciation → Preview selected voice → Stop → Close** played a separate neural preview using the shared model. The original tossup text stayed frozen, and subsequent Resume completed its audio with the saved offset and a `0 / 0 / 1` result. Recorded raw phoneme comparisons and nonzero PCM output for difficult names are in `pronunciation-evidence.json`; the rationale and final dictionary are in `PRONUNCIATION.md`.

System Voice was selected for a live QBReader session in production. Chromium enumerated Microsoft David, Mark and Zira local English voices and the app called native speech with David. This headless browser reported `synthesis-failed`; the unchanged reader fell back to progressive text, completed the session and retained its results after refresh. Audible native System Voice could not be verified in this browser environment. Reader unit tests also verify system voice selection, pronunciation delivery and fallback behavior.

**Not directly verified:** GPU execution, because this browser returned no WebGPU adapter; audible native System Voice (the headless native synthesizer failed); subjective pronunciation quality for unusual academic clues; the final public deployment. The implemented GPU path and fallback decisions remain in the production worker. Forced word alignment is intentionally estimated, as described in the README.

The repository was initialized locally. This sandbox uses separate Windows accounts for some file/tool operations; Git's ownership check may require a command-scoped `safe.directory` option when inspecting it here. That does not affect npm or the app and no global Git configuration was changed.
