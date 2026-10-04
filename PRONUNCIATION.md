# Pronunciation implementation and measured diagnosis

The installed package is **kokoro-js 1.2.1**, with its **phonemizer 1.2.1** dependency and **Transformers.js 3.8.1**. Model: `onnx-community/Kokoro-82M-v1.0-ONNX`. The initial voice remains **af_heart**. An available WebGPU adapter selects **fp32**, following the [upstream recommendation](https://github.com/hexgrad/kokoro/tree/main/kokoro.js). Failed/unsupported GPU initialization falls back to **q8 WASM**. Installed local English SpeechSynthesis voices are the final audio fallback; progressive text remains available.

## What was wrong

- Proper-name phonemization can fail before neural inference. Actual `stream()` results for “The hero is Diomedes.” contained `dɪˈoʊmdz`, losing syllables. “Read Thucydides.” produced `θˈʌsɪdˌaɪdz`. Changing voice or inference dtype does not repair these upstream strings.
- Preprocessing was performed separately **after** slicing chunks at punctuation or a fixed 24-word cap. Names and their guides could cross that boundary. A fixed cap could leave a tiny final utterance. Words themselves were not split.
- The old quoted-parenthesis substitution recognized only a single word before a quote. Multi-word/labelled guides were often read redundantly, while ordinary quoted parentheses could be altered. There was no pronunciation dictionary or personal override.
- eSpeak can interpret stress capitals as acronyms: a measured “MEE” in a respelling produced `ˌɛmˌiːˈiː`, rather than `miː`. An isolated “ih” was read as `aɪ`. Human moderator guides therefore cannot simply be copied verbatim into TTS.
- Changing Web Audio playback rate changed pitch as well as speed.

Measured results, including raw phonemes and nonzero PCM energy, are saved in [pronunciation-evidence.json](pronunciation-evidence.json). Tests used original minimal sentences, not copyrighted packets. The automated browser had no WebGPU adapter, so executed synthesis verification used WASM/q8. WebGPU/fp32 is configured and documentation-checked, but was not executed on that test device. No claim of universal/native pronunciation accuracy or subjective listening evaluation is made.

## Pipeline and precedence

`QBReader HTML → sanitized canonical tokens → detect clear guides → resolve corrections → normalize notation → contextual chunks → Kokoro phonemes → audio`

`src/reader/pronunciation.ts` returns **canonicalDisplayText**, **spokenText**, detected guides and speech segments. Canonical HTML/data and display text are never replaced with respellings. The power marker is retained for display/scoring and omitted from speech. Each replacement keeps its original token range, so timeline/buzz logic continues to refer to the canonical question.

Resolution is **personal correction → built-in lexicon → explicit writer guide → default phonemizer**. Within each priority the longest whole name wins. Replacements do not recursively rewrite their own output. A higher-priority correction inside a guided name uses the corrected canonical name and suppresses the entire guide. This keeps user control predictable rather than silently replacing a saved correction with an author's spelling.

Guide detection accepts `Name (pronounced "...")`, `Name (pron. "...")`, stressed hyphenated notation such as `Name ("air-iss-TOFF-uh-neez")`, and spellings agreeing with the built-in pronunciation for that name. A legacy `Gauss ("gows")` pattern is recognized explicitly. Unclear one-word quoted asides, acronym explanations, ordinary parentheticals and ordinary quoted hyphenated descriptions remain unchanged. This deliberately misses some ambiguous guides.

The lexicon in `src/data/pronunciations.ts` supports Unicode NFC, Unicode letter/number/combining-mark boundaries, multi-word names, optional case sensitivity and notes. Respellings and writer-guide spellings are lowercased and syllable hyphens removed before phonemization, leaving ordinary canonical capitalization/acronyms intact. Tested built-ins cover Diomedes, Thucydides, René Descartes, Goethe, Dvořák and Bodhisattva. Some words such as Euler and Ljubljana already had suitable default phonemes and were deliberately left unchanged. Unproven respellings that introduced errors were excluded.

The default Diomedes spelling is `dye oh meedees`. Actual phonemes: `dˈaɪ ˈoʊ mˈiːdiːz`. Thucydides uses `thoo siddy deez`, producing `θˈuː sˈɪdi dˈiːz`. These are English approximations with imperfect stress/vowel reduction; they recover syllables rather than claiming native-language speech.

## Reading and diagnostics

Chunks prefer sentences/semicolons after at least ten spoken words, useful commas after longer context, and a context/character cap when no punctuation is available. Short tails stay attached to the preceding chunk. Word/name substitutions are atomic and never split. “For 10 points” remains attached to its clue. A genuinely short complete bonus cue is still a valid utterance. Punctuation remains in the input, giving the model its natural pauses; no theatrical emphasis or fixed artificial silence is inserted. Two chunks are prepared ahead, although slow devices can still outrun synthesis.

Kokoro's synthesis `speed` parameter changes speaking rate, with Web Audio playback rate fixed at 1. Generated duration drives the existing approximate canonical-token timeline. This is not forced word alignment. An overlong phoneme sequence causes a system-reader fallback instead of silently playing a truncated clue.

The worker uses Kokoro's **public** `TextSplitterStream.sentences` queue and closes it explicitly, then consumes `KokoroTTS.stream()`. This preserves the prepared contextual chunk and returns the actual generated phonemes. The 1.2.1 string streaming implementation was inspected: an unclosed stream can wait indefinitely, so it is not used here. The default sentence splitter could also create short utterances independently of the app's chunking.

The separate **Diagnostics** screen exists only under `npm run dev`, is disabled during games and is removed from the production bundle. It shows canonical display text, normalized input, token-indexed chunks and actual phonemes. Generating diagnostics runs inference and may download the model.

## Personal corrections

Resolved tossups, resolved bonus parts and reviewed questions have **Fix pronunciation**. Choose a displayed word or enter a full name, enter a plain-text respelling, preview with the currently selected voice/speed, and save. Preview uses the same normalization without applying a dictionary a second time. It shares the neural model with the main reader, while maintaining an independent playback handle so closing preview does not discard a paused tossup's audio offset.

IndexedDB's version 2 `pronunciations` table persists edits across refreshes. Settings has a Pronunciation Dictionary section with Add/Edit/Delete and a read-only built-in list. Edits apply to subsequent synthesis, not already buffered audio. Export/import includes personal corrections. Uppercase syllables can be entered for readability, but are lowercased when spoken.

## Regression coverage and limits

`tests/pronunciation.test.ts` contains stable expected spoken text for Greek mythology, ancient history, European names, world literature, fine arts, science, geography and religion/philosophy. It also checks precedence, clear/ambiguous guides, canonical preservation, accents, whole names, case sensitivity, no recursive substitutions, notation and chunk continuity. Reader integration verifies corrections reach System Voice and preview avoids secondary substitutions.

Respellings remain phonemizer-dependent. American/British voices select different phonemizer dialects; systemic errors can remain for unfamiliar languages, formulas and names. English approximations cannot reproduce every native sound or reliably control stress. Personal preview/edit is the practical correction mechanism. Browser storage, hardware, cache eviction and download/network failures affect availability and latency. Fresh question retrieval and judging remain online.
