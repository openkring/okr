#!/usr/bin/env node
// Estimate how many Web-Mercator (EPSG:3857) map tiles an offline travel-journal map needs
// (spec 1.113 §9.4). Pure tile math, no downloads.
//
//   node scripts/journal-tiles-estimate.mjs --bbox -70,-66,-56,-53 --zooms 3-8 [--bbox …  --zooms …] [--kb 25]
//
// Each --bbox (west,south,east,north in degrees) pairs with the --zooms (min-max) that follows it;
// a --bbox without its own --zooms reuses the previous range. --kb is the average tile size used for
// the MB estimate (default 25 KB).

function lonToX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToY(lat, z) {
  const rad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

export function tilesFor([west, south, east, north], z) {
  const max = 2 ** z - 1;
  const x0 = Math.max(0, lonToX(west, z));
  const x1 = Math.min(max, lonToX(east, z));
  const y0 = Math.max(0, latToY(north, z));
  const y1 = Math.min(max, latToY(south, z));
  return (x1 - x0 + 1) * (y1 - y0 + 1);
}

function parseArgs(argv) {
  const jobs = [];
  let zooms = [3, 8];
  let kb = 25;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--bbox') {
      const box = value.split(',').map(Number);
      if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) throw new Error(`bad --bbox ${value}`);
      jobs.push({ box, zooms });
      i++;
    } else if (arg === '--zooms') {
      const [min, max] = value.split('-').map(Number);
      zooms = [min, max ?? min];
      if (jobs.length > 0) jobs[jobs.length - 1].zooms = zooms;
      i++;
    } else if (arg === '--kb') {
      kb = Number(value);
      i++;
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
  }
  return { jobs, kb };
}

function main() {
  const { jobs, kb } = parseArgs(process.argv.slice(2));
  if (jobs.length === 0) {
    console.error('usage: journal-tiles-estimate.mjs --bbox w,s,e,n --zooms min-max [--bbox …] [--kb 25]');
    process.exit(1);
  }
  let total = 0;
  for (const { box, zooms } of jobs) {
    console.log(`bbox ${box.join(',')}`);
    for (let z = zooms[0]; z <= zooms[1]; z++) {
      const n = tilesFor(box, z);
      total += n;
      console.log(`  z${String(z).padStart(2)}: ${n}`);
    }
  }
  console.log(`total tiles: ${total} ≈ ${((total * kb) / 1024).toFixed(0)} MB at ${kb} KB/tile`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
