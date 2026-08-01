# Data Model: Development Quality Automation

**Feature**: 073-dev-quality-automation | **Date**: 2026-03-03

---

## Entities

### QualityGate

Represents an automated check that must pass before code can be merged.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Gate identifier (e.g., "type-check", "lint", "coverage") |
| scope | enum | `pre-commit` \| `ci` \| `pr-merge` |
| status | enum | `pass` \| `fail` \| `skip` |
| errorMessage | string? | Human-readable failure description |
| duration | number | Execution time in milliseconds |

### CoverageReport

Per-package test coverage breakdown.

| Field | Type | Description |
|-------|------|-------------|
| package | string | Package name (`extension`, `server`, `shared`) |
| statements | number | Statement coverage percentage |
| branches | number | Branch coverage percentage |
| functions | number | Function coverage percentage |
| lines | number | Line coverage percentage |
| untestedFiles | string[] | Source files with 0% coverage |

### CoverageDelta

Change in coverage between base branch and PR.

| Field | Type | Description |
|-------|------|-------------|
| package | string | Package name |
| statementsDelta | number | Change in statement coverage (+/-) |
| branchesDelta | number | Change in branch coverage (+/-) |
| newFilesCovered | number | Count of newly tested files |
| newFilesUntested | number | Count of new files without tests |

### VulnerabilityReport

Dependency security audit results.

| Field | Type | Description |
|-------|------|-------------|
| severity | enum | `critical` \| `high` \| `moderate` \| `low` |
| package | string | Affected npm package |
| vulnerability | string | CVE or advisory ID |
| fixAvailable | boolean | Whether a patched version exists |
| recommendation | string | Suggested action |

### ValidationSchema

Zod schema used at a data boundary for runtime validation.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Schema identifier (e.g., `SynthesizeRequestSchema`) |
| location | enum | `server` \| `shared` \| `extension` |
| boundary | string | Where validation occurs (e.g., "POST /tts/synthesize") |
| fields | SchemaField[] | Schema field definitions |

### ContractTest

Test verifying an adapter correctly implements its port interface.

| Field | Type | Description |
|-------|------|-------------|
| portInterface | string | Port name (e.g., `IAudioGenerator`) |
| adapterUnderTest | string | Adapter being tested |
| testFile | string | Test file path |
| behaviorsVerified | string[] | List of port behaviors tested |

### UserJourney

End-to-end test simulating a complete user workflow.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Journey identifier (e.g., "article-playback") |
| steps | JourneyStep[] | Ordered list of actions and assertions |
| prerequisites | string[] | Required state (e.g., "extension installed") |
| expectedDuration | number | Max execution time in seconds |

---

## State Transitions

### QualityGate Lifecycle

```
pending → running → pass
                  → fail → (developer fixes) → pending
                  → skip (hotfix override)
```

### CI Pipeline Flow

```
push → lint+typecheck → unit-tests → integration-tests → coverage-report → vulnerability-scan → merge-ready
                      ↘ e2e-tests ↗
```

---

## Relationships

- A **CoverageReport** contains one entry per package
- A **CoverageDelta** is computed by comparing PR CoverageReport against base branch CoverageReport
- A **QualityGate** may reference a CoverageReport (for coverage gates) or VulnerabilityReport (for security gates)
- A **ContractTest** maps 1:1 to a port interface; multiple adapters tested per port
- A **ValidationSchema** may exist in `shared` and be imported by both `server` and `extension`
