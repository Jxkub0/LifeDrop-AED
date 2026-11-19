import * as Speech from 'expo-speech';

export type SpeechRateSetting = 'slow' | 'normal' | 'fast';

const RATES: Record<SpeechRateSetting, number> = { slow: 0.75, normal: 0.92, fast: 1.1 };

let currentRate: number = RATES.normal;

/** Set from the user's settings so every caller speaks at the chosen speed. */
export function setSpeechRate(rate: SpeechRateSetting): void {
  currentRate = RATES[rate] ?? RATES.normal;
}

/** Read text aloud in British English, interrupting anything already being spoken. */
export async function speak(text: string): Promise<void> {
  try {
    await Speech.stop();
  } catch {
    // ignore
  }
  Speech.speak(text, { language: 'en-GB', rate: currentRate, pitch: 1.0 });
}

export function stopSpeaking(): void {
  Speech.stop().catch(() => undefined);
}
