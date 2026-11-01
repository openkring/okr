import './src/load-env';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { prepare } from './src/prepare';
import type { Orientation } from './src/types';

async function main() {
  const [tenantTopic, variantArg = 'desktop'] = process.argv.slice(2);
  if (!tenantTopic) {
    console.error('usage: npm run render -- <tenant/topic> <desktop|mobile>');
    console.error('   e.g: npm run render -- scs/login desktop');
    process.exit(1);
  }
  const variant = variantArg as Orientation;

  console.log(`▸ Preparing ${tenantTopic} (${variant}) …`);
  const result = await prepare(tenantTopic, variant);
  console.log(`  ${result.scenes.length} scenes · audio: ${result.hasAudio ? 'Azure TTS' : 'none (silent draft — set SPEECH_KEY)'}`);
  if (result.missing.length) {
    console.log(`  ⚠ ${result.missing.length} screenshot(s) missing → placeholders: ${result.missing.join(', ')}`);
  }

  console.log('▸ Bundling Remotion project …');
  const bundleLocation = await bundle({
    entryPoint: join(__dirname, 'src', 'index.ts'),
    publicDir: join(__dirname, 'public'),
  });

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'Tutorial',
    inputProps: result,
  });

  const [tenant, topic] = tenantTopic.split('/');
  const outDir = join(__dirname, 'out');
  mkdirSync(outDir, { recursive: true });
  const outputLocation = join(outDir, `${tenant}-${topic}-${variant}.mp4`);

  console.log(`▸ Rendering ${composition.width}×${composition.height}, ${composition.durationInFrames} frames …`);
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    inputProps: result,
    outputLocation,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r  ${(progress * 100).toFixed(0)}%   `);
    },
  });

  console.log(`\n✓ ${outputLocation}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
