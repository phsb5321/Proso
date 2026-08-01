# Contract: Message Protocol Alignment

**Feature**: 061-complete-architecture-migration

## Purpose

Define the canonical message naming conventions for all three communication channels to eliminate the naming mismatch that breaks popup ↔ background ↔ content script communication.

## Contract

### Channel 1: Popup → Background

**Convention**: Dot-notation (`domain.action`)
**Transport**: `browser.runtime.sendMessage()`

| Message | Payload | Response |
|---|---|---|
| `playback.start` | `{ tabId: number }` | `{ success: boolean }` |
| `playback.pause` | `void` | `{ success: boolean }` |
| `playback.resume` | `void` | `{ success: boolean }` |
| `playback.stop` | `void` | `{ success: boolean }` |
| `playback.next` | `void` | `{ success: boolean, currentParagraph: number }` |
| `playback.prev` | `void` | `{ success: boolean, currentParagraph: number }` |
| `playback.seek` | `{ position: number }` | `{ success: boolean }` |
| `playback.getState` | `void` | `PlaybackStateResponse` |
| `playback.setSpeed` | `{ speed: number }` | `{ success: boolean }` |
| `settings.get` | `void` | `Settings` |
| `settings.update` | `{ key: string, value: unknown }` | `{ success: boolean }` |
| `cache.getStats` | `void` | `CacheStats` |
| `cache.clear` | `void` | `{ success: boolean }` |
| `export.start` | `{ format: string, ... }` | `{ success: boolean }` |

### Channel 2: Background → Content Script

**Convention**: SCREAMING_SNAKE_CASE (matches existing content script switch cases)
**Transport**: `browser.tabs.sendMessage(tabId, { type: 'MESSAGE_TYPE', ... })`

| Message Type | Payload | Purpose |
|---|---|---|
| `FOOTER_SHOW` | `{ initialState?: FooterState }` | Show sticky footer |
| `FOOTER_HIDE` | `void` | Hide sticky footer |
| `FOOTER_STATE_UPDATE` | `FooterState` | Update footer playback state |
| `highlight` | `{ index: number, elements: Element[] }` | Highlight paragraph |
| `highlightWord` | `{ wordIndex: number }` | Highlight word |
| `clearHighlight` | `void` | Clear all highlights |
| `extractText` | `{ mode: string }` | Extract page text |

### Channel 3: Content Script → Background

**Convention**: SCREAMING_SNAKE_CASE (via `browser.runtime.sendMessage()`)
**Transport**: `browser.runtime.sendMessage()`

| Message Type | Payload | Purpose |
|---|---|---|
| `FOOTER_ACTION` | `{ action: string, value?: unknown }` | Footer button clicked |
| `PARAGRAPH_CLICKED` | `{ index: number }` | User clicked a paragraph |

## Verification

After migration, the following must be true:
1. `grep -r "sendMessage.*getPlaybackState\|startPlayback\|pausePlayback" src/entrypoints/popup/` returns zero matches
2. `grep -r "type: 'footer\." src/adapters/` returns zero matches (should use SCREAMING_SNAKE_CASE)
3. Zero "Unknown message type" warnings in browser console during normal operation
