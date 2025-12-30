/**
 * VoxPage Background Service Worker
 * Handles TTS generation and playback coordination
 */

// Playback state
const playbackState = {
  isPlaying: false,
  isPaused: false,
  currentProvider: 'openai',
  currentVoice: 'alloy',
  speed: 1.0,
  mode: 'full',
  paragraphs: [],
  currentIndex: 0,
  audioQueue: [],
  currentAudio: null,
  startTime: 0,
  totalDuration: 0
};

// ElevenLabs voice IDs mapping
const elevenLabsVoiceIds = {
  'rachel': '21m00Tcm4TlvDq8ikWAM',
  'drew': '29vD33N1CtxCmqQRPOHJ',
  'clyde': '2EiwWnXFnvU5JabPnv8n',
  'paul': '5Q0t7uMcjvnagumLfvZi',
  'domi': 'AZnzlk1XvdvUeBnXmlld',
  'dave': 'CYw3kZ02Hs0563khs1Fj',
  'fin': 'D38z5RcWu1voky8WS1ja',
  'sarah': 'EXAVITQu4vr4xnSDxMaL',
  'antoni': 'ErXwobaYiN019PkySvjV',
  'elli': 'MF3mGyEYCl7XYWbV9V6O'
};

/**
 * Initialize context menu
 */
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'voxpage-read-selection',
    title: 'Read with VoxPage',
    contexts: ['selection']
  });
});

/**
 * Handle context menu clicks
 */
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'voxpage-read-selection' && info.selectionText) {
    handlePlay({
      mode: 'selection',
      text: info.selectionText
    }, tab);
  }
});

/**
 * Listen for messages from popup and content scripts
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'play':
      handlePlay(message, sender.tab);
      break;
    case 'pause':
      handlePause();
      break;
    case 'stop':
      handleStop();
      break;
    case 'prev':
      handlePrev();
      break;
    case 'next':
      handleNext();
      break;
    case 'setProvider':
      playbackState.currentProvider = message.provider;
      break;
    case 'setVoice':
      playbackState.currentVoice = message.voice;
      break;
    case 'setSpeed':
      playbackState.speed = message.speed;
      if (playbackState.currentAudio) {
        playbackState.currentAudio.playbackRate = message.speed;
      }
      break;
    case 'getState':
      sendResponse({
        isPlaying: playbackState.isPlaying,
        progress: {
          current: getCurrentProgress(),
          total: playbackState.totalDuration
        }
      });
      return true;
    case 'textContent':
      // Received text from content script
      processTextContent(message.text, message.mode);
      break;
  }
});

/**
 * Handle play request
 */
async function handlePlay(message, tab) {
  try {
    playbackState.currentProvider = message.provider || playbackState.currentProvider;
    playbackState.currentVoice = message.voice || playbackState.currentVoice;
    playbackState.speed = message.speed || playbackState.speed;
    playbackState.mode = message.mode || playbackState.mode;

    // If we have direct text (from selection), use it
    if (message.text) {
      await processTextContent(message.text, 'selection');
      return;
    }

    // Otherwise, request text from content script
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      browser.tabs.sendMessage(tabs[0].id, {
        action: 'extractText',
        mode: playbackState.mode
      });
    }
  } catch (error) {
    console.error('Play error:', error);
    notifyError(error.message);
  }
}

/**
 * Process text content and start playback
 */
async function processTextContent(text, mode) {
  if (!text || text.trim().length === 0) {
    notifyError('No text found to read');
    return;
  }

  // Split text into paragraphs
  playbackState.paragraphs = splitIntoParagraphs(text);
  playbackState.currentIndex = 0;
  playbackState.audioQueue = [];
  playbackState.isPlaying = true;
  playbackState.isPaused = false;
  playbackState.startTime = Date.now();

  // Estimate total duration (rough: ~150 words per minute)
  const wordCount = text.split(/\s+/).length;
  playbackState.totalDuration = (wordCount / 150) * 60;

  notifyPlaybackState(true);
  await playCurrentParagraph();
}

/**
 * Split text into readable paragraphs
 */
function splitIntoParagraphs(text) {
  // Split on double newlines or long single newlines
  const chunks = text
    .split(/\n\n+|\n(?=\s*[A-Z])/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Further split very long paragraphs
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length > 1000) {
      // Split on sentences for long paragraphs
      const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk];
      let current = '';
      for (const sentence of sentences) {
        if (current.length + sentence.length > 800) {
          if (current) result.push(current.trim());
          current = sentence;
        } else {
          current += ' ' + sentence;
        }
      }
      if (current) result.push(current.trim());
    } else {
      result.push(chunk);
    }
  }

  return result;
}

/**
 * Play the current paragraph
 */
async function playCurrentParagraph() {
  if (!playbackState.isPlaying || playbackState.currentIndex >= playbackState.paragraphs.length) {
    handleStop();
    return;
  }

  const text = playbackState.paragraphs[playbackState.currentIndex];

  try {
    // Highlight current paragraph in page
    highlightParagraph(playbackState.currentIndex);

    // Generate and play audio
    if (playbackState.currentProvider === 'browser') {
      await playWithBrowserTTS(text);
    } else {
      const audioData = await generateAudio(text);
      await playAudio(audioData);
    }
  } catch (error) {
    console.error('Playback error:', error);
    notifyError(`Playback error: ${error.message}`);
    handleStop();
  }
}

/**
 * Generate audio using AI TTS API
 */
async function generateAudio(text) {
  const settings = await browser.storage.local.get(['openaiApiKey', 'elevenlabsApiKey']);

  if (playbackState.currentProvider === 'openai') {
    return await generateOpenAIAudio(text, settings.openaiApiKey);
  } else if (playbackState.currentProvider === 'elevenlabs') {
    return await generateElevenLabsAudio(text, settings.elevenlabsApiKey);
  }

  throw new Error('Unknown provider');
}

/**
 * Generate audio with OpenAI TTS
 */
async function generateOpenAIAudio(text, apiKey) {
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: text,
      voice: playbackState.currentVoice,
      speed: playbackState.speed
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  return await response.arrayBuffer();
}

/**
 * Generate audio with ElevenLabs
 */
async function generateElevenLabsAudio(text, apiKey) {
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured');
  }

  const voiceId = elevenLabsVoiceIds[playbackState.currentVoice] || elevenLabsVoiceIds['rachel'];

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail?.message || `ElevenLabs API error: ${response.status}`);
  }

  return await response.arrayBuffer();
}

/**
 * Play audio buffer
 */
async function playAudio(audioData) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    playbackState.currentAudio = new Audio(url);
    playbackState.currentAudio.playbackRate = playbackState.speed;

    playbackState.currentAudio.onended = () => {
      URL.revokeObjectURL(url);
      playbackState.currentIndex++;
      updateProgress();

      if (playbackState.isPlaying && !playbackState.isPaused) {
        playCurrentParagraph();
      }
      resolve();
    };

    playbackState.currentAudio.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Audio playback failed'));
    };

    playbackState.currentAudio.play();
  });
}

/**
 * Play using browser's built-in TTS
 */
function playWithBrowserTTS(text) {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);

    // Find the selected voice
    const voices = speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.voiceURI === playbackState.currentVoice);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = playbackState.speed;

    utterance.onend = () => {
      playbackState.currentIndex++;
      updateProgress();

      if (playbackState.isPlaying && !playbackState.isPaused) {
        playCurrentParagraph();
      }
      resolve();
    };

    utterance.onerror = (event) => {
      if (event.error !== 'canceled') {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      } else {
        resolve();
      }
    };

    speechSynthesis.speak(utterance);
  });
}

/**
 * Handle pause
 */
function handlePause() {
  playbackState.isPaused = true;
  playbackState.isPlaying = false;

  if (playbackState.currentProvider === 'browser') {
    speechSynthesis.pause();
  } else if (playbackState.currentAudio) {
    playbackState.currentAudio.pause();
  }

  notifyPlaybackState(false);
}

/**
 * Handle stop
 */
function handleStop() {
  playbackState.isPlaying = false;
  playbackState.isPaused = false;
  playbackState.currentIndex = 0;

  if (playbackState.currentProvider === 'browser') {
    speechSynthesis.cancel();
  } else if (playbackState.currentAudio) {
    playbackState.currentAudio.pause();
    playbackState.currentAudio = null;
  }

  clearHighlight();
  notifyPlaybackState(false);
}

/**
 * Handle previous paragraph
 */
function handlePrev() {
  if (playbackState.currentIndex > 0) {
    handleStop();
    playbackState.currentIndex = Math.max(0, playbackState.currentIndex - 1);
    playbackState.isPlaying = true;
    notifyPlaybackState(true);
    playCurrentParagraph();
  }
}

/**
 * Handle next paragraph
 */
function handleNext() {
  if (playbackState.currentIndex < playbackState.paragraphs.length - 1) {
    if (playbackState.currentProvider === 'browser') {
      speechSynthesis.cancel();
    } else if (playbackState.currentAudio) {
      playbackState.currentAudio.pause();
      playbackState.currentAudio = null;
    }

    playbackState.currentIndex++;
    updateProgress();

    if (playbackState.isPlaying) {
      playCurrentParagraph();
    }
  }
}

/**
 * Get current progress in seconds
 */
function getCurrentProgress() {
  const paragraphProgress = playbackState.currentIndex / playbackState.paragraphs.length;
  return paragraphProgress * playbackState.totalDuration;
}

/**
 * Update progress in popup
 */
function updateProgress() {
  browser.runtime.sendMessage({
    type: 'progress',
    current: getCurrentProgress(),
    total: playbackState.totalDuration
  }).catch(() => {});
}

/**
 * Notify popup of playback state change
 */
function notifyPlaybackState(isPlaying) {
  browser.runtime.sendMessage({
    type: 'playbackState',
    isPlaying: isPlaying
  }).catch(() => {});
}

/**
 * Notify popup of error
 */
function notifyError(message) {
  browser.runtime.sendMessage({
    type: 'error',
    error: message
  }).catch(() => {});
}

/**
 * Highlight current paragraph in the page
 */
async function highlightParagraph(index) {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      browser.tabs.sendMessage(tabs[0].id, {
        action: 'highlight',
        index: index
      });
    }
  } catch (error) {
    // Content script might not be ready
  }
}

/**
 * Clear highlight from page
 */
async function clearHighlight() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      browser.tabs.sendMessage(tabs[0].id, {
        action: 'clearHighlight'
      });
    }
  } catch (error) {
    // Content script might not be ready
  }
}

console.log('VoxPage background service worker initialized');
