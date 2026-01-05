/**
 * Cartesia TTS Provider
 * Implementation of ITTSProvider for Cartesia's text-to-speech API
 *
 * @module utils/providers/cartesia
 */

import { BaseTTSProvider, type TTSRequest, type TTSResponse, type VoiceOption } from './base';
import { ProviderPricing } from './pricing';

/**
 * Cartesia voice definitions
 */
const CARTESIA_VOICES: VoiceOption[] = [
  { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Barbershop Man', language: 'en-US', gender: 'male' },
  { id: '156fb8d2-335b-4950-9cb3-a2d33befec77', name: 'Friendly Sidekick', language: 'en-US', gender: 'neutral' },
  { id: '5619d38c-cf51-4d8e-9575-48f61a280413', name: 'Sweet Lady', language: 'en-US', gender: 'female' },
  { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'Sportsman', language: 'en-US', gender: 'male' },
  { id: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', name: 'Storyteller', language: 'en-US', gender: 'neutral' },
];

const CARTESIA_API_VERSION = '2025-04-16';

/**
 * Cartesia TTS Provider Implementation
 * English-only provider with high-quality voices
 */
export class CartesiaProvider extends BaseTTSProvider {
  readonly id = 'cartesia';
  readonly name = 'Cartesia';
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
      throw new Error('Cartesia API key not configured');
    }

    // Check language support
    if (validated.language && !this.supportsLanguage(validated.language)) {
      throw new Error(`Cartesia only supports English. Use OpenAI or ElevenLabs for ${validated.language}`);
    }

    const voiceId = validated.voice || 'a0e99841-438c-4a64-b679-ae501e7d6091'; // Default voice
    const speed = this.clampSpeed(validated.speed);

    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Cartesia-Version': CARTESIA_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-2024-12-12',
        transcript: validated.text,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 24000,
        },
        generation_config: {
          speed,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Cartesia API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });

    // Estimate duration
    const estimatedDuration = validated.text.length / (150 * 5) * 60 / speed;

    return this.createResponse(audioBlob, estimatedDuration, null);
  }

  async getVoices(language?: string): Promise<VoiceOption[]> {
    return CARTESIA_VOICES;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.cartesia.ai/voices', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Cartesia-Version': CARTESIA_API_VERSION,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Cartesia key validation error:', error);
      return false;
    }
  }

  protected clampSpeed(speed: number): number {
    // Cartesia supports 0.6 to 1.5
    return Math.max(0.6, Math.min(1.5, speed));
  }
}
