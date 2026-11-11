/**
 * Developer deploy of a tenant website (spec 1.153 §9): production action.
 *
 *   node scripts/website-deploy.mjs <tenant> [--dry-run]
 *
 * Steps:
 *   0. rebuild Tailwind into apps/<tenant>-website/assets/tailwind.css (warns when it changed: bump the ?v= cache-bust)
 *   1. pnpm nx build <tenant>-website                      (static assets → dist/apps/<tenant>-website)
 *   2. node scripts/website-templates-upload.mjs <tenant>  (templates → Storage, websites/<id>.templateVersion)
 *   3. render the CURRENT Firestore content (read-only) with the local templates into dist/apps/<tenant>-website
 *      (refuses when the renderer reports problems)
 *   4. firebase deploy --only hosting:<hostingSite> --project bkaiser-org
 * --dry-run prints every step and command and runs none of them. It only reads Firestore (to name the
 * hosting site and count the render problems; offline it falls back to a placeholder) and runs the upload
 * script's own --dry-run, which writes nothing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getDb, loadLiveSource, loadLocalTemplates, parseArgs, PROJECT_ID, render, requireTenant, ROOT } from './lib/website-tooling.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function step(n, title, command) {
  console.log(`\n[${n}] ${title}\n    $ ${command}`);
}

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CI: 'true' } });
  if (r.status !== 0) fail(`Failed: ${cmd} ${args.join(' ')}`);
}

async function main() {
  const { tenant, flags } = parseArgs(process.argv.slice(2));
  requireTenant(tenant, 'Usage: node scripts/website-deploy.mjs <tenant> [--dry-run]');
  const dryRun = flags.has('--dry-run');
  const out = join(ROOT, 'dist/apps', `${tenant}-website`);
  const manifest = loadLocalTemplates(tenant).manifest;

  console.log(`${dryRun ? 'DRY RUN' : 'DEPLOY'} ${tenant}-website (siteId ${manifest.siteId}, project ${PROJECT_ID})`);
  const css = join('apps', `${tenant}-website`, 'assets', 'tailwind.css');
  const tailwind = ['exec', 'tailwindcss', '-c', `apps/${tenant}-website/tailwind.config.js`, '-i', `apps/${tenant}-website/tailwind.input.css`, '-o', css, '--minify'];
  const build = ['nx', 'build', `${tenant}-website`];
  const upload = ['scripts/website-templates-upload.mjs', tenant];
  step(0, 'Rebuild Tailwind (the committed tailwind.css is the source)', `pnpm ${tailwind.join(' ')}`);
  step(1, 'Build the static assets', `pnpm ${build.join(' ')}`);
  step(2, 'Upload the templates', `node ${upload.join(' ')}`);
  step(3, `Render the current Firestore content into ${out.replace(ROOT + '/', '')}`, 'in-process (read-only)');

  let hostingSite = `<websites/${manifest.siteId}.hostingSite>`;
  if (dryRun) {
    try {
      await getDb();
      const source = await loadLiveSource(tenant);
      hostingSite = source.site.hostingSite;
      const result = render({ ...source, templates: loadLocalTemplates(tenant) });
      console.log(`    would render ${result.files.length} files; problems: ${result.problems.length}${source.synthetic ? '  (SYNTHETIC site: websites/' + manifest.siteId + ' is missing)' : ''}`);
      for (const p of result.problems) console.log(`      ${JSON.stringify(p)}`);
    } catch (e) {
      console.log(`    (Firestore not reachable offline: ${e.code ?? e.message})`);
    }
  }
  const deploy = ['deploy', '--only', `hosting:${hostingSite}`, '--project', PROJECT_ID];
  step(4, 'Deploy to Firebase Hosting (PRODUCTION)', `firebase ${deploy.join(' ')}`);

  if (dryRun) {
    sh('node', [...upload, '--dry-run']);
    console.log('\nDry run: nothing built, uploaded, rendered to disk or deployed.');
    return;
  }

  const before = existsSync(join(ROOT, css)) ? readFileSync(join(ROOT, css)) : Buffer.alloc(0);
  sh('pnpm', tailwind);
  const after = readFileSync(join(ROOT, css));
  if (!before.equals(after)) {
    console.warn(`\nWARNING: ${css} changed (${before.length} -> ${after.length} bytes, ${after.length - before.length >= 0 ? '+' : ''}${after.length - before.length}). Bump the ?v= cache-bust on the stylesheet link in the templates and commit before relying on this deploy (immutable-CSS trap, website skill).\n`);
  }
  sh('pnpm', build);
  // Render (and refuse on problems) BEFORE anything is uploaded or templateVersion is written.
  const source = await loadLiveSource(tenant);
  if (source.synthetic) fail(`Refusing: websites/${manifest.siteId} does not exist.`);
  const result = render({ ...source, templates: loadLocalTemplates(tenant) });
  if (result.problems.length) fail(`Refusing: the renderer reports problems:\n${result.problems.map((p) => '  ' + JSON.stringify(p)).join('\n')}`);
  sh('node', upload);
  for (const f of result.files) {
    mkdirSync(dirname(join(out, f.path)), { recursive: true });
    writeFileSync(join(out, f.path), f.content);
  }
  console.log(`Rendered ${result.files.length} files.`);
  sh('firebase', ['deploy', '--only', `hosting:${source.site.hostingSite}`, '--project', PROJECT_ID]);
}

main().catch((e) => fail(e.stack ?? String(e)));
