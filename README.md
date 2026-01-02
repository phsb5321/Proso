# VoxPage

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](LICENSE)
[![CI](https://github.com/phsb5321/VoxPage/actions/workflows/ci.yml/badge.svg)](https://github.com/phsb5321/VoxPage/actions/workflows/ci.yml)
[![Firefox 109+](https://img.shields.io/badge/Firefox-109%2B-orange.svg)](https://www.mozilla.org/firefox/)

**Transform any webpage into an immersive audio experience**

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

### Prerequisites

- Firefox 109+ (for Manifest V3 support)
- Node.js 20.x
- npm

### Setup

```bash
git clone https://github.com/phsb5321/VoxPage.git
cd VoxPage
npm install
```

### Commands

```bash
npm test          # Run tests
npm run lint      # Check code style
npm run quality   # Run full quality checks
```

### Project Structure

```
VoxPage/
├── manifest.json          # Extension configuration
├── background/            # Service worker modules
├── content/               # Content scripts
├── popup/                 # Extension popup UI
├── options/               # Settings page
├── shared/                # Shared utilities
├── styles/                # CSS styles
└── tests/                 # Test suites
```

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

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenAI](https://openai.com) for their TTS API
- [ElevenLabs](https://elevenlabs.io) for their premium voice synthesis
- [Groq](https://groq.com) for fast inference
- [Mozilla](https://mozilla.org) for the WebExtensions platform
