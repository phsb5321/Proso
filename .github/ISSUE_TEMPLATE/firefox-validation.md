---
name: Firefox Validation
about: Track Firefox manual validation before release
title: 'Firefox Validation: [Version]'
labels: testing, firefox, validation
assignees: ''
---

## Firefox Manual Validation Checklist

**Firefox Version**: 
**VoxPage Version**: 
**Date**: 
**Tester**: 

### Setup
- [ ] Build extension: `pnpm build:firefox`
- [ ] Start web-ext: `pnpm validate:firefox`
- [ ] Extension icon appears in toolbar
- [ ] Extension popup opens

### Console Error Check
- [ ] Open DevTools Console (F12)
- [ ] Filter for VoxPage messages
- [ ] Wait 30 seconds idle
- [ ] No red (error) messages from VoxPage
- [ ] No uncaught exceptions
- [ ] No CSP violations

### Playback Test
- [ ] Navigate to Wikipedia test article
- [ ] Click paragraph - audio starts
- [ ] Audio starts within 3 seconds
- [ ] Footer appears at bottom
- [ ] Progress bar updates
- [ ] Click different paragraph - previous stops
- [ ] Double-click - only one audio plays

### Footer UI Test
- [ ] Play/pause button works
- [ ] Previous/next buttons work
- [ ] Progress bar shows position
- [ ] Close button hides footer
- [ ] Drag to reposition works
- [ ] Minimize button works

### Settings Page Test
- [ ] All sections load
- [ ] API key fields work
- [ ] Provider selection works
- [ ] Voice selection updates
- [ ] Save provides feedback
- [ ] Settings persist after reload

### Popup Test
- [ ] Popup opens without errors
- [ ] Current mode displayed
- [ ] Provider selection works
- [ ] Play button works
- [ ] Settings link works

## Test Results

### Pass / Fail Summary

| Category | Status | Notes |
|----------|--------|-------|
| Console Errors | PASS/FAIL | |
| Playback | PASS/FAIL | |
| Footer UI | PASS/FAIL | |
| Settings | PASS/FAIL | |
| Popup | PASS/FAIL | |

### Issues Found

<!-- List any issues discovered during validation -->

1. 

### Attachments

<!-- Attach console logs, screenshots, or videos if applicable -->

- Console log: 
- Screenshots: 

### Overall Status

- [ ] **APPROVED** - All checks passed, ready for release
- [ ] **BLOCKED** - Critical issues found, must fix before release
- [ ] **CONDITIONAL** - Minor issues found, can release with known issues
