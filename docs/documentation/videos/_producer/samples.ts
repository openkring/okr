import './src/load-env';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { synthesize } from './src/tts';

// A short, club-relevant German sentence to compare voices.
const TEXT =
  'Herzlich willkommen im Mitgliederbereich des Seeclub Stäfa. ' +
  'In diesem Video zeige ich dir Schritt für Schritt, wie du dich anmeldest.';

const VOICES = [
  'de-CH-LeniNeural', // Swiss German, female (current)
  'de-CH-JanNeural', // Swiss German, male
  'de-DE-KatjaNeural', // High German, female
  'de-DE-ConradNeural', // High German, male
  'de-AT-IngridNeural', // Austrian German, female
];

async function main() {
  const outDir = join(__dirname, 'out', 'samples');
  mkdirSync(outDir, { recursive: true });
  for (const voice of VOICES) {
    const out = join(outDir, `${voice}.mp3`);
    const r = await synthesize(TEXT, voice, out);
    console.log(r.audioPath ? `✓ ${voice}` : `✗ ${voice} (no key?)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
