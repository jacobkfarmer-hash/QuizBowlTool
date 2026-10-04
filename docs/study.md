# Study / flashcards

Open **Study** in the main navigation, then **Create Deck**. Paste one answer per line or upload TXT/CSV (`answer`, with optional `category` and `type`). Default difficulties are 2–4; levels 1–10 are selectable. Analysis creates one card per unique target, saves progress to IndexedDB, and lets you stop, resume, retry, edit, remove, and save in bulk.

Saved decks offer numbered sets (20 cards by default), custom sizes and combined ranges. Random library practice filters by deck, category, subcategory, or answer type and avoids duplicate targets. Wrong submissions keep the current card visible. Correct submissions advance after a short feedback pause, or immediately with Enter. Repeat and trouble-card sessions start fresh counters while retaining lifetime attempts. Unfinished sessions can be resumed from the library after refresh.

## Architecture

- `src/study/types.ts`: deck, card, source, attempt and session records.
- `src/study/import.ts`, `answers.ts`, `practice.ts`, `statistics.ts`: deterministic import, normalization, selection, attempt summaries and aggregate statistics.
- `src/study/sources.ts`: QBReader `/query` adaptation and a 30-day IndexedDB source cache.
- `src/study/positions.ts`: publication years, absolute character offsets, normalized tossup positions and structural power boundaries.
- `src/study/clue-text.ts`, `connections.ts`, `clues.ts`: entity/phrase normalization, conservative work/detail association, clustering, selection and ordering.
- `src/study/scoring.ts`, `phrases.ts`, `answer-types.ts`: separate scoring, contextual phrase compression and type/metadata inference. No answer-specific facts or paid model calls.
- `src/study/generation.ts`: bounded generation with progress/cancellation and persistence; evidence is analyzed once per card.
- `src/study/storage.ts`: transactional deck and attempt persistence.
- `src/study/ui/`: `StudyHome.tsx`, `DeckCreator.tsx`, `DeckDetail.tsx`, `CardReview.tsx`, `SetPicker.tsx`, `PracticeSession.tsx`, `SessionSummary.tsx`, `StudyStats.tsx`, and `study.css` implement creation, review/editor, deck detail, set/random selection, practice, summary, library and stats views with scoped responsive styles.
- `src/data/db.ts`: additive schema version 3. Existing settings, quiz bowl sessions, presets, pronunciations and seen-question tables are retained. All-data deletion includes Study tables; ordinary edits/deletion retain historical study attempts.
- `src/api/client.ts`: Study opts into cancellation and specific error messages while sharing the existing serialized, retrying request queue. Existing gameplay callers retain their behavior.
- `src/App.tsx`: lazy-loaded Study navigation view. TTS and deployment/service-worker code are unchanged.
- `src/ui/Setup.tsx`: the all-local-data deletion confirmation now explicitly includes study decks/history and pronunciation corrections.

## Clue generation

Search answerlines for the exact target (normalized articles/punctuation), then optionally supplement with bonus parts that explicitly mention it. When the historical tossup sample is truncated, add a separately bounded sample from the last five years so the API's default ordering does not exclude modern material. Deduplicate source IDs. Only matching direct bonus parts are counted; unrelated sibling parts are excluded. Preserve source IDs, question text, answerlines, set/packet, publication year, difficulty and metadata. Related bonus evidence improves clues but does not satisfy the minimum direct-source threshold. Optional recent/supplemental searches failing do not discard successful direct evidence.

Detect stored power word counts, `(*)`, or an initial bold power span. Track each candidate's actual character offset divided by that tossup's full length, including candidates in sentences crossing power. Sentence position is diagnostic only. Questions without a power marker still supply early-clue evidence; power is a separate 1.4× multiplier, not the definition of difficulty. Bonus evidence never enters tossup-position or power statistics.

Retain formatted work titles and proper names, mine bounded recurring n-grams, and normalize stopwords/light inflections and action synonyms. Cluster token-similar paraphrases. Count a concept once per question, using its strongest occurrence, while retaining detected sentence occurrences for traceability. Work/detail relationships require explicit supporting context in at least two independent questions and a clear advantage over competing works. Ambiguous associations remain separate. Suppress overlapping selected concepts.

Hard scoring combines smooth `exp(-0.105 × age)` recency decay, continuous early-position weighting, power, `log(1 + independent questions)` confidence, corpus distinctiveness, modest cross-set/year consistency, recent early/power fractions, and mild generic/stale penalties. Repetition within one tournament receives diminishing evidence. Common scoring gives recurrence more influence but retains recency, distinctiveness, consistency and bonus discounts. Unknown publication years receive conservative nonzero weight; record update dates are never treated as publication dates. Select about three hard and three common clues, then order by normalized position in small stable bands, using the evidence scores within each band.

Generate short phrases from supporting clauses rather than outputting bare cluster labels. Preserve modifiers, actions, objects, locations, imagery and creator relationships; remove question-writing scaffolding and prefer recurrent details. Keep at most roughly twelve words beyond the title/entity and cap phrases at 24 words. Learned connections may combine an attested detail with its supported work title. No fixed Bernini or other answer-specific rules exist. Specific answer types include Sculptor and Poet. Generation metrics appear only in the collapsed review evidence panel; normal practice contains just the compact clue card.

Cards with ten or fewer useful direct sources, or fewer than five selected concepts, are flagged **Insufficient Data**. Empty results and request/parsing failures stay reviewable and retryable. A failed regeneration retains an existing usable card. Editing/regeneration retain its ID and historical statistics. Regeneration reuses cached sources by default; **Refresh QBReader source data** in deck settings explicitly fetches new evidence.

## Practical limits

This is deterministic text processing, not semantic AI: imperfect grammar, missed paraphrases and incomplete associations still need manual review. Each term analyzes a bounded sample (up to 80 historical tossups, 80 recent tossups when needed, 80 direct bonuses and 25 supplemental bonuses), rather than downloading the full corpus. Exact-target matching can miss answerline variants; empty results remain editable/retryable. Existing cached sources may lack explicit years (set-name years are a fallback); use **Refresh QBReader source data** for a new sample. Regenerate existing saved cards to apply the new algorithm; saved/manual cards are not silently rewritten. Generation needs internet; exact answers and aliases work locally, and uncertain answers use QBReader when available. The existing Settings backup covers quiz bowl data; Study records currently remain on the browser/device. No backend, paid service, telemetry or new service worker is introduced.

## Verification

`tests/study.test.ts` covers normalization, imports, actual power boundaries, paraphrase merging, ranking, thresholds, sets/ranges, random uniqueness, attempts/summaries, atomic writes, caching, cancellation, partial failure/retry and an actual version-2 to version-3 database migration. `tests/study-ranking.test.ts` covers relative offsets across question lengths, crossing-power positions, independent recurrence, recency/power weighting, recent-early ranking over older late frequency, consistency/staleness, bonus isolation, contextual Bernini/generic fixtures, supported versus ambiguous work connections, concise phrasing and bounded modern retrieval. `e2e/study.spec.ts` tests creation through saved practice, wrong/correct behavior, repeat/trouble runs, refresh recovery, CSV editing, combined sets, random filters and mobile layout. `e2e-production/study.spec.ts` runs those flows on the production build.
