/** The German transcriptions: an umlaut becomes the vowel plus E, ß becomes SS. */
const TRANSCRIPTION: Record<string, string> = {
  'Ä': 'AE', 'Ö': 'OE', 'Ü': 'UE', 'ä': 'AE', 'ö': 'OE', 'ü': 'UE', 'ß': 'SS', 'ẞ': 'SS',
};

/**
 * Turns any typed or listed text into the letters the board plays with: A–Z only, upper case.
 * Umlauts and ß are transcribed (KÄSE → KAESE, FUß → FUSS), everything else that is not a
 * letter A–Z (digits, spaces, accents, punctuation) is dropped.
 *
 * Used for BOTH the word catalogue and the keyboard, so a player typing «Ä» on a Swiss keyboard
 * produces the same two letters the catalogue stores.
 */
export function normalizeLetters(raw: string): string {
  let out = '';
  for (const ch of raw) {
    const mapped = TRANSCRIPTION[ch] ?? ch.toUpperCase();
    for (const letter of mapped) {
      if (letter >= 'A' && letter <= 'Z') out += letter;
    }
  }
  return out;
}
