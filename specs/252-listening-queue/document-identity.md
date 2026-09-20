# Document identity and positions — normative annex v1

Owns the REQ-003 encoding rules and REQ-006 position rules. The four public
contracts in [spec.md](spec.md) are unchanged. Adapter implementations MUST
share these rules; adapter-specific digest inputs are forbidden.

## Normalized input

`normalizationVersion = "proso-normalize-v1"`. After the allowlisted extraction
in [acceptance-and-privacy.md](acceptance-and-privacy.md), decode HTML entities,
normalize Unicode to NFC, collapse runs of TAB/LF/FF/CR/SPACE/NBSP to one ASCII
space, and trim that space at each block edge. Preserve all other characters,
case and punctuation. Empty blocks are omitted before ordinals are assigned.
Reject remaining unpaired UTF-16 surrogates. Changing these rules, extraction
order, or supported structure requires a new normalizationVersion.

Assign zero-based ordinals in source traversal order. Parent references use
the parent's ordinal in the **preimage**, never its eventual Block.id: a parent
must precede its child, and null means no parent. Parent list text excludes
text already emitted in a child block. No source text is emitted twice.

## Canonical bytes and hashes

Let `J(x)` be ECMAScript `JSON.stringify(x)` without replacer or indentation,
encoded as UTF-8 without BOM or trailing newline. Only arrays, well-formed
strings, null, and nonnegative safe integers occur here. Quotes/backslashes and
control characters use JSON.stringify escaping; `/` and non-ASCII characters
remain literal. There are no object-key ordering or floating-point choices.

The exact revision preimage is:

```text
J([normalizationVersion, blocks.map(b => [b.kind, b.originalText, parentOrdinalOrNull])])
revision = "r1-" + lowercaseHex(SHA-256(preimage))
```

The exact block preimage and identifier are:

```text
J(["proso-block-v1", revision, ordinal])
Block.id = "b1-" + lowercaseHex(SHA-256(preimage))
Block.parentId = corresponding derived parent Block.id, or absent
```

Source identity is the separate storage namespace, not part of this hash.
Title, author, language, canonicalUrl, sourceAnchor, fetchedAt, remote read
status, coverage, voice/provider, and spoken-plan inputs are excluded. Metadata-
only differences MUST preserve revision and IDs; coverage still gates completion
and a language change still invalidates the spoken plan. Equal revisions mean
equal normalized block structure/text, not equal credentials, audio or coverage.

Repeated identical blocks receive distinct IDs by ordinal. Stability is promised
only **within one revision**. Inserting, removing, reordering, reparenting or
editing any block changes the revision and all IDs. Cross-revision stable IDs
are deliberately not promised: the visible changed-content restart flow forbids
automatic offset remapping, so insert-resistant identity provides no safe-resume
benefit here. This also avoids a circular revision/parent-ID hash dependency.

## Golden vectors

[identity-vectors.json](identity-vectors.json) is normative test data: each
record contains normalized `preimage`, exact `preimageUtf8Hex`, expected
`revision`, and ordered `blockIds`. A record may also carry an informational
`name`; the contract suite compares the enumerated keys only and ignores
additional informational keys, so a strict key-set comparison must not fail on
them. The file's pretty-printing is immaterial; the serialized `preimage` value
alone is hashed. Cases cover repeated identical
blocks, an insertion, a parent relation, quotes/control characters, NFC/non-BMP
text, and a normalization-version change. The contract suite must compare
literal expected hashes, not regenerate its expected values from production
code. Metadata mutations must reuse the repeated-block vector unchanged;
changing the same child's parent from 0 to null must change its revision.

Provenance: the expected values were produced by a standalone generator written
against this document, then independently recomputed with Node's
`JSON.stringify`/UTF-8/SHA-256 before merge. Neither path is production code, so
a defect would have to occur identically in two independent implementations.

## Checkpoint positions and audio hints

`sourceOffset` is an integer UTF-16 code-unit boundary in `[0, originalText.length]`.
The canonical end-of-block is `(that block's id, originalText.length)`; it does
not mean the beginning of the next block. Resume may traverse to the next block
only after validating saved evidence. Document end uses the last block's end;
that position alone never certifies completion.

On loading a known block with an offset between a high and low surrogate, move
back one code unit. For negative, noninteger, nonfinite or past-end offsets,
reset to that block's start; never clamp past-end values forward to completion.
Clear the audio hint, completion eligibility and unacknowledged completion
intent, and discard heard evidence from the repaired position onward. Unknown
block/revision or invalid document digest quarantines the item: offer Restart
from the validated snapshot, never guess a block. Show “Progress repaired —
some audio will repeat.” Already sent acknowledgements cannot be reversed.

`audioOffsetMs` is finite and nonnegative; 0 plus an absent envelope audio
binding means no hint. A nonzero value is valid only with the **same transaction's**
binding to source tuple, document revision, block/source range, spoken-plan key,
provider/model/voice/synthesis options, stable synthesis-unit key, audio-byte
SHA-256, segment ID and decoded duration. Playback-only rate is not synthesis
identity. Reject a hint outside `[0, duration]` or with any mismatch, missing
artifact, or failed digest. Discard it and resume conservatively from source.
Do not apply an old millisecond offset to newly generated bytes.

## Spoken plan compatibility

The envelope records an expansion version (the implementation's explicit
`SPOKEN_PLAN_REVISION`, currently `spoken-plan-v2`) and a `spokenPlanKey`:
SHA-256 of J of an ordered tuple containing that version, effective locale,
ordered effective lexicon entries, originalText, expanded spokenText and the
ordered `(sourceStart, sourceEnd, spokenStart, spokenEnd, kind)` mapping. Null
source positions for inserted text are preserved. Record exact inputs, not
only a mutable settings pointer. Any algorithm/lexicon precedence change must
bump the expansion version.

On mismatch rebuild the plan from the pinned originalText before synthesis.
Keep the source checkpoint, round it back to the beginning of any expansion
that contains it, and drop incompatible audio/timing hints and speculative
reservations. An expansion earns its source interval only after all of its
spoken output naturally plays; inserted speech attaches to its owning source
unit's evidence. Conservatively invalidate heard ranges and unsent intents for
blocks whose spokenPlanKey changed; unchanged blocks retain their evidence.
Gaps need replay before a new completion. Voice-only changes discard audio
hints but retain heard source ranges. A completed remote acknowledgement is a
historical fact, never toggled back by a plan change.
