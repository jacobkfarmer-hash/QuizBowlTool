# Verification record

Verified October 3–4, 2026, using Node 24.12 and a local Chromium browser on Windows. The pronunciation/deployment update extends the existing simulator.

| Check | Result |
| --- | --- |
| `npm install` | Passed; dependencies and local ONNX runtime assets installed |
| `npm run dev` | Running; browser application opened successfully |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run test` | 62 tests passed across seven test files |
| `npm run test:integration` | 21 integration/reader/data tests passed across three files (also included in the full suite) |
| `npm run test:e2e` | Six deterministic browser tests passed |
| `npm run test:e2e:production` | Production/offline PWA test passed |
| `npm run build` | Passed; complete static output in `dist/` |
| `npm audit` (original dependency installation) | Zero reported vulnerabilities; this update did not change dependencies |

Browser tests cover a complete Match with prompt clarification, scoring, every bonus part and saved results after reload; a neg that resumes with buzz lockout and zero bonus requests when disabled; setup validation, saved presets, theme and a 390px viewport; and two tossups with refresh recovery at a paused buzz checkpoint.

The new browser tests add durable pronunciation edit/delete, versioned export/import and invalid-version rejection, mobile Settings layout, and preview honoring the voice just selected in Setup without starting a game. Production testing verifies diagnostics are absent, the service worker precaches only the small shell, and an offline reload still opens saved session results and the personal dictionary. An initial offline cache mismatch caused by `Vary: Origin` was fixed and the production test passes.

New unit/integration coverage includes eight vocabulary domains with stable spoken text; guide/parenthesis handling; Unicode whole names and nonrecursive precedence; chunk continuity and short-tail prevention; dictionary delivery to system speech; preview bypassing a second lexicon pass; strict nested import validation; idempotent merge; durable dictionary edits; and transaction rollback after a simulated storage write failure.

Additional verification used the live official API, including its current `difficulties` parameter, CORS headers, formatted question responses and answer endpoint. A real question was played progressively, buzzed, frozen, given up and saved through session results. Desktop/gameplay screenshots were visually reviewed; the phone viewport had no horizontal overflow.

The updated live cross-origin browser check returned HTTP 200 and `response.type === 'cors'` for **random-tossup**, **random-bonus** and **check-answer**, with an accepted answer ruling. A request using `Origin: https://cadence-example.pages.dev` returned `Access-Control-Allow-Origin: *`. No proxy is needed. This is a current architecture/CORS check, not verification of an already deployed Cloudflare site.

`dist/` was inspected: 15 static files, no `.onnx` weights, no diagnostic component, and no file above Pages' 25 MiB limit. The largest runtime WASM asset is 21,596,019 bytes. The model still downloads from its supported remote source and caches separately. Node selection is specified by `.node-version`; application/build configuration needs no secrets or environment variables.

The actual production Kokoro worker downloaded and initialized the **q8 WASM model**, listed 28 voices, and synthesized 67,200 nonzero PCM samples at 24,000 Hz (2.8 seconds). Browser caches `transformers-cache` and `kokoro-voices` were created. Remote speech-resource requests used Hugging Face and its model download CDN; runtime assets came from the local app.

The actual Kokoro/Web Audio UI then read a synthetic test tossup. Space froze progressive text immediately; an incorrect interrupt earned a neg; Resume continued the audio from the paused point with buzz lockout; and the session completed with a `0 / 0 / 1` stat line.

The updated production worker and real UI repeated this check successfully. While the neg's tossup was paused, **Fix pronunciation → Preview selected voice → Stop → Close** played a separate neural preview using the shared model. The original tossup text stayed frozen, and subsequent Resume completed its audio with the saved offset and a `0 / 0 / 1` result. Recorded raw phoneme comparisons and nonzero PCM output for difficult names are in `pronunciation-evidence.json`; the rationale and final dictionary are in `PRONUNCIATION.md`.

**Not directly verified:** GPU execution, because this browser returned no WebGPU adapter; every installed system voice/browser combination; subjective pronunciation quality for unusual academic clues. The implemented GPU path and fallback decisions remain in the production worker. Forced word alignment is intentionally estimated, as described in the README.

The repository was initialized locally. This sandbox uses separate Windows accounts for some file/tool operations; Git's ownership check may require a command-scoped `safe.directory` option when inspecting it here. That does not affect npm or the app and no global Git configuration was changed.
