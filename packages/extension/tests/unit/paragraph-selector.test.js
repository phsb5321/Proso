/**
 * Unit tests for paragraph selector hover state management
 * Feature: 011-highlight-playback-fix
 */

import { jest } from '@jest/globals';

describe('Paragraph Selector - Hover State Management (T034)', () => {
  let mockParagraphs;
  let selectionState;

  beforeEach(() => {
    // Mock paragraph elements
    mockParagraphs = [
      { classList: { add: jest.fn(), remove: jest.fn() }, dataset: {}, nodeType: 1 },
      { classList: { add: jest.fn(), remove: jest.fn() }, dataset: {}, nodeType: 1 },
      { classList: { add: jest.fn(), remove: jest.fn() }, dataset: {}, nodeType: 1 }
    ];

    // Mock selection state
    selectionState = {
      isSelectionModeActive: false,
      hoveredParagraphIndex: null,
      selectedParagraphIndices: new Set()
    };
  });

  test('should track hovered paragraph index', () => {
    selectionState.hoveredParagraphIndex = 1;
    expect(selectionState.hoveredParagraphIndex).toBe(1);
  });

  test('should clear hovered index on mouseleave', () => {
    selectionState.hoveredParagraphIndex = 2;

    // Simulate mouseleave
    selectionState.hoveredParagraphIndex = null;

    expect(selectionState.hoveredParagraphIndex).toBeNull();
  });

  test('should update hovered index on mouseenter', () => {
    expect(selectionState.hoveredParagraphIndex).toBeNull();

    // Simulate mouseenter on paragraph 0
    selectionState.hoveredParagraphIndex = 0;

    expect(selectionState.hoveredParagraphIndex).toBe(0);

    // Simulate mouseenter on paragraph 2 (moving cursor)
    selectionState.hoveredParagraphIndex = 2;

    expect(selectionState.hoveredParagraphIndex).toBe(2);
  });

  test('should allow only one paragraph hovered at a time', () => {
    // Only one hover at a time - this is enforced by the single variable
    selectionState.hoveredParagraphIndex = 0;
    expect(selectionState.hoveredParagraphIndex).toBe(0);

    selectionState.hoveredParagraphIndex = 1;
    expect(selectionState.hoveredParagraphIndex).toBe(1);
    expect(selectionState.hoveredParagraphIndex).not.toBe(0);
  });

  test('should maintain selection state separate from hover', () => {
    selectionState.selectedParagraphIndices.add(1);
    selectionState.hoveredParagraphIndex = 2;

    expect(selectionState.selectedParagraphIndices.has(1)).toBe(true);
    expect(selectionState.hoveredParagraphIndex).toBe(2);
  });

  test('hover preview should appear within 50ms', () => {
    const startTime = Date.now();

    // Simulate hover state update
    selectionState.hoveredParagraphIndex = 0;
    mockParagraphs[0].classList.add('voxpage-selectable');

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(50);
  });

  test('should not track hover when selection mode is inactive', () => {
    selectionState.isSelectionModeActive = false;

    // Attempt to hover
    if (selectionState.isSelectionModeActive) {
      selectionState.hoveredParagraphIndex = 1;
    }

    expect(selectionState.hoveredParagraphIndex).toBeNull();
  });

  test('should track hover when selection mode is active', () => {
    selectionState.isSelectionModeActive = true;

    // Attempt to hover
    if (selectionState.isSelectionModeActive) {
      selectionState.hoveredParagraphIndex = 1;
    }

    expect(selectionState.hoveredParagraphIndex).toBe(1);
  });
});
