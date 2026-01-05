/**
 * Groq TTS Provider
 * Implementation of ITTSProvider for Groq's text-to-speech API
 *
 * @module utils/providers/groq
 */

import { BaseTTSProvider, type TTSRequest, type TTSResponse, type VoiceOption } from './base';

/**
 * Groq voice definitions (limited selection)
 */
const GROQ_VOICES: VoiceOption[] = [
  { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral' },
  { id: 'echo', name: 'Echo', language: 'en-US', gender: 'male' },
  { id: 'fable', name: 'Fable', language: 'en-GB', gender: 'neutral' },
  { id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male' },
  { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female' },
];

/**
 * Groq TTS Provider Implementation
 * Uses Groq's OpenAI-compatible TTS API (free tier available)
 */
export class GroqProvider extends BaseTTSProvider {
  readonly id = 'groq';
  readonly name = 'Groq';
  readonly supportsWordTiming = false;
  readonly supportedLanguages: string[] = ['en']; // English only

  private apiKey: string | null = null;

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  async generateAudio(request: TTSRequest): Promise<TTSResponse> {
    const validated = this.validateRequest(request);

    if (!this.hasApiKey()) {
      throw new Error('Groq API key not configured');
    }

    // Check language support
    if (validated.language && !this.supportsLanguage(validated.language)) {
      throw new Error(`Groq only supports English. Use OpenAI or ElevenLabs for ${validated.language}`);
    }

    const voiceId = validated.voice || 'alloy'; // Default voice

    const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'distil-whisper-large-v3-en',
        input: validated.text,
        voice: voiceId,
        response_format: 'mp3',
        speed: validated.speed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Groq API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });

    // Estimate duration
    const estimatedDuration = validated.text.length / (150 * 5) * 60;

    return this.createResponse(audioBlob, estimatedDuration, null);
  }

  async getVoices(language?: string): Promise<VoiceOption[]> {
    return GROQ_VOICES;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Groq key validation error:', error);
      return false;
    }
  }

  protected clampSpeed(speed: number): number {
    return Math.max(0.25, Math.min(4.0, speed));
  }
}
