# Icon Design Conventions

**Last Updated**: 2026-01-20
**Feature Branch**: `047-architecture-ui-polish`

This document summarizes icon design conventions for browser extensions, derived from Mozilla, Google, and Apple guidelines.

---

## Executive Summary

VoxPage's toolbar icon must be:
- **Recognizable at 16px**: Simple silhouette, 2-3 tones max
- **Consistent with platform**: Follow Firefox Photon icon guidelines
- **Accessible**: 3:1 contrast ratio for essential elements

---

## Size Requirements

| Size | Usage | Notes |
|------|-------|-------|
| 16px | Toolbar icon | Most critical - must be legible |
| 32px | 2x toolbar (HiDPI) | |
| 48px | Extension management | |
| 64px | 2x extension management | |
| 96px | AMO listing | |
| 128px | Store marketing | Full detail allowed |

**Manifest Configuration**:
```json
{
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "96": "icons/icon-96.png",
    "128": "icons/icon-128.png"
  }
}
```

---

## Firefox Photon Guidelines

### Grid System

- Use 4px grid for alignment
- 2px padding from edge at 16px
- Icons should fill ~80% of canvas

### Shape Language

- Rounded corners: 2px radius at 16px scale
- Consistent stroke width: 2px at 16px
- Geometric, not organic shapes

### Color Palette

| Context | Color | Usage |
|---------|-------|-------|
| Dark theme | `#FFFFFF` | Monochrome icon |
| Light theme | `#20123A` | Monochrome icon |
| Accent | `#0060DF` | Firefox blue (avoid unless partnered) |
| VoxPage accent | `#0D9488` | Teal - our brand color |

### Do's and Don'ts

**Do**:
- Use simple, recognizable silhouettes
- Design for 16px first, then scale up
- Test against light AND dark backgrounds
- Use consistent visual metaphors

**Don't**:
- Include text in icon
- Use gradients at 16px
- Use more than 3 colors
- Add decorative elements that disappear at small sizes

---

## Chrome Web Store Guidelines

### Size Requirements

- 128px icon required for store listing
- Square aspect ratio
- PNG format with transparency

### Visual Recommendations

- Full-bleed images fill entire space
- Icons with padding use 16px margin at 128px
- Consistent visual weight with other extensions

---

## Apple Human Interface Guidelines

### Safari Extension Icons

- macOS: 16x16, 32x32, 64x64, 128x128, 256x256, 512x512
- iOS: 76x76, 120x120, 152x152

### Design Principles

- Single, centered subject
- No transparency for app icons
- Consistent perspective (front-facing)

---

## VoxPage Icon Concept

### Current Design

The current icon features a stylized sound wave pattern representing text-to-speech functionality.

### Recommended Improvements

1. **Simplify for 16px**: Reduce to 3 essential elements
2. **Increase contrast**: Ensure 3:1 ratio against toolbar
3. **Add visual metaphor**: Consider combining speech/page elements
4. **Test dark mode**: Icon must work on dark toolbar backgrounds

### Icon Concepts

**Option A: Waveform**
```
    ╔═══╗
   ║░░░║
   ║███║  → Sound waves emerging from page
   ║░░░║
    ╚═══╝
```

**Option B: Page + Speaker**
```
   ┌────┐
   │ )))) │  → Page with audio waves
   └────┘
```

**Option C: Abstract TTS**
```
    A→🔊  → Text converting to audio
```

---

## Technical Specifications

### File Format

- **Source**: SVG (vector, scalable)
- **Export**: PNG with transparency
- **Color depth**: 32-bit RGBA

### Export Process

1. Design master icon at 128px in SVG
2. Export PNG at each required size
3. Verify pixel-perfect alignment at 16px
4. Test on both light and dark backgrounds

### Quality Checks

| Check | Requirement |
|-------|-------------|
| Contrast | 3:1 minimum for essential elements |
| Legibility | Recognizable at 16px |
| Alignment | Pixel-perfect at all sizes |
| Background | Works on both light and dark |

---

## Current Icon Files

```
public/icons/
├── icon-16.png   (1.35 kB)
├── icon-32.png   (2.14 kB)
├── icon-48.png   (3.47 kB)
├── icon-96.png   (7.75 kB)
└── icon-128.png  (7.27 kB)
```

---

## References

### Mozilla Resources

- [Firefox Photon Iconography](https://design.firefox.com/photon/visuals/iconography.html)
- [WebExtension Icons](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/icons)
- [AMO Icon Requirements](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)

### Google Resources

- [Chrome Web Store Images](https://developer.chrome.com/docs/webstore/images)
- [Material Icons](https://fonts.google.com/icons)

### Apple Resources

- [Human Interface Guidelines - App Icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Safari Extension Icons](https://developer.apple.com/documentation/safariservices/safari_web_extensions/converting_a_web_extension_for_safari)

---

## Implementation Status

| Task | Status |
|------|--------|
| Research documented | Complete |
| Design concepts | Complete |
| Master SVG creation | Deferred |
| PNG exports | Existing icons in use |
| Manifest verification | Complete |

**Note**: Icon asset creation is deferred to a future design sprint. Current icons are functional and meet minimum requirements.
