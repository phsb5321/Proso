# Proso

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)
[![CI](https://github.com/phsb5321/Proso/actions/workflows/ci.yml/badge.svg)](https://github.com/phsb5321/Proso/actions/workflows/ci.yml)
[![Firefox 109+](https://img.shields.io/badge/Firefox-109%2B-orange.svg)](https://www.mozilla.org/firefox/)

**Transform any webpage into an immersive audio experience**

> **Firefox-First**: Proso is developed and optimized for Firefox. It uses an event-page
> background with DOM access and native `Audio` playback. Speech synthesis is server-backed.

Proso is a Firefox extension that uses AI-powered text-to-speech to read web pages aloud with
natural, expressive voices. The default free-tier flow needs no account, license key, or provider
API key; the Proso server selects a configured TTS provider. Users may optionally supply a provider
key for a single request through the BYOK flow.

## Features

- **Premium AI Voices** - Natural, expressive voices from OpenAI and ElevenLabs
- **Smart Text Extraction** - Automatically detects article content or read the full page
- **Visual Highlighting** - See what's being read with elegant word and paragraph highlighting
- **Playback Controls** - Play, pause, skip paragraphs, adjust speed
- **Floating Controller** - Draggable on-page controls for easy access
- **Context Menu Integration** - Right-click any selected text to read it aloud
- **Modern Dark UI** - Beautiful, distraction-free interface
- **Optional BYOK** - Provider keys are stored in extension storage and forwarded per request

## Installation

### From GitHub Releases

1. Go to the [Releases](https://github.com/phsb5321/Proso/releases) page
2. Download the latest `.xpi` file
3. Open the file with Firefox to install

### Manual Installation (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/phsb5321/Proso.git
   ```
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the sidebar
4. Click "Load Temporary Add-on..."
5. Build the Firefox extension and select `.output/firefox-mv2/manifest.json`

## Setup

### TTS providers

Proso routes synthesis through its server and currently supports these providers:

| Provider | Default path | Optional BYOK |
|----------|--------------|---------------|
| **OpenAI** | Server-managed free/credit routing | Supported |
| **ElevenLabs** | Server-managed free/credit routing | Supported |
| **Groq** | Server-managed free/credit routing | Supported |
| **Cartesia** | BYOK-only | Supported |

1. Click the Proso icon in your toolbar
2. Click the gear icon to open Settings
3. Select your preferred provider
4. Optionally enter that provider's API key to use BYOK

## Usage

### Basic Usage

1. Navigate to any webpage
2. Click the Proso icon in your toolbar
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

Right-click any selected text and choose "Read with Proso" to read it aloud instantly.

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

Proso uses **WXT** (Web Extension Tools) with TypeScript for a modern development experience.

### Prerequisites

- Firefox 109+ (primary target)
- Node.js 20.x
- pnpm 10.30.3
- GNU Make for the unified delivery harness

### Setup

```bash
git clone https://github.com/phsb5321/Proso.git
cd Proso
pnpm install --frozen-lockfile
make help
```

### Development Commands

```bash
# Deterministic delivery checks
make verify
make verify-full

# Start development server with hot reload
pnpm --filter @proso/extension dev
pnpm --filter @proso/extension dev:firefox
pnpm --filter @proso/extension dev:chrome

# Build extension targets
pnpm --filter @proso/extension build:firefox
pnpm --filter @proso/extension build:chrome
make build-all
```

### Testing & Quality

```bash
make smoke-reader       # Extraction-to-playback outcome oracle
make test               # Workspace test suites
make security           # Security tests + working-tree secret scan
make quality            # TypeScript cycle + duplication checks
make inventory          # Informational unused-code/dependency report
```

#### Testing on NixOS

On NixOS, browser automation must run in the pinned Playwright Docker image; host Playwright
launches are not a supported verification path. The existing browser suites are not part of
`make gate` until they drive and assert the real server-backed reading journey. See
[`docs/reading-journey-status.md`](docs/reading-journey-status.md).

### Project Structure

```
Proso/
├── packages/
│   ├── extension/       # Firefox-first WXT extension
│   ├── server/          # NestJS/Hono TTS and credit backend
│   ├── shared/          # Shared schemas and domain types
│   └── site/            # Landing page
├── services/
│   └── proso-log-gateway/
└── docs/
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

Proso automatically detects page language using **franc-min**:
- Supports 82 languages
- ~100% accuracy on typical web content
- ISO 639-1 language codes (en, es, fr, de, etc.)
- Fallback to English if detection fails

## Privacy

- Optional BYOK provider keys are stored in browser extension storage
- Text selected for reading is sent to the Proso server and then to the selected TTS provider
- Optional technical and interaction telemetry is controlled separately from TTS content
- There is no local Browser TTS mode

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes following our commit conventions
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## License

Proso is dual-licensed:

- **Open Source**: [AGPL-3.0](LICENSE) for personal use and open source projects
- **Commercial**: [Commercial license](COMMERCIAL.md) for businesses

See [COMMERCIAL.md](COMMERCIAL.md) for commercial licensing options.

Third-party licenses are documented in [NOTICE](NOTICE).

## Acknowledgments

- [OpenAI](https://openai.com) for their TTS API
- [ElevenLabs](https://elevenlabs.io) for their premium voice synthesis
- [Groq](https://groq.com) for fast inference
- [Mozilla](https://mozilla.org) for the WebExtensions platform
