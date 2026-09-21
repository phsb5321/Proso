# Proso

![Proso — a page's text lines lifting off into a sound wave](packages/site/assets/images/art/listening-hero.png)

**Read web pages aloud in Firefox, with word highlighting and playback controls.**

[![Install for Firefox](https://img.shields.io/badge/Install-Firefox-orange)](https://addons.mozilla.org/en-US/firefox/addon/proso/)

[Website](https://proso.com.br/) · [Plans and pricing](https://proso.com.br/pricing.html) ·
[First listen](#your-first-listen) · [Get help](SUPPORT.md) ·
[Support development](#support-the-project) · [License status](#license)

Proso reads articles, full pages, or selected text. The extension is free to install.
To generate audio, configure your own provider API key (BYOK), a synthesis host you
operate, or an eligible managed plan. BYOK needs no Proso account; provider charges
may apply. There is no built-in browser TTS fallback.

Published Firefox builds are available on Mozilla Add-ons. Development status for
`main` is tracked separately in the [reading journey status](docs/reading-journey-status.md).

Editorial art is generated through the fleet's ChatGPT lane and shipped with the prompt
that made it — see [visual assets](docs/visual-assets.md). Brand marks are separate and
deterministic ([brand vector system](specs/161-brand-vector-system/)).

Reading a local PDF instead? See [Lectrice](https://github.com/phsb5321/Tauri-PDF-Reader).
Find both projects and related desktop tools at [Yolo Labz](https://github.com/yolo-labz).

## Features

- **Premium AI Voices** - Natural, expressive voices from OpenAI and ElevenLabs
- **Smart Text Extraction** - Automatically detects article content or read the full page
- **Visual Highlighting** - See what's being read with elegant word and paragraph highlighting
- **Playback Controls** - Play, pause, skip paragraphs, adjust speed
- **Floating Controller** - Draggable on-page controls for easy access
- **Context Menu Integration** - Right-click any selected text to read it aloud
- **Modern Dark UI** - Beautiful, distraction-free interface
- **Optional BYOK** - Provider keys are stored in extension storage, forwarded through the Proso
  API only for the explicit request, and never retained by the server

## Installation

### Install in Firefox

1. Open [Proso on Mozilla Add-ons](https://addons.mozilla.org/en-US/firefox/addon/proso/).
2. Choose **Add to Firefox** and review the requested permissions.
3. Open Proso settings and configure your audio source before starting playback.

Firefox 109 or later is required. See Mozilla Add-ons for the current published version.

### Your first listen

1. Finish [audio setup](#setup) before pressing play. For BYOK, select the provider
   that issued your key; a free installation does not include provider usage.
2. Open a normal web article with selectable text. Firefox internal pages such as
   `about:addons` are not a reading surface for the extension.
3. Select a short passage, right-click, and choose **Read with Proso**. Start with
   a short selection before trying a full article.
4. Use the on-page playback controls to pause or stop. Text highlighting lets you
   follow the passage while listening.

No audio? Check the selected provider, its key or plan, and the synthesis host's
availability. There is no silent fallback to a browser voice. See
[Get help](SUPPORT.md); never attach your API key or private page contents.

### Load a development build

```bash
git clone https://github.com/phsb5321/Proso.git
cd Proso
pnpm install --frozen-lockfile
pnpm --filter @proso/extension build:firefox
```

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and
select `packages/extension/.output/firefox-mv2/manifest.json`. Temporary add-ons
must be loaded again after restarting Firefox.

## Setup

### TTS providers

Proso routes synthesis through its server and currently supports these providers:

| Provider | Default path | Optional BYOK |
|----------|--------------|---------------|
| **OpenAI** | Server-managed for eligible plans | Supported |
| **ElevenLabs** | Server-managed for eligible plans | Supported |
| **Groq** | Server-managed for eligible plans | Supported |
| **Cartesia** | BYOK-only | Supported |

1. Click the Proso icon in your toolbar
2. Click the gear icon to open Settings
3. Select your preferred provider
4. Enter that provider's API key for BYOK, or configure an eligible managed plan

## Usage

### Basic Usage

After completing [audio setup](#setup):

1. Navigate to a web page with readable text
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

On a supported web page, right-click selected text and choose **Read with Proso**.
Playback requires the audio setup above; synthesis may take time.

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
- Uses page metadata and text heuristics; detection can be wrong on short or mixed-language text
- ISO 639-1 language codes (en, es, fr, de, etc.)
- Fallback to English if detection fails

## Privacy

- Optional BYOK provider keys are stored in browser extension storage
- Text selected for reading is sent to the Proso server and then to the selected TTS provider
- Optional technical and interaction telemetry is controlled separately from TTS content
- There is no local Browser TTS mode

## Support the project

Proso is built by solo developer Pedro H S Balbino. Support helps fund maintenance,
accessibility fixes, Firefox releases, speech-quality testing, and API infrastructure.

The extension is free to install. BYOK provider usage may cost money; managed
synthesis is a separate paid service. Donations do not buy credits, change plans,
or grant commercial licensing rights.

Donation options are being configured. PIX, Ko-fi, and GitHub Sponsors will be
linked here once their payment destinations are live.

For managed plans, see [pricing](https://proso.com.br/pricing.html).
For commercial licensing inquiries, contact [commercial@proso.com.br](mailto:commercial@proso.com.br).

## Contributing

Bug reports, documentation fixes, translations, accessibility feedback, and code
contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and checks,
and read the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

The repository's licensing metadata is not yet internally consistent: [`LICENSE`](LICENSE)
contains GPL-3.0 text, while package metadata says MIT and contributor docs have said AGPL-3.0. The
former `COMMERCIAL.md` was deleted because its terms were stale. Do not infer commercial or
redistribution terms from the contradictory metadata; the owner must choose and reconcile one
license in a dedicated legal-metadata change.

Third-party licenses are documented in [NOTICE](NOTICE).

## Acknowledgments

- [OpenAI](https://openai.com) for their TTS API
- [ElevenLabs](https://elevenlabs.io) for their premium voice synthesis
- [Groq](https://groq.com) for fast inference
- [Mozilla](https://mozilla.org) for the WebExtensions platform
