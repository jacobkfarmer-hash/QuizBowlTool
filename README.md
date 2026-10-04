# Cadence — free quiz bowl practice

A complete solo practice room and Match simulator for high-school quiz bowl. React, TypeScript and Vite run everything in the browser. There is no account, backend, database server, API key, credit card, advertising, or analytics service.

## Run

Use **Node 24 LTS** and npm. Node 22.12+ also satisfies the tooling requirements.

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite (normally http://127.0.0.1:5173). If that port is occupied, Vite selects another. No environment variables are needed. Do not open `index.html` as a file: local workers and modules require an HTTP server.

```sh
npm run typecheck
npm run lint
npm run test
npm run test:integration
npm run build
npm run preview
```

For the deterministic browser tests, install the test browser once:

```sh
npm run install:e2e
npm run test:e2e
npm run build
npm run test:e2e:production
```

The test browser is installed in the ignored `.browsers/` directory, keeping it separate from the app. The E2E runner starts a local Vite server automatically. The production output is `dist/`; serve the **whole** directory, including `runtime/` and the worker assets. Deploy at a domain root; the local runtime URL currently assumes `/runtime/`.

## What works

- One gameplay reducer for Practice and Match, with independently configurable bonuses, scoring, powers, interrupts, negs, resume behavior and re-buzz rules.
- 1–500 tossups; 5/10/20/24 shortcuts. Practice defaults to bonuses off; Match defaults to bonuses on. Solo means there is no simulated opponent.
- Relative category and difficulty weights, live normalized probabilities, IS-A Academic / Equal Categories / Mixed HS presets, and editable saved presets.
- Progressive formatted text, audio-only and text-plus-audio presentations, instant keyboard buzz, typed answer checks, directed prompts and context-aware clarifications.
- Actual power-marker boundaries, configurable points, give-up, manual ruling overrides and undo before advancing.
- General-distribution bonuses, independent weighted difficulty draws, each part shown separately, support for arbitrary part counts and actual supplied part values.
- Local Kokoro speech in a worker, WebGPU preference, WASM fallback and available browser system voices. The same reader is retained across sessions in one tab.
- Small question pools, one upcoming tossup prefetched, optional bonus prefetch, repeat prevention by stable IDs, bounded exhaustion handling, retry states and refresh recovery.
- Results, full question/bonus review, sortable category/difficulty/quarter tables, configured versus realized distributions, buzz metrics, Match trends and deterministic performance observations.
- Local session history, custom history filters, save/load/rename/delete presets, confirmed deletion/reset controls, system or explicit dark/light theme, keyboard focus, reduced motion and phone layouts.
- A deterministic spoken-text pipeline, built-in name dictionary, personal pronunciation corrections with voice preview, development-only phoneme diagnostics, validated JSON data transfer, and an About screen.

## Deploy publicly for free — Cloudflare Pages

Use this existing project as the root of a GitHub repository, including `package-lock.json`, `public/` icons/manifest and `scripts/`. `node_modules`, `dist`, test browser downloads and generated `public/runtime` are ignored. Installation's `postinstall` copies runtime files before the build. `.node-version` selects Node 24 without an environment variable.

1. Run `npm ci`, `npm run build` and `npm run preview` locally. The output is the complete `dist/` directory.
2. Create an empty GitHub repository. From the project directory, run the following, replacing the remote URL:

   ```sh
   git add .
   git commit -m "Prepare Cadence for public deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

3. In Cloudflare's dashboard, open **Workers & Pages → Create application → Pages → Import an existing Git repository / Connect to Git**. Connect GitHub and select that repository.
4. Set **Production branch: `main`**, **Framework preset: Vite**, **Build command: `npm run build`**, **Output directory: `dist`**. Leave Root directory blank when this project is the repository root; otherwise enter its repository-relative folder. No environment variables, secrets or Functions are required.
5. Select **Save and Deploy**. Share the resulting HTTPS `https://YOUR-PROJECT.pages.dev` URL. Subsequent **GitHub push → Cloudflare build → public site update** happens automatically.
6. Optional: open the Pages project's **Custom domains → Set up a custom domain** and follow the DNS instructions. A custom domain is not needed. Export/import your data when switching domains because browser storage belongs to each origin.

See Cloudflare's [React deployment guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/), [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) and [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).

No ONNX model weights are bundled in `dist/`. Kokoro obtains them from its supported Hugging Face model source. Bundled ONNX **runtime** WASM is code, not model weights; its largest file is about 20.6 MiB, below Pages' [25 MiB individual-asset limit](https://developers.cloudflare.com/pages/platform/limits/). Keep the entire output, including `runtime/`, reader worker assets and manifest. No service worker is generated. Host at a domain root. The app needs no running server after deployment.

Live browser checks returned HTTP 200 with CORS responses for random tossups, random bonuses and answer checking. A request with a Pages-style Origin also returned `Access-Control-Allow-Origin: *`. Direct **browser → QBReader** therefore works; there is no Worker proxy. This verifies the current architecture, not an already published Cloudflare URL. Recheck on your final public URL if the upstream API changes.

## Pronunciation, sharing and browser storage

The canonical clue remains unchanged. `canonicalDisplayText` is the safe display form; `spokenText` is separate. Processing detects explicit pronunciation guides, resolves whole-word/name corrections, normalizes common notation, builds contextual clauses, obtains Kokoro's actual phonemes, then generates local audio. Priority is **personal correction → built-in lexicon → explicit writer guide → default phonemizer**. A matched guide is silent even when a higher-priority correction supplies the spelling. Ordinary semantic parentheses remain spoken. Unlabelled ambiguous guides are deliberately left alone.

Use **Fix pronunciation** after a tossup/bonus part or in question review. Enter/select the term, enter a spoken spelling, preview using your selected voice/speed, then save. **Settings → Pronunciation Dictionary** supports adding, editing and deleting corrections. These live in IndexedDB and apply on subsequent reads. Unicode NFC, whole-name boundaries, longest-match precedence within a priority, and nonrecursive substitution avoid changing unrelated words. Stress capitals in pronunciation spellings are lowercased before TTS: Kokoro's phonemizer can otherwise read `MEE` as initials. This does not lowercase ordinary question text or its acronyms.

**Development only:** `npm run dev` exposes a separate Diagnostics screen with original HTML/display text, normalized input, source-token chunk ranges and generated phonemes. Production builds remove that screen and its component. The public `kokoro-js` stream API exposes the phonemes used for inference; diagnostics actually synthesize audio and may download the model. See [PRONUNCIATION.md](PRONUNCIATION.md) and the measured [phoneme evidence](pronunciation-evidence.json).

**Settings → Export Data / Import Data** moves sessions, presets, corrections, config/theme and seen IDs with version 1 `cadence-data` JSON. Nested records, enums, numeric bounds, IDs, dates, dictionary entries and question schemas are validated before a transaction writes anything. HTML is sanitized. Imports merge history/presets without overwriting an existing ID, and replace matching corrections/preferences. Failed writes roll back. Invalid versions/data and files over 40 MB are rejected. Recovery checkpoints are intentionally device-specific and excluded. No cloud account is needed.

Cadence has no app-shell service worker and requires internet to load the site, fetch fresh questions and check answers. History/settings remain in IndexedDB across refreshes. Kokoro/Transformers model and voice caches are independent and unchanged. The manifest and icons remain, but installability and offline page loading are not supported.

A temporary **production-only startup migration** inspects this origin's registrations, unregisters the legacy root `/sw.js` worker (active, waiting or installing), and deletes only Cache Storage names beginning `cadence-shell-` or `cadence-runtime-`. Unrelated registrations/caches, model/voice caches and IndexedDB are preserved. A controlled page reloads once before React/gameplay mounts to release the old controller; a sessionStorage guard prevents reload loops. Missing or restricted browser APIs do not prevent startup. Remove `src/legacy-worker-cleanup.ts` and its startup call after a release or two.

The migration must execute the new JavaScript. If an old cache-first worker keeps serving the previous release, use Chrome/Edge's hard reload (Ctrl+Shift+R) to load the new release; then cleanup runs automatically. Merely removing `sw.js` on the server cannot execute code in an already cached old app. Do not clear all site data, since that would delete saved IndexedDB history/settings. Close stale app tabs so they cannot run the former registration code again.

## Probability behavior

**Weights are probabilities, not quotas.** They never need to add to 100. `2 / 6 / 2` and `20 / 60 / 20` describe the same probabilities. Zero disables a choice; negative, non-finite and all-zero weight configurations cannot start.

Each tossup independently draws a category group, resolves its QBReader category, and independently draws difficulty 2, 3 or 4. Philosophy & Theology resolves equally to Philosophy or Religion. No Miscellaneous practice category is offered; Current Events and Other Academic are never deliberately requested. No quota balancing, deficit tracking or later-round correction exists.

**Short sessions may differ substantially from configured category percentages.** Results show both configured and realized distributions. Across multiple sessions, configured probabilities are weighted by tossups heard in each session. If a combination has no unseen questions after three small batches, it becomes unavailable for that session and selection conditions on the remaining weighted combinations. The original configuration is preserved. All enabled combinations exhausted produces an actionable error.

## QBReader integration

The official docs and live JSON/CORS responses were checked before implementation:

- [Overview and rate limit](https://www.qbreader.org/tools/api-docs/)
- [Random tossup](https://www.qbreader.org/tools/api-docs/random-tossup)
- [Random bonus](https://www.qbreader.org/tools/api-docs/random-bonus)
- [Answer checking](https://www.qbreader.org/tools/api-docs/check-answer)
- [Question schemas](https://www.qbreader.org/tools/api-docs/schemas/)

Endpoints and base URL live together in `src/api/client.ts`. Retrieval sends `difficulties` (plural), `standardOnly=true`, and two-question batches. Bonuses send `threePartBonuses=true` with no category filter. The parser rejects malformed objects and bonuses missing an answerline; optional numeric `values` are honored if present, otherwise configurable 10-point defaults apply. Questions retain their stable `_id`, packet and set metadata.

Requests are serialized with at least 400ms between starts (at most 2.5/sec), far below the documented 20/sec limit. Each request has a 12-second timeout and up to three attempts with exponential backoff for transient failures; permanent 4xx errors are not retried, except 429. The app uses the API at runtime, never scrapes pages, never bundles the question database, and never circumvents limits. Test fixtures are original synthetic questions in the verified schema.

Answer checks send the formatted answerline and typed answer. `accept`, `reject`, `prompt` and nullable/omitted `directedPrompt` are handled. Clarification first checks the new answer by itself, then includes previous prompted words if a standalone clarification is rejected. This handles “Bach” → “Johann Sebastian” without contaminating a complete corrected answer. The judge can be imperfect: override or undo from the ruling view. Raw adjudication events, user answers, buzz timing and manual-override flags remain available for recalculation.

This is intended for personal, noncommercial use. Question content remains subject to its authors’ and QBReader’s terms; the application does not grant redistribution rights.

## Free local speech

[Kokoro.js documentation](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) is the source for the current `from_pretrained` / `generate` APIs. The model is `onnx-community/Kokoro-82M-v1.0-ONNX`. A worker probes for a WebGPU adapter and uses `fp32` when available, then falls back to quantized `q8` WASM if GPU initialization fails. ONNX runtime assets are copied locally by `postinstall`; no runtime JS CDN is needed. The phonemizer is bundled.

**First use downloads a large model** (roughly 90 MB for quantized WASM, substantially larger for fp32 WebGPU, plus supporting resources). Progress appears in the reader status. Model/tokenizer resources and voices are stored in browser CacheStorage by Transformers.js/Kokoro. Subsequent use normally reuses that cache. Cache eviction, private browsing, changing origin or clearing browser data can trigger another download. One worker/model stays alive across rounds in a tab; the current chunk and two following chunks are synthesized ahead, and obsolete audio buffers are released.

The reader uses contextual punctuation-aware clauses, retains their original token ranges, measures generated PCM duration, and estimates word times using token length and punctuation. Web Audio playback time drives text reveal. Buzz pauses the audio source immediately and freezes the text; a resumed neg continues from its saved audio offset. Forced phoneme/word alignment is not claimed. Speaking speed is passed to Kokoro synthesis; Web Audio stays at playback rate 1, preserving pitch. Punctuation is retained for natural pauses and there is no artificial delay between chunks.

Auto tries Kokoro, then System Voice. Model failures are remembered on the shared engine for the rest of the page session, including later questions and previews. Audio-permission failures keep the model available for retry after a tap. “Use System Voice now” cancels a long model preparation immediately. System Voice immediately queries browser voices, waits up to one second for delayed `voiceschanged` enumeration, and retries the list. It prefers the selected English voice, local English, any English, the default voice, then any available voice. Non-local browser voices are accepted and may require internet; the app configures no paid speech API. Word boundary events improve native timing when available; otherwise short-clause estimates are used. Native speech cannot seek precisely after refresh, so recovery resumes approximately within the current clause. If both engines fail, progressive text keeps the session usable, even when Audio Only was originally selected. Text-only timing uses WPM.

Speech preprocessing maintains a separate spoken form and leaves canonical clues and power semantics intact. It removes the power marker from speech, sanitizes HTML, applies the dictionary and clear pronunciation guides before chunking, expands common titles/initials, handles a small conservative set of royal/Papal Roman numerals, math operators and chemical expressions, and normalizes spacing. Dates/years and unfamiliar expressions are deliberately left literal for the model to interpret, rather than risk changing a clue. Complex formulas and uncommon names remain imperfect.

Audio uses one shared context. **Start session**, **Resume**, pronunciation preview, and **Settings → Test voice** create/resume it synchronously from the tap before asynchronous model/question work. Question completion and reader disposal never close it. Suspended/interrupted audio shows **Tap to enable audio**; a closed context is recreated on the next gesture. The Settings test speaks “Quiz bowl reader ready.” and reports high-quality/system readiness after playback starts, or “Audio could not start” after fallback. Development Diagnostics shows browser/voice availability, localService flags, context state, backend and the last error/fallback reason in this tab only.

## Keyboard and touch

- **Space:** buzz during active tossups; pauses audio and text immediately, then focuses the answer input.
- **Enter:** submit an answer or clarification; continue from a ruling when focus is outside another control. Focused buttons also work with their native Enter behavior.
- **Escape:** closes browser-native confirmation/preset dialogs. Expanded review/override details can be closed with Escape.
- Pause/resume, Give up, bonus part Give up, and a large touch Buzz button are visible controls.

Space never triggers a gameplay buzz while typing in an input, textarea, select, or editable field. With interrupts disabled, Buzz stays disabled until the question ends. Incorrect interrupts resume by default and lock the player out unless re-buzz is explicitly enabled.

## Statistics definitions

| Metric | Definition |
| --- | --- |
| P | Correct tossup conversion at/before a present power boundary, with powers enabled |
| 10 | Regular correct conversion (including all conversions with powers disabled) |
| N | Incorrect interrupt with the neg rule enabled |
| TUH | Number of distinct presented/resolved tossups with stored attempts |
| TU Points | Sum of scored tossup answer events; standard scoring is `15P + 10 × (regular conversions) − 5N` |
| GP | Completed Match sessions only |
| Player PPG | Tossup points from completed Matches / GP; **no bonus points** |
| Total score | Tossup points + bonus points |
| PPB | Bonus points / bonuses heard; N/A when bonuses are disabled or none heard |
| Conversion % | Tossups converted / TUH |
| Points/TUH | Tossup points / TUH |
| Buzz % | Revealed original words / total original words × 100; lower means earlier |

Configured score values determine points; the standard formula is explanatory, not hard-coded. Turning off numerical scoring preserves outcome/skill events but awards zero points. Turning off negs does not classify wrong interruptions as N. Re-buzz retains separate neg and conversion events for the same tossup, with TUH counted once. Bonus attempts track bonuses heard, parts heard/correct and points. Audio elapsed time is recorded at buzz; full audio duration is optional because streaming chunks may not all be synthesized yet. Text-token position is the stable primary buzz metric.

Tables include P/10/N, TUH, points, points/TUH, conversion, power and neg rates, mean/median correct buzz and mean neg buzz. Summary metrics separate power/ten/neg buzz positions. Quarters use normalized `tossupNumber / configuredCount`, with right-inclusive quarter boundaries and no fixed 20/24-question assumption. Practice contributes to skill/category analytics but never automatically becomes a tournament game. Incomplete Matches do not increase GP or Player PPG.

Pattern observations run entirely on the client with no LLM. They need at least 10 tossups overall and typically 5 per category/difficulty, with additional minimums for buzz/neg comparisons. Trends cover PPG, powers, negs, correct buzz and PPB. Recent Match comparisons normalize by tossups to avoid calling different round lengths an improvement.

## Local data, privacy and recovery

Dexie wraps IndexedDB tables for settings, presets, seen question IDs and sessions containing raw tossup/bonus events plus reviewed questions. Checkpoints include the current question, reader token offset, phase and rule configuration. Progress is checkpointed about once a second; buzzes, rulings and other transitions save immediately. Writes are serialized in invocation order. An interrupted answer check returns to answering on recovery; the app never silently invents a ruling. Seen IDs are persisted before presenting a question. History/statistics persist across refreshes; loading the site and retrieving new questions requires internet.

Your private analytics and history are not uploaded. The app requests QBReader’s question/answer services and Hugging Face’s model/resource hosts (which may use their download CDN). Browser-provided System Voice may use the browser’s own online speech provider. Typed answers and answerlines are sent to QBReader for judging. No paid or metered speech service is used. Browser permission/storage failures are shown explicitly. Session deletion retains seen IDs; Reset question history clears only seen IDs; Clear all local data clears settings, history, seen IDs presets and pronunciation corrections after confirmation. TTS model CacheStorage is browser-managed and separate from application data; clear it through browser site-data controls if needed.

Remote HTML is untrusted and sanitized with DOMPurify’s narrow tag allowlist before storing/rendering it. Scripts, event handlers, links, images and arbitrary attributes are discarded. Display tokenization preserves allowed emphasis and math sub/sup formatting while storing the power boundary separately. Metadata and answer text are escaped by React.

## Architecture

| Area | Files |
| --- | --- |
| API endpoints, rate limiting, timeout/retry | `src/api/client.ts` |
| Current schemas, validation, HTML sanitization | `src/api/parser.ts`, `src/core/types.ts` |
| Category mapping, presets, configuration validation | `src/core/config.ts` |
| Probability normalization and weighted selection | `src/core/probability.ts` |
| Small pools, upcoming draw, exhaustion/repeat prevention | `src/data/pools.ts`, `src/ui/useGame.ts` |
| Explicit gameplay transitions and raw events | `src/core/game.ts` |
| Tossup/bonus scoring and prompt context | `src/core/scoring.ts`, `src/core/adjudication.ts` |
| TTS abstraction, playback clock, chunk timeline | `src/reader/playback.ts`, `src/reader/text.ts` |
| Deterministic pronunciation and built-in dictionary | `src/reader/pronunciation.ts`, `src/data/pronunciations.ts` |
| Model worker, Web Audio playback, browser fallback | `src/reader/kokoro.worker.ts`, `kokoro.ts`, `system.ts`, `manager.ts` |
| Derived statistics and deterministic patterns | `src/stats/metrics.ts`, `patterns.ts` |
| Durable settings, raw sessions and checkpoint queue | `src/data/db.ts` |
| Versioned backup validation and transactional import | `src/data/transfer.ts` |
| Temporary legacy worker cleanup; retained manifest | `src/legacy-worker-cleanup.ts`, `public/manifest.webmanifest` |
| Setup, gameplay, review, history and results | `src/ui/`, `src/App.tsx`, `src/styles.css` |

Stale work is guarded by generation IDs and abort signals. A retired question’s syntheses can finish in the worker, but they cannot begin playback or update the current question. Illegal reducer actions do nothing. Expensive neural inference does not run on the React thread.

## Tests and implementation choices

Vitest tests probability normalization/large seeded distributions, category mappings, difficulty filtering, all scoring toggles, power boundaries, legal/illegal reducer transitions, prompts, neg resume/lockout, re-buzz events, manual overrides, arbitrary bonuses, PPG/PPB, normalized quarters, safe preprocessing, current response contracts, durable DB reopen and bounded pool exhaustion. React Testing Library exercises complete mocked tossup/bonus flows. Reader tests cover text pause/resume, fallback engines and stale initialization. Playwright mocks all QBReader calls and tests a full Match, neg lockout without any bonus requests, history reload, validation, presets and a narrow viewport.

`esbuild` resolves to the maintained `esbuild-wasm` implementation so local tooling works in Windows environments that restrict native executables’ parent-directory traversal. Vite uses its supported config runner. This affects build tooling only, not production gameplay. A patched `sharp` override is used for Transformers.js’s Node-only image dependency; browser TTS does not use image decoding. No Python, Docker or external database is required.

Known practical limits: answer checking and unseen question availability depend on QBReader; speech alignment and unusual scientific pronunciations are estimates; first neural load can exceed a slow device’s timeout (120 seconds per worker operation), at which point local system/text fallback remains available; WebGPU support varies by browser/driver. A screen refresh can replay a small amount of a clue around the last checkpoint. Closing a tab at the exact instant of a transition can still interrupt an unfinished IndexedDB transaction.
