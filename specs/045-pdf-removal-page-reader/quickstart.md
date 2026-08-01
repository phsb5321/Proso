# Quickstart: PDF Removal + Web Page Reading Pivot

**Feature**: 045-pdf-removal-page-reader
**Branch**: `045-pdf-removal-page-reader`

## Prerequisites

- Node.js 18+
- pnpm 10+
- Firefox 112+ and/or Chrome 88+
- ElevenLabs API key (for TTS testing)

## Setup

```bash
# Clone and checkout branch
git checkout 045-pdf-removal-page-reader

# Install dependencies
pnpm install

# Start development server (Firefox)
pnpm run dev:firefox

# Or for Chrome
pnpm run dev:chrome
```

## Development Workflow

### 1. PDF Removal (Phase A)

First, remove all PDF-related code:

```bash
# Delete PDF directories
rm -rf src/utils/pdf/
rm -rf src/utils/content/ocr.ts
rm -rf src/utils/content/pdf-*.ts
rm -rf src/utils/messaging/schemas/pdf.ts
rm -rf src/utils/messaging/handlers/pdf.ts
rm -rf src/utils/messaging/handlers/ocr.ts
rm -rf src/handlers/pdf.handlers.ts
rm -rf src/background/pdf-controller.ts
rm -rf types/tesseract-wasm.d.ts

# Delete unused TTS providers
rm -rf src/utils/providers/browser.ts
rm -rf src/utils/providers/cartesia.ts
rm -rf src/utils/providers/groq.ts
rm -rf src/utils/providers/groq-timestamp.ts
rm -rf src/utils/providers/openai.ts

# Remove npm dependencies
pnpm remove pdfjs-dist tesseract-wasm

# Verify build
pnpm run build:firefox
```

### 2. Update Imports

After deletion, fix broken imports in remaining files:

```bash
# Find files with broken PDF imports
grep -r "pdf" src/ --include="*.ts" | grep -v node_modules

# Files to update:
# - src/entrypoints/background.ts (remove PDF handlers)
# - src/entrypoints/content.ts (remove PDF detection)
# - src/handlers/index.ts (remove PDF handler registration)
# - src/utils/messaging/protocol.ts (remove PDF message types)
# - src/utils/config/defaults.ts (remove PDF settings)
```

### 3. Highlight System (Phase C)

```bash
# Create highlight domain
mkdir -p src/core/highlight
touch src/core/highlight/highlight.entity.ts
touch src/core/highlight/text-quote-selector.ts
touch src/core/highlight/anchoring.service.ts

# Create highlight port
touch src/ports/highlight-repository.port.ts

# Create IndexedDB adapter
mkdir -p src/adapters/storage
touch src/adapters/storage/highlight-indexeddb.adapter.ts

# Create message handlers
touch src/handlers/highlight.handlers.ts
```

### 4. Offscreen Document (Phase D - Chrome only)

```bash
# Create offscreen entry point
touch src/entrypoints/offscreen.html
touch src/entrypoints/offscreen.ts

# Update wxt.config.ts to include offscreen
```

## Testing

### Run All Tests

```bash
# Full test suite
pnpm test

# Unit tests only
pnpm run test:unit

# Contract tests
pnpm run test:contract

# E2E tests
pnpm run test:e2e
```

### Manual Testing Checklist

1. **Article Extraction**
   - [ ] Open a news article (e.g., medium.com)
   - [ ] Click VoxPage icon
   - [ ] Verify article text is extracted
   - [ ] Verify paragraphs are chunked correctly

2. **TTS Playback**
   - [ ] Enter ElevenLabs API key in options
   - [ ] Click "Read" on extracted article
   - [ ] Verify audio starts within 2 seconds
   - [ ] Verify play/pause works
   - [ ] Verify skip paragraph works

3. **Highlight Creation**
   - [ ] Select text on page
   - [ ] Click "Highlight" button
   - [ ] Verify highlight appears
   - [ ] Reload page
   - [ ] Verify highlight re-anchors

4. **Cross-browser**
   - [ ] Test on Firefox
   - [ ] Test on Chrome
   - [ ] Verify offscreen document works (Chrome)

## Key Files

| File | Purpose |
|------|---------|
| `src/core/highlight/anchoring.service.ts` | Text re-anchoring logic |
| `src/adapters/audio/elevenlabs.adapter.ts` | ElevenLabs TTS streaming |
| `src/adapters/audio/offscreen.adapter.ts` | Chrome offscreen audio |
| `src/handlers/highlight.handlers.ts` | Highlight CRUD handlers |
| `src/entrypoints/offscreen.html` | Chrome offscreen document |

## Common Issues

### "Audio not playing in Chrome"

Chrome MV3 requires offscreen document for audio. Ensure:
1. `offscreen.html` exists in entrypoints
2. Manifest includes `offscreen` permission
3. `OffscreenAudioAdapter` creates document before playing

### "Highlights not persisting"

Check IndexedDB:
1. Open DevTools → Application → IndexedDB
2. Look for `voxpage` database
3. Check `highlights` object store

### "Permission denied on site"

On-demand permissions required:
1. User must click extension icon first
2. Browser prompts for permission
3. After grant, content script can inject

## Architecture Notes

```
┌─────────────────────────────────────────────────────────┐
│                    Background (Service Worker)           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Handlers   │  │    Ports    │  │  Adapters   │     │
│  │ (messaging) │→ │ (interfaces)│→ │(implementations)│ │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
         ↓                                    ↓
┌─────────────────┐                ┌─────────────────────┐
│ Content Script  │                │ Offscreen Document  │
│ (DOM, highlights)                │ (Audio playback)    │
└─────────────────┘                └─────────────────────┘
```
