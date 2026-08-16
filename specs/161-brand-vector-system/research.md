# Feature 161 — Research summary

## Conclusion

The highest-quality route for this board is manual/parametric reconstruction,
not direct tracing. Potrace and VTracer are useful measurement underlays, but
boundary fitters cannot recover true circles, exact axes, one radius, or the
intended relationship between inconsistent repeated examples.

## Mechanically recovered facts

- Primary topology: open-waist monoline bubble, two interior pills, four
  external waveform bars.
- Compact topology: the same bubble, two equal pills, one dot in the waist.
- Hero bubble stroke: approximately 0.1412 of mark width.
- Five measured waveform instances produced a useful starting estimate of
  0.318 / 0.635 / 1.000 / 0.531. The clean 8:16:25:13 snap is an authored proof
  value, not immutable source truth.
- Measured palette candidates: navy `#010616`, off-white `#F8F8F9`, spring green
  `#21F299`.
- Green on a white surface is approximately 1.39:1, so essential toolbar meaning
  needs a dark tile or a distinct contrast-safe light-surface treatment.
- The board's nominal 32px and 16px light examples render at roughly 47px and
  25px. They do not prove native-size legibility.
- The lowercase wordmark is deterministic vector-derived geometry, but no validly
  tested open font passed the identification threshold. A custom measured redraw
  is safer than naming a guessed family.

## Tool ranking

1. Inkscape primitives/boolean geometry and editable centerlines, flattened for
   shipping.
2. Parameterized SVG generation for repeated bars, pills, variants, and receipts.
3. Potrace/VTracer only as offline reference underlays.
4. Commercial/cloud tracers only as optional comparisons; none provides a
   demonstrated primitive-accuracy advantage for this mark.
5. Differentiable/vector-generative research systems are not production oracles
   for an inconsistent geometric board.

## Sources

- Potrace algorithm: https://potrace.sourceforge.net/potrace.pdf
- VTracer: https://github.com/visioncortex/vtracer
- Inkscape Power Stroke: https://wiki.inkscape.org/wiki/PowerStroke
- SVG stroke semantics: https://www.w3.org/TR/SVG2/painting.html
- SVG structure: https://www.w3.org/TR/SVG2/
- SVGO: https://svgo.dev/
- WCAG non-text contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- Chrome extension icons: https://developer.chrome.com/docs/extensions/develop/ui/configure-icons
- Firefox extension icons: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/icons
- SIL OFL FAQ: https://openfontlicense.org/ofl-faq/

## Unresolved proof choices

- custom measured `p` versus conventional full-height stem;
- board-like near-monoline wordmark versus conventional optical thinning;
- full waveform versus dot treatment at the 48px band.

These receive side-by-side proofs and explicit decisions. They are not silently
inferred from antialiased pixels.

---

## Decision delta — 16/08/2026 (Feature 173)

The "custom measured redraw" conclusion above is superseded by an explicit
art-direction reversal: the Proso wordmark now uses a real, named, properly
licensed font (**Outfit Variable**, SIL OFL 1.1, instance `wght=475`, tracking
`0‰`), with the font file, licence, source commit, SHA-256, axes, tracking, and
generated outline hash recorded in `brand/fonts/manifest.json`. The custom
construction from Feature 161 is preserved read-only at
`brand/source/archive/proso-wordmark-construction-custom.svg` and remains
renderable as the legacy proof. Feature 161's statement that "no validly tested
open font passed the identification threshold" referred to a threshold that was
not documented at the time; Feature 173 defines the metric gate (IoU, Chamfer,
held-out Hausdorff, component/counter ratios) and the full candidate matrix in
`specs/173-font-authentic-wordmark/research.md`. This delta amends the record;
it does not rewrite Feature 161's history.
