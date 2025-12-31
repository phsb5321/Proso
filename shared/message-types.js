/**
 * Message Types
 * Shared type definitions for message passing between extension components.
 *
 * @module shared/message-types
 */

/**
 * @typedef {Object} Message
 * @property {string} type - The message type identifier from MessageType enum
 * @property {Object} [payload] - Optional data specific to the message type
 */

/**
 * @typedef {function(Object, Sender): Promise<*>} MessageHandler
 * Handler function for processing incoming messages
 * @param {Object} payload - The message payload data
 * @param {Sender} sender - Information about the message sender
 * @returns {Promise<*>} The response to send back
 */

/**
 * @typedef {Object} Sender
 * @property {Object} [tab] - The tab that sent the message (if from content script)
 * @property {number} [tab.id] - The tab ID
 * @property {string} [tab.url] - The tab URL
 * @property {string} [frameId] - The frame ID within the tab
 * @property {string} [id] - The extension ID (if from another extension)
 */

/**
 * @typedef {Object} PlaybackState
 * @property {'idle'|'loading'|'playing'|'paused'|'stopped'|'error'} status - Current playback status
 * @property {number} currentIndex - Current paragraph index
 * @property {number} totalParagraphs - Total number of paragraphs
 * @property {number} progress - Progress percentage (0-100)
 * @property {string} currentText - Current paragraph text
 * @property {string} provider - TTS provider ID
 * @property {string} voice - Selected voice ID
 * @property {number} speed - Playback speed multiplier
 * @property {'selection'|'article'|'full'} mode - Text extraction mode
 * @property {string} [error] - Error message if status is 'error'
 */

/**
 * @typedef {Object} WordHighlight
 * @property {number} wordIndex - Index of the word in the timeline
 * @property {string} word - The word text
 * @property {number} startMs - Start time in milliseconds
 * @property {number} endMs - End time in milliseconds
 * @property {number} paragraphIndex - Index of the parent paragraph
 */

/**
 * @typedef {Object} WordTiming
 * @property {string} word - The word text
 * @property {number} startMs - Start time in milliseconds
 * @property {number} endMs - End time in milliseconds
 * @property {number} [confidence] - Confidence score (0-1)
 */

/**
 * @typedef {Object} SyncState
 * @property {number} currentTimeMs - Current playback time in milliseconds
 * @property {number} currentParagraphIndex - Current paragraph index
 * @property {number} currentWordIndex - Current word index
 * @property {number} driftMs - Detected drift in milliseconds
 * @property {boolean} isDrifting - Whether drift correction is needed
 */

/**
 * @typedef {Object} ElementInfo
 * @property {string} text - The element's text content
 * @property {string} tagName - The HTML tag name
 * @property {string} [xpath] - XPath to the element
 */

// Export empty object to make this a valid ES module
export {};
