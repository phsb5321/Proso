# Firefox Manual Validation

This guide covers manual testing of VoxPage in Firefox. Since Playwright doesn't support Firefox extension loading, Firefox validation is done manually using `web-ext`.

> **See also**: For comprehensive validation (80+ items), see [`specs/041-firefox-first-pivot/manual-validation.md`](../specs/041-firefox-first-pivot/manual-validation.md)

## Prerequisites

- Firefox Developer Edition or standard Firefox (latest stable)
- VoxPage extension built for Firefox: `pnpm build:firefox`
- web-ext installed: `pnpm add -D web-ext` (already in devDependencies)

## Quick Start

```bash
# Build the Firefox extension
pnpm build:firefox

# Launch Firefox with extension loaded
pnpm validate:firefox

# Or manually:
web-ext run --source-dir=.output/firefox-mv2
```

## Validation Checklist

Use this checklist when validating Firefox compatibility. Complete each section and note any issues.

### Setup

- [ ] Build extension: `pnpm build:firefox`
- [ ] Start web-ext: `pnpm validate:firefox` or `web-ext run --source-dir=.output/firefox-mv2`
- [ ] Extension icon appears in toolbar
- [ ] Extension popup opens when clicking icon

### Console Error Check

1. Open Firefox DevTools (F12) on any webpage
2. Navigate to Console tab
3. Filter console: Type `VoxPage` or `-[third-party]` to filter noise
4. Wait 30 seconds idle on page
5. Check for errors:

- [ ] No red (error) messages from VoxPage
- [ ] No uncaught exceptions
- [ ] No CSP violations
- [ ] Warnings are acceptable (yellow)

### Playback Test

1. Navigate to a test article (e.g., [Wikipedia Test Page](https://en.wikipedia.org/wiki/Test))
2. Test basic playback:

- [ ] Click paragraph - audio starts playing
- [ ] Audio starts within 3 seconds
- [ ] Footer appears at bottom of page
- [ ] Progress bar updates as audio plays

3. Test paragraph switching:

- [ ] Click different paragraph - previous audio stops
- [ ] New audio starts for clicked paragraph
- [ ] Transition is smooth (< 500ms)

4. Test double-click behavior:

- [ ] Double-click same paragraph - only one audio plays
- [ ] No duplicate audio overlapping

### Footer UI Test

1. During playback, verify footer:

- [ ] Footer visible at bottom of viewport
- [ ] Play/pause button works
- [ ] Previous/next buttons work (if multiple paragraphs)
- [ ] Progress bar shows current position
- [ ] Close button hides footer

2. Footer interaction:

- [ ] Footer can be dragged to reposition
- [ ] Minimize button works
- [ ] Expanded footer shows all controls

### Settings Page Test

1. Right-click extension icon → Preferences (or Extension options)
2. Verify settings page:

- [ ] All sections load correctly
- [ ] API key fields accept input
- [ ] Provider selection works
- [ ] Voice selection updates per provider
- [ ] Save button provides feedback
- [ ] Settings persist after page reload

### Popup Test

1. Click extension icon in toolbar:

- [ ] Popup opens without errors
- [ ] Current mode displayed correctly
- [ ] Provider selection works
- [ ] Play button starts TTS for current page
- [ ] Settings link opens settings page

## Log Export

To save console logs for debugging:

1. Open DevTools Console (F12)
2. Right-click anywhere in console output
3. Select "Save All Messages to File"
4. Save as `.txt` file
5. Attach to issue report if needed

Alternatively, use Firefox's multi-line console copy:
1. Select multiple log lines
2. Right-click → Copy All Messages
3. Paste into issue description

## Screenshot Capture

### Full Page Screenshot

1. Open DevTools (F12)
2. Press Shift+F2 to open Developer Toolbar
3. Type: `screenshot --fullpage`
4. Screenshot saves to Downloads folder

### Viewport Screenshot

1. Press Shift+F2
2. Type: `screenshot`
3. Or use keyboard shortcut: Ctrl+Shift+S

### DevTools Screenshot

1. Right-click on element in Inspector
2. Select "Screenshot Node"
3. Element screenshot saves to Downloads

## Common Issues

### Extension Not Loading

**Symptoms**: No extension icon, popup doesn't open

**Check**:
- Verify build output exists: `ls .output/firefox-mv2/manifest.json`
- Check browser console (Ctrl+Shift+J) for extension errors
- Ensure Firefox version supports Manifest V2

### Content Script Not Injecting

**Symptoms**: Clicking paragraphs does nothing

**Check**:
- Open page console (F12) and look for VoxPage logs
- Check if content_scripts matches the URL pattern
- Try refreshing the page
- Check for CSP blocking script injection

### Audio Not Playing

**Symptoms**: No audio output, no errors

**Check**:
- Verify API key is configured in settings
- Check network tab for TTS API calls
- Check console for CORS or network errors
- Verify audio permissions in Firefox

### Footer Not Appearing

**Symptoms**: Audio plays but no footer visible

**Check**:
- Look for `.voxpage-footer` in DOM inspector
- Check z-index conflicts with page CSS
- Verify Shadow DOM is supported

## Reporting Issues

When reporting Firefox-specific issues:

1. **Include Firefox version**: Help → About Firefox
2. **Include VoxPage version**: Extension preferences page
3. **Attach console logs**: See "Log Export" section
4. **Attach screenshots**: See "Screenshot Capture" section
5. **Describe steps to reproduce**: Be specific about URLs and actions
6. **Note any extensions**: Other extensions that might conflict

## Automated vs Manual Testing

| Test Type | Chromium (Playwright) | Firefox (Manual) |
|-----------|----------------------|------------------|
| Console errors | ✓ Automated | Manual check |
| CSP violations | ✓ Automated | Manual check |
| Playback timing | ✓ Automated | Manual verification |
| UI responsiveness | ✓ Automated | Manual check |
| Cross-browser compat | N/A | Primary purpose |

## Validation Frequency

- **Before release**: Full checklist on Firefox stable
- **After major changes**: Abbreviated checklist (Console + Playback)
- **Bug fixes**: Targeted validation of affected features
