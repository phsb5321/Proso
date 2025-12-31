/**
 * VoxPage Groq Timestamp Provider
 * Extracts word-level timestamps from audio using Groq Whisper API
 * for audio-text synchronization
 */

import { GroqWhisper, StorageKey } from '../constants.js';

/**
 * Word timing data structure
 * @typedef {Object} WordTiming
 * @property {string} word - The transcribed word text
 * @property {number} startMs - Start time in milliseconds
 * @property {number} endMs - End time in milliseconds
 * @property {number} charOffset - Character offset within source text
 * @property {number} charLength - Character length in source text
 */

/**
 * Word timeline for a paragraph
 * @typedef {Object} WordTimeline
 * @property {number} paragraphIndex - Index of the paragraph
 * @property {WordTiming[]} words - Array of word timing data
 * @property {number} audioDurationMs - Total audio duration in milliseconds
 * @property {string} sourceText - Original source text
 * @property {string} transcribedText - Transcription from Groq
 * @property {number} alignmentConfidence - 0-1 alignment quality score
 */

/**
 * GroqTimestampProvider extracts word-level timestamps from audio
 * using the Groq Whisper API for forced alignment
 */
export class GroqTimestampProvider {
  constructor() {
    /** @type {string|null} */
    this._apiKey = null;

    /** @type {boolean} */
    this._initialized = false;
  }

  /**
   * Initialize the provider by loading API key from storage
   */
  async initialize() {
    try {
      const result = await browser.storage.local.get(StorageKey.API_KEY_GROQ);
      this._apiKey = result[StorageKey.API_KEY_GROQ] || null;
      this._initialized = true;
    } catch (error) {
      console.error('GroqTimestampProvider: Failed to load API key:', error);
      this._initialized = true;
    }
  }

  /**
   * Check if API key is configured
   * @returns {boolean}
   */
  hasApiKey() {
    return this._apiKey !== null && this._apiKey.length > 0;
  }

  /**
   * Extract word timings from audio blob using Groq Whisper API
   * @param {Blob|ArrayBuffer} audioData - Audio data to transcribe
   * @param {string} sourceText - Original source text for alignment
   * @returns {Promise<WordTimeline|null>} Word timeline or null on failure
   */
  async extractWordTimings(audioData, sourceText) {
    if (!this.hasApiKey()) {
      console.warn('GroqTimestampProvider: No API key configured, falling back to paragraph sync');
      return null;
    }

    try {
      // Convert ArrayBuffer to Blob if needed
      const audioBlob = audioData instanceof Blob
        ? audioData
        : new Blob([audioData], { type: 'audio/mpeg' });

      // Build form data for Groq API
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp3');
      formData.append('model', GroqWhisper.MODEL);
      formData.append('response_format', GroqWhisper.RESPONSE_FORMAT);
      formData.append('timestamp_granularities[]', 'word');
      formData.append('timestamp_granularities[]', 'segment');

      // Call Groq Whisper API
      const response = await fetch(GroqWhisper.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorCode = errorData.error?.code || response.status;

        if (response.status === 401) {
          console.warn('GroqTimestampProvider: Invalid API key');
        } else if (response.status === 429) {
          console.warn('GroqTimestampProvider: Rate limited, falling back to paragraph sync');
        } else {
          console.warn(`GroqTimestampProvider: API error ${errorCode}:`, errorData.error?.message);
        }

        return null;
      }

      const data = await response.json();

      // Check if we have word-level timestamps
      if (!data.words || data.words.length === 0) {
        console.warn('GroqTimestampProvider: No word timestamps in response');
        return null;
      }

      // Convert Groq response to WordTimeline
      const wordTimeline = this._convertToWordTimeline(data, sourceText);

      return wordTimeline;
    } catch (error) {
      console.error('GroqTimestampProvider: Failed to extract word timings:', error);
      return null;
    }
  }

  /**
   * Convert Groq API response to WordTimeline format
   * @param {Object} groqResponse - Raw Groq API response
   * @param {string} sourceText - Original source text
   * @returns {WordTimeline}
   * @private
   */
  _convertToWordTimeline(groqResponse, sourceText) {
    const words = groqResponse.words.map(w => ({
      word: this._cleanWord(w.word),
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      charOffset: -1,  // Will be computed during alignment
      charLength: -1   // Will be computed during alignment
    }));

    // Align transcribed words to source text
    const alignedWords = this._alignWordsToSource(words, sourceText);

    // Calculate alignment confidence
    const alignmentConfidence = this._calculateAlignmentConfidence(alignedWords, sourceText);

    return {
      paragraphIndex: 0, // Will be set by caller
      words: alignedWords,
      audioDurationMs: Math.round(groqResponse.duration * 1000),
      sourceText: sourceText,
      transcribedText: groqResponse.text,
      alignmentConfidence: alignmentConfidence
    };
  }

  /**
   * Clean word text (remove trailing punctuation for matching)
   * @param {string} word - Raw word from Groq
   * @returns {string} Cleaned word
   * @private
   */
  _cleanWord(word) {
    return word.replace(/[.,!?;:'"]+$/, '').trim();
  }

  /**
   * Align transcribed words to source text positions
   * Uses normalized string matching with fuzzy fallback
   * @param {WordTiming[]} words - Words from Groq
   * @param {string} sourceText - Original source text
   * @returns {WordTiming[]} Words with charOffset/charLength filled
   * @private
   */
  _alignWordsToSource(words, sourceText) {
    const normalizedSource = sourceText.toLowerCase();
    let searchStart = 0;

    return words.map((word, index) => {
      const normalizedWord = word.word.toLowerCase();

      // Try exact match first
      let foundIndex = normalizedSource.indexOf(normalizedWord, searchStart);

      // If exact match fails, try fuzzy matching
      if (foundIndex === -1) {
        // Try matching without punctuation in source
        const cleanSource = normalizedSource.slice(searchStart);
        const fuzzyMatch = this._fuzzyFindWord(normalizedWord, cleanSource);
        if (fuzzyMatch !== -1) {
          foundIndex = searchStart + fuzzyMatch;
        }
      }

      if (foundIndex !== -1) {
        // Find the actual word boundaries in source (preserve original casing/punctuation)
        const wordBoundaries = this._findWordBoundaries(sourceText, foundIndex, normalizedWord.length);

        searchStart = wordBoundaries.end;

        return {
          ...word,
          charOffset: wordBoundaries.start,
          charLength: wordBoundaries.end - wordBoundaries.start
        };
      }

      // Fallback: estimate position based on previous words
      const estimatedOffset = this._estimateWordOffset(words, index, sourceText.length);

      return {
        ...word,
        charOffset: estimatedOffset,
        charLength: word.word.length
      };
    });
  }

  /**
   * Find word boundaries in source text, including any attached punctuation
   * @param {string} source - Original source text
   * @param {number} startIndex - Approximate start position
   * @param {number} wordLength - Length of matched word
   * @returns {{start: number, end: number}} Actual word boundaries
   * @private
   */
  _findWordBoundaries(source, startIndex, wordLength) {
    // Extend backward to find word start (skip leading whitespace)
    let start = startIndex;
    while (start > 0 && /\s/.test(source[start - 1])) {
      start--;
    }
    // Actually we want to find the start of this word, not previous
    start = startIndex;

    // Extend forward to include trailing punctuation
    let end = startIndex + wordLength;
    while (end < source.length && /[.,!?;:'")\]}>]/.test(source[end])) {
      end++;
    }

    return { start, end };
  }

  /**
   * Fuzzy find a word in text, handling contractions and variations
   * @param {string} word - Word to find
   * @param {string} text - Text to search in
   * @returns {number} Index or -1 if not found
   * @private
   */
  _fuzzyFindWord(word, text) {
    // Handle common contractions
    const contractionMap = {
      "don't": "do not",
      "doesn't": "does not",
      "won't": "will not",
      "can't": "cannot",
      "i'm": "i am",
      "you're": "you are",
      "they're": "they are",
      "we're": "we are",
      "it's": "it is",
      "that's": "that is",
      "there's": "there is",
      "what's": "what is",
      "who's": "who is",
      "let's": "let us",
      "i'll": "i will",
      "you'll": "you will",
      "he'll": "he will",
      "she'll": "she will",
      "we'll": "we will",
      "they'll": "they will",
      "i've": "i have",
      "you've": "you have",
      "we've": "we have",
      "they've": "they have",
      "i'd": "i would",
      "you'd": "you would",
      "he'd": "he would",
      "she'd": "she would",
      "we'd": "we would",
      "they'd": "they would"
    };

    // Check if word is an expansion of a contraction in text
    for (const [contraction, expansion] of Object.entries(contractionMap)) {
      if (word === expansion.split(' ')[0] || word === expansion.split(' ')[1]) {
        const idx = text.indexOf(contraction);
        if (idx !== -1) return idx;
      }
    }

    // Try matching first few characters (handles partial matches)
    if (word.length >= 3) {
      const prefix = word.slice(0, 3);
      const idx = text.indexOf(prefix);
      if (idx !== -1) {
        // Verify it's at a word boundary
        if (idx === 0 || /\s/.test(text[idx - 1])) {
          return idx;
        }
      }
    }

    return -1;
  }

  /**
   * Estimate word offset based on surrounding words
   * @param {WordTiming[]} words - All words
   * @param {number} index - Current word index
   * @param {number} textLength - Total text length
   * @returns {number} Estimated character offset
   * @private
   */
  _estimateWordOffset(words, index, textLength) {
    // Find nearest aligned word before this one
    for (let i = index - 1; i >= 0; i--) {
      if (words[i].charOffset >= 0) {
        const prevEnd = words[i].charOffset + words[i].charLength;
        // Estimate based on time proportion
        const timeDiff = words[index].startMs - words[i].endMs;
        const avgCharPerMs = textLength / (words[words.length - 1].endMs || 1);
        return Math.min(textLength - 1, prevEnd + Math.round(timeDiff * avgCharPerMs));
      }
    }

    // Fallback: proportional based on word index
    return Math.floor((index / words.length) * textLength);
  }

  /**
   * Calculate alignment confidence score
   * @param {WordTiming[]} alignedWords - Aligned words
   * @param {string} sourceText - Original source
   * @returns {number} Confidence score 0-1
   * @private
   */
  _calculateAlignmentConfidence(alignedWords, sourceText) {
    if (alignedWords.length === 0) return 0;

    let alignedCount = 0;
    for (const word of alignedWords) {
      if (word.charOffset >= 0 && word.charLength > 0) {
        alignedCount++;
      }
    }

    return alignedCount / alignedWords.length;
  }
}

// Export singleton instance
export const groqTimestampProvider = new GroqTimestampProvider();
