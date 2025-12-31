# Research: Audio-Text Sync & Content Extraction Overhaul

**Feature**: 007-audio-sync-extraction-overhaul
**Created**: 2025-12-31
**Status**: Complete

## Audio-Text Synchronization

### Decision: Dual-mechanism sync (timeupdate + requestAnimationFrame)

**Rationale**: HTML5 `timeupdate` events fire 4-5 times per second (reliable baseline), while `requestAnimationFrame` provides 60fps visual updates when tab is active. Combining both ensures reliable sync even when tab is backgrounded (where rAF is throttled) while providing smooth highlighting when active.

**Alternatives Considered**:
- setInterval-based polling: Rejected - drifts from actual audio time, requires manual time tracking
- requestAnimationFrame only: Rejected - throttled/paused in background tabs, causing sync loss
- timeupdate only: Rejected - 4-5 Hz update rate causes visible stutter in word highlighting

**Sources**:
- [Amazon Polly Speech Marks](https://docs.aws.amazon.com/polly/latest/dg/speechmarks.html) - setTimeout scheduling pattern
- [React Speech Highlight](https://www.npmjs.com/package/react-speech-highlight) - dual-layer highlighting approach
- [CodePunker Tutorial](https://www.codepunker.com/blog/sync-audio-with-text-using-javascript) - timeupdate event usage

### Decision: audio.currentTime as authoritative time source

**Rationale**: Using the audio element's `currentTime` property as the single source of truth eliminates drift between internal timers and actual playback position. All sync calculations derive from this value.

**Alternatives Considered**:
- Independent timer (performance.now): Rejected - drifts when audio buffers/stalls
- Dual timers with reconciliation: Rejected - adds complexity without reliability improvement

**Sources**:
- [NVIDIA Forced Alignment](https://research.nvidia.com/labs/conv-ai/blogs/2023/2023-08-forced-alignment/) - time source authority patterns
- [Transcript Tracer JS](https://github.com/bbc/transcript-tracer-js) - audio.currentTime pattern

### Decision: Binary search for word lookup

**Rationale**: Word timelines can have 500+ entries for long articles. Binary search provides O(log n) lookup vs O(n) for linear scan. For 500 words, this is ~9 comparisons vs ~250 average.

**Alternatives Considered**:
- Linear scan: Acceptable for <50 words, but doesn't scale
- Pre-built index map: Rejected - memory overhead not justified for typical use case

---

## Content Extraction

### Decision: Trafilatura-inspired content scoring algorithm

**Rationale**: Academic benchmarks show Trafilatura achieves F1: 0.937, Precision: 0.978 on content extraction. The algorithm uses text density, link density, paragraph count, and structural hints to identify main content. This approach is well-suited for the diverse sites VoxPage targets (wikis, news, blogs).

**Alternatives Considered**:
- Readability.js only: Limited accuracy on wiki sites with complex structure
- Boilerpipe (shallow text features): Lower precision than Trafilatura
- Ensemble (Readability + Trafilatura + Goose3): Overkill for browser extension; runtime overhead

**Sources**:
- [Trafilatura Evaluation](https://trafilatura.readthedocs.io/en/latest/evaluation.html) - F1: 0.937 benchmark
- [ACM SIGIR Content Extraction Comparison](https://dl.acm.org/doi/10.1145/3539618.3591920) - comparative analysis
- [Chrome DOM Distiller](https://chromium.googlesource.com/chromium/src/+/HEAD/components/dom_distiller/) - Boilerpipe implementation

### Decision: Wiki-specific selector priority

**Rationale**: Wiki sites (Fextralife, Wikipedia, Fandom) have predictable content container selectors. Checking these first provides instant accurate extraction for common use cases, with fallback to content scoring for unknown sites.

**Wiki Selectors** (priority order):
1. `#wiki-content-block` - Fextralife
2. `#WikiaArticle` - Fandom/Wikia
3. `#mw-content-text` - MediaWiki/Wikipedia
4. `.mw-parser-output` - MediaWiki fallback
5. `article` - semantic HTML5
6. `[role="main"]` - ARIA main content

**Alternatives Considered**:
- Generic algorithm only: Slower and less accurate for known sites
- Site-specific adapters: Too much maintenance overhead

### Decision: Link density threshold of 70%

**Rationale**: Navigation elements typically have >70% of their text as hyperlinks. Content paragraphs rarely exceed 30%. A 70% threshold effectively filters navigation while preserving in-content links.

**Alternatives Considered**:
- 50% threshold: Too aggressive; filters valid content with citation links
- 80% threshold: Too lenient; allows some navigation through

**Sources**:
- Trafilatura source code analysis
- [Boilerpipe Paper](https://www.l3s.de/~kohlschuetter/publications/wsdm187-kohlschuetter.pdf) - link density heuristics

---

## Word-Level Highlighting

### Decision: CSS Custom Highlight API for word highlighting

**Rationale**: Firefox 119+ supports the CSS Custom Highlight API, which provides native browser performance for highlighting text ranges without modifying DOM structure. This is critical for preserving DOM integrity and avoiding layout thrash.

**Alternatives Considered**:
- `<mark>` element wrapping: Rejected - modifies DOM, breaks text nodes, causes layout reflow
- Inline styles on spans: Rejected - requires text node splitting, complex cleanup
- Background overlay positioning: Rejected - fragile with variable text sizes/fonts

**Sources**:
- [MDN CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)
- [Firefox 119 Release Notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/119) - feature availability

### Decision: Paragraph-only fallback for unsupported browsers

**Rationale**: Firefox 109-118 lack CSS Custom Highlight API. Rather than complex polyfills, we provide paragraph-level highlighting as graceful degradation. This still delivers value while avoiding DOM manipulation complexity.

**Alternatives Considered**:
- Polyfill with mark elements: Rejected - DOM modification issues
- No highlighting for old browsers: Rejected - poor user experience

---

## Word Timing Extraction

### Decision: Groq Whisper API for transcription with word timestamps

**Rationale**: Groq provides word-level timestamps via Whisper at low latency. This enables word-level sync without client-side speech recognition (which lacks timestamps).

**Alternatives Considered**:
- ElevenLabs alignment endpoint: Only works with ElevenLabs-generated audio
- Web Speech API: No word timestamps available
- Client-side Whisper.cpp: Too heavy for browser extension (~40MB model)

### Decision: Fuzzy matching for word alignment

**Rationale**: TTS may pronounce text differently than transcribed (contractions, numbers, abbreviations). Fuzzy matching with Levenshtein distance handles "don't" vs "do not", "100" vs "one hundred", etc.

**Alternatives Considered**:
- Exact string matching: Fails on common TTS variations
- Phonetic matching: Overkill; fuzzy string matching handles 95%+ of cases

---

## Performance

### Decision: 5MB cache limit for word timing data

**Rationale**: Typical session has 50 paragraphs, ~100 words each. Word timing JSON is ~50 bytes/word, so 50 * 100 * 50 = 250KB per session. 5MB allows ~20 sessions cached, with LRU eviction.

### Decision: 500ms content extraction budget

**Rationale**: Users expect near-instant response when activating the extension. 500ms is imperceptible as "instant" while providing sufficient time for DOM traversal and scoring.

**Benchmarks**:
- Simple news article: ~50ms
- Complex wiki page: ~150ms
- Large document (5000+ words): ~400ms
