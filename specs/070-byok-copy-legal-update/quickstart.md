# Quickstart: BYOK Legal & Marketing Copy Update

**Feature**: 070-byok-copy-legal-update
**Date**: 2026-03-01
**Purpose**: Before/after copy reference for each file edit

## Key Facts (use these consistently across all documents)

The BYOK data flow after 069-server-tts-centralization:

1. User enters API key in extension settings
2. Key is cached in `browser.storage.local` (browser-encrypted)
3. When synthesis is requested, key is sent over HTTPS to Proso server
4. Server uses key for a single API call to the TTS provider
5. Key is discarded from server memory immediately after the request
6. Key is never persisted, logged, or stored on any server

**What's true**:
- Keys are cached locally in the browser
- Keys are forwarded securely over HTTPS
- Keys exist in server memory only for one request
- Keys are never persisted, logged, or stored on server
- BYOK is free on all tiers including Free
- Browser TTS is 100% client-side, unlimited, free

**What's false** (must not appear in any document):
- "Keys never leave your browser"
- "Keys are never transmitted to Proso servers"
- "Keys stay in your browser"
- "Proso never sees them"
- "Direct from your browser to the provider"
- "Proso does not proxy"

---

## File 1: `packages/legal/terms.html`

### Edit 1A: Section 2 — BYOK Definition (line 109-110)

**Before**:
```html
<dt>&ldquo;BYOK&rdquo; (Bring Your Own Key)</dt>
<dd>A feature that allows you to connect your own API keys from third-party TTS providers, enabling premium voice synthesis without using managed credits.</dd>
```

**After**:
```html
<dt>&ldquo;BYOK&rdquo; (Bring Your Own Key)</dt>
<dd>A feature that allows you to use your own API keys from third-party TTS providers, forwarded securely through Proso&rsquo;s server for synthesis, enabling premium voice synthesis without using managed credits.</dd>
```

### Edit 1B: Section 3 — BYOK Bullet (line 137)

**Before**:
```html
<li><strong>BYOK</strong>: Uses your own API keys from third-party TTS providers. BYOK is always available on all tiers, always free, and your API keys never leave your browser.</li>
```

**After**:
```html
<li><strong>BYOK</strong>: Uses your own API keys from third-party TTS providers, forwarded securely through Proso&rsquo;s server. BYOK is always available on all tiers and always free. Your keys are never stored on Proso servers.</li>
```

### Edit 1C: Section 9 — Intro Paragraph (line 324)

**Before**:
```html
<p>BYOK (Bring Your Own Key) lets you connect your own API keys from third-party TTS providers to access premium voice synthesis directly, without using Proso managed credits.</p>
```

**After**:
```html
<p>BYOK (Bring Your Own Key) lets you use your own API keys from third-party TTS providers for premium voice synthesis, without using Proso managed credits. Your keys are forwarded securely through Proso&rsquo;s server and never stored.</p>
```

### Edit 1D: Section 9 — "Local Storage" Subsection (lines 329-330)

**Before**:
```html
<h3>Local Storage</h3>
<p>Your API keys are stored exclusively in your browser&rsquo;s local storage (<code>browser.storage.local</code>). Proso never transmits your API keys to Proso servers. API key data flows only between your browser and the third-party provider you have selected.</p>
```

**After**:
```html
<h3>Key Handling</h3>
<p>Your API keys are cached in your browser&rsquo;s local storage (<code>browser.storage.local</code>) so you don&rsquo;t need to re-enter them. When you use a BYOK key for text-to-speech synthesis, the key is transmitted over HTTPS to the Proso server, which uses it for a single API request to your selected provider and immediately discards it.</p>
<p>Proso never persists, logs, or stores your BYOK API keys on the server. Keys exist in server memory only for the duration of a single synthesis request.</p>
<p><strong>Data flow:</strong></p>
<ol>
  <li>Your key is read from browser local storage</li>
  <li>Transmitted over HTTPS to the Proso server</li>
  <li>Used for one provider API call</li>
  <li>Discarded from server memory</li>
</ol>
<p>You may delete your locally stored keys at any time through the extension settings.</p>
```

### Edit 1E: Section 9 — Liability (line 340-341)

**Before**:
```html
<h3>Liability</h3>
<p>Proso is not liable for charges, service interruptions, or data processing that occurs between your browser and your third-party provider when using BYOK. If a BYOK provider is unavailable, Proso falls back to browser-native TTS.</p>
```

**After**:
```html
<h3>Liability</h3>
<p>Proso is not liable for charges, service interruptions, or data processing that occurs between Proso&rsquo;s server and your third-party provider when using BYOK. Proso&rsquo;s role is limited to securely forwarding your key for a single request. If a BYOK provider is unavailable, Proso falls back to browser-native TTS.</p>
```

### Edit 1F: Section 14 — Privacy Bullet (line 488)

**Before**:
```html
<li>Your BYOK API keys (these are stored locally in your browser and never transmitted to Proso servers)</li>
```

**After**:
```html
<li>Your BYOK API keys are not permanently stored on Proso servers. Keys are cached locally in your browser and forwarded to the server only during synthesis requests, where they are used once and immediately discarded.</li>
```

---

## File 2: `packages/site/privacy.html`

### Edit 2A: Extension Data — API Keys Bullet (line 59)

**Before**:
```html
<li><strong>API keys</strong>: If you use Bring Your Own Key (BYOK), your API keys are stored locally in your browser using <code>browser.storage.local</code>. They are never transmitted to Proso servers or any party other than your selected TTS provider.</li>
```

**After**:
```html
<li><strong>API keys</strong>: If you use Bring Your Own Key (BYOK), your API keys are cached locally in your browser using <code>browser.storage.local</code>. When you generate audio, your key is forwarded over HTTPS to the Proso server, which uses it for a single API request to your selected TTS provider and immediately discards it. Keys are never persisted, logged, or stored on the server.</li>
```

### Edit 2B: Data Sent to TTS Providers (line 64-65)

**Before**:
```html
<h3>Data Sent to TTS Providers</h3>
<p>When you generate audio, the text content of the paragraphs you listen to is sent to your selected TTS provider (OpenAI, ElevenLabs, Groq, Cartesia, or your browser's built-in engine). This transmission is direct from your browser to the provider. Proso does not proxy, log, or store this data. Each provider's privacy policy governs how they handle your text data.</p>
```

**After**:
```html
<h3>Data Sent to TTS Providers</h3>
<p>When you generate audio, the text content of the paragraphs you listen to is sent to your selected TTS provider (OpenAI, ElevenLabs, Groq, Cartesia, or your browser&rsquo;s built-in engine). For managed credit users and BYOK users, this text is transmitted through the Proso server, which forwards it to the provider and does not store it. For browser-native TTS, all processing occurs entirely in your browser with no server involvement. Each provider&rsquo;s privacy policy governs how they handle your text data.</p>
```

### Edit 2C: Your Rights — BYOK Users (line 97)

**Before**:
```html
<p>For BYOK users (free tier): We hold no personal data about you. Your API keys and preferences are stored only in your browser. There is nothing for us to delete or provide.</p>
```

**After**:
```html
<p>For BYOK users (free tier): We do not permanently store any personal data about you. Your API keys and preferences are stored locally in your browser. During synthesis requests, your API key is processed ephemerally in server memory (never written to disk, logs, or database) and discarded immediately. To stop all processing, simply remove your API keys from the extension settings.</p>
```

---

## File 3: `packages/site/terms.html`

### Edit 3A: Section 7 — Your API Keys (line 143)

**Before**:
```html
<p>API keys for third-party TTS providers (OpenAI, ElevenLabs, Groq, Cartesia) are stored locally in your browser using <code>browser.storage.local</code>. Your keys are never transmitted to Proso servers. You are responsible for keeping your API keys secure and for any charges incurred from third-party services.</p>
```

**After**:
```html
<p>API keys for third-party TTS providers (OpenAI, ElevenLabs, Groq, Cartesia) are cached locally in your browser using <code>browser.storage.local</code>. When you generate audio, your key is forwarded securely over HTTPS to the Proso server for a single synthesis request and immediately discarded. Keys are never permanently stored on Proso servers. You are responsible for keeping your API keys secure and for any charges incurred from third-party services.</p>
```

---

## File 4: `packages/site/pricing.html`

### Edit 4A: BYOK Callout Box (line 162)

**Before**:
```html
<p>Already have API keys from a TTS provider? Use them with Proso for free on any tier &mdash; including the Free plan. Your keys stay in your browser. Proso never sees them.</p>
```

**After**:
```html
<p>Already have API keys from a TTS provider? Use them with Proso for free on any tier &mdash; including the Free plan. Your keys are forwarded securely through our server for each request and never stored.</p>
```

### Edit 4B: FAQ "Can I use my own API keys?" (line 188)

**Before**:
```html
<p>Yes, on every tier &mdash; including Free &mdash; and it's always free. Bring your own OpenAI, ElevenLabs, Groq, or Cartesia API key and use premium voices without spending any managed credits. Your keys are stored locally in your browser and never sent to Proso servers.</p>
```

**After**:
```html
<p>Yes, on every tier &mdash; including Free &mdash; and it&rsquo;s always free. Bring your own OpenAI, ElevenLabs, Groq, or Cartesia API key and use premium voices without spending any managed credits. Your keys are cached locally in your browser and securely forwarded through our server when you play audio. Keys are used for one request and immediately discarded &mdash; never logged or stored.</p>
```

---

## File 5: `packages/site/index.html`

### Edit 5A: Privacy Features Section (line 217)

**Before**:
```html
<p>API keys stored locally in your browser. No telemetry, no tracking, no data collection. Open-source code you can audit.</p>
```

**After**:
```html
<p>API keys cached locally in your browser, forwarded securely for synthesis and never stored on our servers. No telemetry, no tracking, no data collection. Open-source code you can audit.</p>
```

---

## Verification Checklist

After all edits, run these searches to confirm zero false claims remain:

```bash
grep -rn "never leave your browser" packages/site/ packages/legal/
grep -rn "never transmitted" packages/site/ packages/legal/
grep -rn "never sent to" packages/site/ packages/legal/
grep -rn "stored exclusively in your browser" packages/site/ packages/legal/
grep -rn "keys stay in your browser" packages/site/ packages/legal/
grep -rn "Proso never sees" packages/site/ packages/legal/
grep -rn "does not proxy" packages/site/ packages/legal/
```

All commands should return zero results.
