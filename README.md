# VoxPage

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)
[![CI](https://github.com/phsb5321/VoxPage/actions/workflows/ci.yml/badge.svg)](https://github.com/phsb5321/VoxPage/actions/workflows/ci.yml)
[![Firefox 112+](https://img.shields.io/badge/Firefox-112%2B-orange.svg)](https://www.mozilla.org/firefox/)

**Transform any webpage into an immersive audio experience**

> **Firefox-First**: VoxPage is developed and optimized for Firefox. We leverage Firefox's native extension capabilities including event pages with DOM access, native `Audio` API in background scripts, and `speechSynthesis` for Browser TTS.

VoxPage is a Firefox extension that uses AI-powered text-to-speech to read web pages aloud with natural, expressive voices. Choose from premium AI voices (OpenAI, ElevenLabs) or use your browser's built-in speech synthesis.

## Features

- **Premium AI Voices** - Natural, expressive voices from OpenAI and ElevenLabs
- **Smart Text Extraction** - Automatically detects article content or read the full page
- **Visual Highlighting** - See what's being read with elegant word and paragraph highlighting
- **Playback Controls** - Play, pause, skip paragraphs, adjust speed
- **Floating Controller** - Draggable on-page controls for easy access
- **Context Menu Integration** - Right-click any selected text to read it aloud
- **Modern Dark UI** - Beautiful, distraction-free interface
- **Privacy First** - API keys stored locally, no data collection

## Installation

### From GitHub Releases

1. Go to the [Releases](https://github.com/phsb5321/VoxPage/releases) page
2. Download the latest `.xpi` file
3. Open the file with Firefox to install

### Manual Installation (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/phsb5321/VoxPage.git
   ```
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the sidebar
4. Click "Load Temporary Add-on..."
5. Select the `manifest.json` file from the VoxPage folder

## Setup

### API Keys

VoxPage supports multiple TTS providers:

| Provider | Quality | Cost | Setup |
|----------|---------|------|-------|
| **OpenAI** | Excellent | ~$0.015/1K chars | [Get API Key](https://platform.openai.com/api-keys) |
| **ElevenLabs** | Premium | ~$0.30/1K chars | [Get API Key](https://elevenlabs.io/app/settings/api-keys) |
| **Groq** | Good | Free tier available | [Get API Key](https://console.groq.com/keys) |
| **Browser** | Good | Free | No setup needed |

1. Click the VoxPage icon in your toolbar
2. Click the gear icon to open Settings
3. Enter your API key(s) for your preferred provider(s)
4. Select your default provider

## Usage

### Basic Usage

1. Navigate to any webpage
2. Click the VoxPage icon in your toolbar
3. Select your preferred voice and reading mode
4. Click the play button

### Reading Modes

- **Article** - Intelligently extracts and reads only the main article content
- **Full Page** - Reads all text content on the page
- **Selection** - Reads only the text you've selected

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + P` | Play/Pause |
| `Alt + S` | Stop |
| `Alt + .` | Next paragraph |
| `Alt + ,` | Previous paragraph |

### Context Menu

Right-click any selected text and choose "Read with VoxPage" to read it aloud instantly.

## Voice Options

### OpenAI Voices
- **Alloy** - Neutral and balanced
- **Echo** - Warm and conversational
- **Fable** - British and expressive
- **Onyx** - Deep and authoritative
- **Nova** - Friendly and upbeat
- **Shimmer** - Soft and gentle

### ElevenLabs Voices
- **Rachel** - Calm and soothing
- **Drew** - Well-rounded and confident
- **Sarah** - Soft news presenter
- **Antoni** - Crisp and natural

## Development

VoxPage uses **WXT** (Web Extension Tools) with TypeScript for a modern development experience.

### Prerequisites

- Firefox 112+ (primary target)
- Node.js 20.x
- pnpm (preferred) or npm

### Setup

```bash
git clone https://github.com/phsb5321/VoxPage.git
cd VoxPage
npm install
```

### Development Commands

```bash
# Start development server with hot reload
npm run dev              # Default browser (Firefox)
npm run dev:firefox      # Firefox explicitly
npm run dev:chrome       # Chrome

# Build production extension
npm run build            # Default browser
npm run build:firefox    # Firefox (MV2)
npm run build:chrome     # Chrome (MV3)
npm run build:all        # All browsers

# Create distributable zip
npm run zip:firefox
npm run zip:chrome
```

### Testing & Quality

```bash
npm test                # Run ESLint + unit tests
npm run test:unit       # Unit tests only (Jest)
npm run test:integration # Integration tests (Jest)
npm run test:visual     # Visual regression (Playwright)
npm run test:e2e        # End-to-end tests (Playwright)
npm run test:security   # Security tests (Jest)
npm run test:all        # Run all tests
npm run lint            # ESLint
npm run quality         # Full quality checks
```

#### Testing on NixOS

If you're running on NixOS, Playwright requires Firefox to be available via `FIREFOX_PATH`:

```bash
# Set Firefox path for Playwright
export FIREFOX_PATH=$(which firefox)

# Or use the setup script
./scripts/nixos-playwright-setup.sh

# Run E2E/visual tests in headed mode (for debugging)
npm run test:visual -- --headed
npm run test:e2e -- --headed
```

The visual and E2E tests require a built extension. Run `npm run build:firefox` first.

### Project Structure

```
VoxPage/
├── src/                 # Source code (WXT srcDir)
│   ├── entrypoints/     # WXT entry points (auto-discovered)
│   │   ├── background.ts    # Service worker
│   │   ├── content.ts       # Content script
│   │   └── options/         # Options page
│   ├── utils/           # Shared TypeScript utilities
│   │   ├── config/          # Settings, defaults, migrations
│   │   ├── audio/           # Playback sync, cache, visualizer
│   │   ├── providers/       # TTS providers (6 supported)
│   │   ├── content/         # Extractor, highlighter, footer
│   │   ├── language/        # Language detection (franc-min)
│   │   ├── logging/         # Remote logging
│   │   └── messaging/       # Type-safe message handlers
│   └── styles/          # CSS design tokens
├── public/icons/        # Extension icons
└── tests/               # Jest + Playwright tests
```

### Technology Stack

| Technology | Purpose |
|------------|---------|
| TypeScript | Strict mode, type-safe codebase |
| WXT | Framework for browser extensions |
| Vite | Build tooling with HMR |
| Zod | Runtime validation |
| franc-min | Language detection (82 languages) |
| Jest | Unit testing |
| Playwright | Visual regression testing |

### Language Detection

VoxPage automatically detects page language using **franc-min**:
- Supports 82 languages
- ~100% accuracy on typical web content
- ISO 639-1 language codes (en, es, fr, de, etc.)
- Fallback to English if detection fails

## Privacy

- **API keys are stored locally** in your browser's extension storage
- **No data is collected** by VoxPage
- Text is sent only to your selected TTS provider when reading
- Browser TTS mode processes everything locally

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes following our commit conventions
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## License

VoxPage is dual-licensed:

- **Open Source**: [AGPL-3.0](LICENSE) for personal use and open source projects
- **Commercial**: [Commercial license](COMMERCIAL.md) for businesses

See [COMMERCIAL.md](COMMERCIAL.md) for commercial licensing options.

Third-party licenses are documented in [NOTICE](NOTICE).

## Acknowledgments

- [OpenAI](https://openai.com) for their TTS API
- [ElevenLabs](https://elevenlabs.io) for their premium voice synthesis
- [Groq](https://groq.com) for fast inference
- [Mozilla](https://mozilla.org) for the WebExtensions platform
