/**
 * OpenAI TTS Provider
 * Implementation of ITTSProvider for OpenAI's text-to-speech API
 *
 * @module utils/providers/openai
 */

import { BaseTTSProvider, type TTSRequest, type TTSResponse, type VoiceOption } from './base';
import { ProviderPricing, type PricingModel } from './pricing';

/**
 * OpenAI voice definitions
 */
const OPENAI_VOICES: VoiceOption[] = [
  { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral' },
  { id: 'echo', name: 'Echo', language: 'en-US', gender: 'male' },
  { id: 'fable', name: 'Fable', language: 'en-GB', gender: 'neutral' },
  { id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male' },
  { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female' },
];

/**
 * OpenAI TTS Provider Implementation
 * Supports 50+ languages via auto-detection
 */
export class OpenAIProvider extends BaseTTSProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly supportsWordTiming = false; // OpenAI doesn't provide word-level timing
  readonly supportedLanguages: string[] = []; // Empty array = all languages (auto-detect)

  private apiKey: string | null = null;
  private readonly pricingModel: PricingModel = ProviderPricing.openai;

  /**
   * Set API key for authentication
   * @param apiKey - OpenAI API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Check if API key is configured
   */
  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  /**
   * Generate audio from text using OpenAI TTS API
   * @param request - TTS request with text, voice, speed, language
   * @returns Audio response with blob data and metadata
   */
  async generateAudio(request: TTSRequest): Promise<TTSResponse> {
    const validated = this.validateRequest(request);

    if (!this.hasApiKey()) {
      throw new Error('OpenAI API key not configured');
    }

    const speed = this.clampSpeed(validated.speed);
    const voiceId = validated.voice || 'alloy'; // Default voice

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: validated.text,
        voice: voiceId,
        response_format: 'mp3',
        speed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });

    // Estimate duration (OpenAI doesn't provide it)
    // Rough estimate: ~150 words per minute, ~5 chars per word
    const estimatedDuration = validated.text.length / (150 * 5) * 60;

    return this.createResponse(audioBlob, estimatedDuration, null);
  }

  /**
   * Get available voices
   * @param language - Optional language filter (ignored for OpenAI - supports all)
   */
  async getVoices(language?: string): Promise<VoiceOption[]> {
    // OpenAI voices work for all languages via auto-detection
    return OPENAI_VOICES;
  }

  /**
   * Validate API key by making a minimal test request
   * @param apiKey - API key to validate
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: 'test',
          voice: 'alloy',
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('OpenAI key validation error:', error);
      return false;
    }
  }

  /**
   * Clamp speed to OpenAI's supported range (0.25 - 4.0)
   * @param speed - Requested speed
   */
  protected clampSpeed(speed: number): number {
    return Math.max(0.25, Math.min(4.0, speed));
  }

  /**
   * Estimate cost for text generation
   * @param text - Text to estimate
   * @param useHD - Whether to use HD model (optional)
   */
  estimateCost(text: string, useHD: boolean = false): number {
    const pricing = useHD ? ProviderPricing.openaiHd : this.pricingModel;
    return (text.length / pricing.unit) * pricing.rate;
  }
}
