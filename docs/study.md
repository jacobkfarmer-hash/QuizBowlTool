# Study / flashcards

Open **Study** in the main navigation, then **Create Deck**. Paste one answer per line or upload TXT/CSV (`answer`, with optional `category` and `type`). Default difficulties are 2–4; levels 1–10 are selectable. Analysis creates one card per unique target, saves progress to IndexedDB, and lets you stop, resume, retry, edit, remove, and save in bulk.

Saved decks offer numbered sets (20 cards by default), custom sizes and combined ranges. Random library practice filters by deck, category, subcategory, or answer type and avoids duplicate targets. Wrong submissions keep the current card visible. Correct submissions advance after a short feedback pause, or immediately with Enter. Repeat and trouble-card sessions start fresh counters while retaining lifetime attempts. Unfinished sessions can be resumed from the library after refresh.

## Architecture

- `src/study/types.ts`: deck, card, source, attempt and session records.
- `src/study/import.ts`, `answers.ts`, `practice.ts`, `statistics.ts`: deterministic import, normalization, selection, attempt summaries and aggregate statistics.
- `src/study/sources.ts`: QBReader `/query` adaptation and a 30-day IndexedDB source cache.
- `src/study/clues.ts`, `generation.ts`: source-backed phrase extraction, clustering, ranking and controlled generation.
- `src/study/storage.ts`: transactional deck and attempt persistence.
- `src/study/ui/`: `StudyHome.tsx`, `DeckCreator.tsx`, `DeckDetail.tsx`, `CardReview.tsx`, `SetPicker.tsx`, `PracticeSession.tsx`, `SessionSummary.tsx`, `StudyStats.tsx`, and `study.css` implement creation, review/editor, deck detail, set/random selection, practice, summary, library and stats views with scoped responsive styles.
- `src/data/db.ts`: additive schema version 3. Existing settings, quiz bowl sessions, presets, pronunciations and seen-question tables are retained. All-data deletion includes Study tables; ordinary edits/deletion retain historical study attempts.
- `src/api/client.ts`: Study opts into cancellation and specific error messages while sharing the existing serialized, retrying request queue. Existing gameplay callers retain their behavior.
- `src/App.tsx`: lazy-loaded Study navigation view. TTS and deployment/service-worker code are unchanged.
- `src/ui/Setup.tsx`: the all-local-data deletion confirmation now explicitly includes study decks/history and pronunciation corrections.

## Clue generation

Search answerlines for the exact target (normalized articles/punctuation), then optionally supplement with bonus parts that explicitly mention it. Only matching direct bonus parts are counted; unrelated sibling parts are excluded. Preserve source IDs, question text, answerlines, set/packet, difficulty and metadata. Related bonus evidence improves clues but does not satisfy the minimum direct-source threshold.

Detect `(*)`, stored power word counts when present, or an initial bold power span. Questions without structural power evidence contribute common clues only. Segment sentences, retain proper names, mine recurring n-grams, normalize stopwords/light inflections and selected synonyms, and cluster by token overlap. Rank distinct-source recurrence and power recurrence, select approximately three hard and three common concepts, and suppress overlapping phrases. Every selected phrase comes from fetched evidence. Type and category inference favor evidence over import hints.

Cards with ten or fewer useful direct sources, or fewer than five selected concepts, are flagged **Insufficient Data**. Empty results and request/parsing failures stay reviewable and retryable. A failed regeneration retains an existing usable card. Editing/regeneration retain its ID and historical statistics. Regeneration reuses cached sources by default; **Refresh QBReader source data** in deck settings explicitly fetches new evidence.

## Practical limits

This is deterministic text processing, not semantic AI: some phrasing or type inference needs manual review. Each term analyzes a bounded sample (up to 80 tossups and 80 bonuses, plus 25 supplemental bonuses), rather than downloading the full corpus. Generation needs internet; exact answers and aliases work locally, and uncertain answers use QBReader when available. The existing Settings backup covers quiz bowl data; Study records currently remain on the browser/device. No backend, paid service, telemetry or new service worker is introduced.

## Verification

`tests/study.test.ts` covers normalization, imports, actual power boundaries, paraphrase merging, ranking, thresholds, sets/ranges, random uniqueness, attempts/summaries, atomic writes, caching, cancellation, partial failure/retry and an actual version-2 to version-3 database migration. `e2e/study.spec.ts` tests creation through saved practice, wrong/correct behavior, repeat/trouble runs, refresh recovery, CSV editing, combined sets, random filters and mobile layout. `e2e-production/study.spec.ts` runs those flows on the production build.
