# VoxPage

**Transform any webpage into an immersive audio experience**

VoxPage is a Firefox extension that uses AI-powered text-to-speech to read web pages aloud with natural, expressive voices. Choose from premium AI voices (OpenAI, ElevenLabs) or use your browser's built-in speech synthesis.

## Features

- **Premium AI Voices** - Natural, expressive voices from OpenAI and ElevenLabs
- **Smart Text Extraction** - Automatically detects article content or read the full page
- **Visual Highlighting** - See what's being read with elegant highlighting
- **Playback Controls** - Play, pause, skip paragraphs, adjust speed
- **Context Menu Integration** - Right-click any selected text to read it aloud
- **Modern Dark UI** - Beautiful, distraction-free interface

## Installation

### From Firefox Add-ons (Coming Soon)
*Extension submission pending*

### Manual Installation (Development)

1. Clone or download this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the sidebar
4. Click "Load Temporary Add-on..."
5. Select the `manifest.json` file from the VoxPage folder

## Setup

### API Keys

VoxPage supports three TTS providers:

| Provider | Quality | Cost | Setup |
|----------|---------|------|-------|
| **OpenAI** | Excellent | ~$0.015/1K chars | [Get API Key](https://platform.openai.com/api-keys) |
| **ElevenLabs** | Premium | ~$0.30/1K chars | [Get API Key](https://elevenlabs.io/app/settings/api-keys) |
| **Browser** | Good | Free | No setup needed |

1. Click the VoxPage icon in your toolbar
2. Click the gear icon to open Settings
3. Enter your API key(s) for OpenAI and/or ElevenLabs
4. Select your preferred default provider

## Usage

### Basic Usage

1. Navigate to any webpage
2. Click the VoxPage icon in your toolbar
3. Select your preferred voice and reading mode
4. Click the play button

### Reading Modes

- **Full Page** - Reads all text content on the page
- **Article** - Intelligently extracts and reads only the main article content
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
- *...and more*

## Development

### Prerequisites

- Firefox 109+ (for Manifest V3 support)
- Node.js (optional, for icon generation)

### Project Structure

```
VoxPage/
├── manifest.json          # Extension configuration
├── background/            # Service worker
├── content/               # Content scripts
├── popup/                 # Extension popup UI
├── options/               # Settings page
├── styles/                # Injected styles
└── icons/                 # Extension icons
```

### Building Icons

```bash
# Requires ImageMagick
for size in 16 32 48 96 128; do
  convert -background none icons/icon.svg -resize ${size}x${size} icons/icon-${size}.png
done
```

### Packaging

```bash
cd VoxPage
zip -r ../voxpage.xpi * -x "*.git*" -x "*.md"
```

## Privacy

- **API keys are stored locally** in your browser's extension storage
- **No data is collected** by VoxPage
- Text is sent only to your selected TTS provider (OpenAI or ElevenLabs) when reading
- Browser TTS mode processes everything locally

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [OpenAI](https://openai.com) for their TTS API
- [ElevenLabs](https://elevenlabs.io) for their premium voice synthesis
- [Mozilla](https://mozilla.org) for the WebExtensions platform

---

Made with AI assistance
