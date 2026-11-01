import './src/load-env';
import { prepare } from './src/prepare';
import type { Orientation } from './src/types';

// Parse + synthesize + stage assets, then point the user at `npm run studio`
// for live editing. Useful to review pacing before a full render.
async function main() {
  const [tenantTopic, variantArg = 'desktop'] = process.argv.slice(2);
  if (!tenantTopic) {
    console.error('usage: npm run prepare-video -- <tenant/topic> <desktop|mobile>');
    process.exit(1);
  }
  const result = await prepare(tenantTopic, variantArg as Orientation);
  console.log(`✓ prepared ${result.scenes.length} scenes (${result.orientation}).`);
  console.log(`  audio: ${result.hasAudio ? 'Azure TTS' : 'none (silent — set SPEECH_KEY)'}`);
  if (result.missing.length) {
    console.log(`  ⚠ placeholders for: ${result.missing.join(', ')}`);
  }
  console.log('\nNow open the live editor:  npm run studio');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
