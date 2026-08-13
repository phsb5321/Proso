# Feature 161 — Asset data model

## Segment manifest

`brand/segments.json` is the source contract.

- `version`: manifest schema version.
- `source.path`: repository-relative PNG path.
- `source.sha256`: exact source integrity value.
- `source.width` / `source.height`: decoded IHDR dimensions.
- `segments[]`:
  - `id`: stable kebab-case identifier and output filename stem.
  - `purpose`: human description.
  - `crop`: integer `x`, `y`, `width`, `height`, contained within the source.
  - `output`: repository-relative PNG path.

## Vector asset

Every standalone SVG declares:

- stable `viewBox`;
- `role="img"` and accessible title/description identifiers;
- named semantic groups/IDs for structural verification;
- fills from the declared palette or a one-colour token;
- paths/primitives only, with no runtime/font/raster dependency.

## Optical band

Each optical source has a native square viewBox and a distinct normalized
geometry hash. The 32px and 96px PNGs intentionally share the 16px and 48px
source geometry respectively, rendered at exact 2×.
