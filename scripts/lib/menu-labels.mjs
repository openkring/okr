/**
 * Menu-label release guard — a menuItems doc must never be live before its label is.
 *
 * `menuItems` is shared Firestore data: a new row shows up in every tenant's app the moment its
 * doc is written. Its label (`@item.<name>`, resolved in libs/cms/menu/feature/src/i18n) only
 * ships with the next hosting release. In between, every user sees the raw key and Sentry opens
 * one `i18n missing-key: cmsMenuFeature.item.<name>` ticket per row (SCS-CA/CD/CE, 2026-10).
 *
 * So: release first, seed second. `assertMenuLabelsLive` checks the LIVE bundle of each target
 * tenant's hosting site and refuses an `--apply` while a label is missing there.
 */

/** Hosting site per tenant — the app sites all follow `<tenant>-app-54aef` (see release.mjs SITES). */
const siteOf = (tenant) => `https://${tenant}-app-54aef.web.app`;

/** Resolves '@item.x' against the menu bundle (a flat or nested `item` block). */
export const hasMenuLabel = (bundle, label) => {
  const key = label.slice('@item.'.length);
  return typeof bundle?.item?.[key] === 'string' || typeof bundle?.[`item.${key}`] === 'string';
};

/** The labels a list of menu specs/docs needs (`label` + a toggle's `labelAlt`). */
export const menuLabelsOf = (specs) =>
  [...new Set(specs.flatMap((s) => [s.label, s.labelAlt]).filter((l) => typeof l === 'string' && l.startsWith('@item.')))];

/** Fetches a tenant's live menu bundle; null when the site does not serve it (SPA fallback = HTML). */
async function liveMenuBundle(tenant) {
  try {
    const res = await fetch(`${siteOf(tenant)}/assets/i18n/cms/menu/feature/de.json`, { cache: 'no-store' });
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

/**
 * Prints the labels not yet live per tenant. With `apply`, exits the process unless
 * `--allow-unreleased-labels` is passed — that flag is for a deliberate, short-lived gap.
 */
export async function assertMenuLabelsLive(labels, tenants, { apply }) {
  const missing = [];
  for (const tenant of tenants) {
    const bundle = await liveMenuBundle(tenant);
    if (!bundle) { missing.push(`${tenant}: live menu bundle unreadable at ${siteOf(tenant)}`); continue; }
    for (const label of labels) if (!hasMenuLabel(bundle, label)) missing.push(`${tenant}: ${label}`);
  }
  if (missing.length === 0) {
    console.log(`  labels  all ${labels.length} label(s) are live for ${tenants.join(', ')}\n`);
    return;
  }
  console.log(`  labels  NOT LIVE YET — users would see the raw key:\n${missing.map((m) => `          ${m}`).join('\n')}`);
  console.log('          Release the app(s) carrying these labels first, then seed.\n');
  if (apply && !process.argv.includes('--allow-unreleased-labels')) {
    console.error('Aborted: labels not live. Pass --allow-unreleased-labels to seed anyway.');
    process.exit(1);
  }
}
