# VoxPage - AI-Powered Page Reader

## Project Overview
VoxPage is a Firefox extension that transforms web pages into immersive audio experiences using AI-powered text-to-speech technology. It supports multiple TTS providers (OpenAI, ElevenLabs, and browser native) with a sleek, modern interface.

## Tech Stack
- **Platform**: Firefox WebExtension (Manifest V3)
- **Language**: JavaScript (ES6+)
- **TTS Providers**:
  - OpenAI TTS API (tts-1-hd model)
  - ElevenLabs API (eleven_multilingual_v2 model)
  - Browser native SpeechSynthesis API

## Project Structure
```
VoxPage/
├── manifest.json          # Extension manifest (MV3)
├── background/
│   └── background.js      # Service worker for TTS handling
├── content/
│   └── content.js         # Text extraction and highlighting
├── popup/
│   ├── popup.html         # Main UI
│   ├── popup.css          # Styles
│   └── popup.js           # UI logic
├── options/
│   ├── options.html       # Settings page
│   ├── options.css        # Settings styles
│   └── options.js         # Settings logic
├── styles/
│   └── content.css        # Injected page styles
├── icons/
│   └── icon.svg           # Extension icon (source)
└── lib/                   # Shared utilities (future)
```

## Key Features
1. **Multi-Provider TTS**: OpenAI, ElevenLabs, and browser native voices
2. **Smart Text Extraction**: Full page, article-only, or selection modes
3. **Real-time Highlighting**: Visual feedback showing current reading position
4. **Playback Controls**: Play, pause, skip, speed adjustment
5. **Context Menu Integration**: Right-click to read selected text

## Development Commands
```bash
# Load extension in Firefox
# 1. Open about:debugging
# 2. Click "This Firefox"
# 3. Click "Load Temporary Add-on"
# 4. Select manifest.json

# Generate icons (requires ImageMagick)
convert -background none icons/icon.svg -resize 16x16 icons/icon-16.png
convert -background none icons/icon.svg -resize 32x32 icons/icon-32.png
convert -background none icons/icon.svg -resize 48x48 icons/icon-48.png
convert -background none icons/icon.svg -resize 96x96 icons/icon-96.png
convert -background none icons/icon.svg -resize 128x128 icons/icon-128.png

# Package for distribution
cd VoxPage && zip -r ../voxpage.xpi *
```

## API Configuration
Users must configure their own API keys in the extension settings:
- **OpenAI**: Get from https://platform.openai.com/api-keys
- **ElevenLabs**: Get from https://elevenlabs.io/app/settings/api-keys

## Architecture Notes

### Background Service Worker
- Handles all TTS generation and playback
- Manages audio queue for paragraph-by-paragraph reading
- Communicates with content script for text extraction
- Supports preloading next paragraph for smoother playback

### Content Script
- Extracts readable text using multiple heuristics
- Supports article detection (like Readability)
- Handles text highlighting during playback
- Auto-scrolls to current reading position

### Popup UI
- Modern dark theme with purple accent
- Real-time playback controls
- Provider and voice selection
- Speed adjustment slider

## Common Tasks

### Adding a New TTS Provider
1. Add provider config to `popup/popup.js` voiceConfigs
2. Implement `generate[Provider]Audio()` in `background/background.js`
3. Add API key field in `options/options.html`
4. Update storage handling in `options/options.js`

### Modifying Text Extraction
- Edit `content/content.js` extractText functions
- Add selectors to `articleSelectors` for better article detection
- Modify `unwantedSelectors` to filter out more noise

### Styling Changes
- Main colors defined in CSS `:root` variables
- Popup styles in `popup/popup.css`
- Page highlight styles in `styles/content.css`

## Testing Checklist
- [ ] Test with OpenAI API key
- [ ] Test with ElevenLabs API key
- [ ] Test browser native TTS
- [ ] Test on various websites (news, blogs, docs)
- [ ] Test selection mode
- [ ] Test article detection
- [ ] Test playback controls (play, pause, skip)
- [ ] Test speed adjustment
- [ ] Verify highlighting works correctly
- [ ] Test context menu integration

## Known Issues / TODOs
- [ ] Add icon PNG generation script
- [ ] Implement audio preloading for smoother playback
- [ ] Add keyboard shortcuts functionality
- [ ] Add voice preview feature
- [ ] Implement reading progress persistence
- [ ] Add export to audio file feature
- [ ] Support for PDFs and other document types

## Resources
- [Firefox Extension Workshop](https://extensionworkshop.com/)
- [MDN WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [OpenAI TTS API](https://platform.openai.com/docs/guides/text-to-speech)
- [ElevenLabs API](https://elevenlabs.io/docs)
