// TTS Provider domain types — shared between extension and server

export enum TTSProvider {
  OpenAI = 'openai',
  ElevenLabs = 'elevenlabs',
  Groq = 'groq',
  Cartesia = 'cartesia',
  Browser = 'browser',
}

/** Cost per 1000 characters in USD cents */
export interface ProviderCost {
  provider: TTSProvider;
  costPer1000Chars: number;
  description: string;
}
