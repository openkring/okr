import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree } from '@nx/devkit';
import { appGenerator } from './generator';

describe('app generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('rejects an invalid tenantId', async () => {
    await expect(
      appGenerator(tree, { tenantId: 'Acme Corp', appName: 'Acme' }),
    ).rejects.toThrow(/tenantId/);
  });

  it('creates the app project.json with the tenant name', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme' });
    expect(tree.exists('apps/acme-app/project.json')).toBe(true);
    const projectJson = tree.read('apps/acme-app/project.json', 'utf-8') ?? '';
    expect(projectJson).toContain('"name": "acme-app"');
  });

  // REGRESSION GUARD. The Universal-Links association file lives in a DOT directory
  // (src/.well-known/) and has no file extension. Both are exactly the shapes a file-copy
  // step tends to skip, and a missing association file fails silently: iOS just opens the
  // link in Safari again, which is the bug this was added to fix.
  it('emits the apple-app-site-association file for the tenant', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme' });

    const aasaPath = 'apps/acme-app/src/.well-known/apple-app-site-association';
    expect(tree.exists(aasaPath)).toBe(true);
    const aasa = JSON.parse(tree.read(aasaPath, 'utf-8') ?? '{}');
    expect(aasa.applinks.details[0].appIDs).toEqual(['7X4J6XQJV3.org.bkaiser.acme']);

    // ...and the build must actually copy it into the deployed site.
    const projectJson = tree.read('apps/acme-app/project.json', 'utf-8') ?? '';
    expect(projectJson).toContain('apps/acme-app/src/.well-known');
  });

  it('refuses to overwrite an existing app without force', async () => {
    tree.write('apps/acme-app/project.json', '{}');
    await expect(
      appGenerator(tree, { tenantId: 'acme', appName: 'Acme' }),
    ).rejects.toThrow(/already exists/);
  });

  it('substitutes tenant tokens into capacitor + project config', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme Club' });

    const capacitor = tree.read('apps/acme-app/capacitor.config.ts', 'utf-8') ?? '';
    expect(capacitor).toContain("appId: 'org.bkaiser.acme'");
    expect(capacitor).toContain("appName: 'Acme Club'");
    expect(capacitor).not.toContain('<%=');

    const projectJson = tree.read('apps/acme-app/project.json', 'utf-8') ?? '';
    expect(projectJson).not.toContain('scs-app');
    expect(projectJson).not.toContain('scs-website');

    // Tenant-agnostic shell files are copied verbatim (no token leakage).
    expect(tree.exists('apps/acme-app/src/main.ts')).toBe(true);
    expect(tree.exists('apps/acme-app/src/app/app.routes.ts')).toBe(true);
    const routes = tree.read('apps/acme-app/src/app/app.routes.ts', 'utf-8') ?? '';
    expect(routes).toContain("redirectTo: 'public/welcome_acme'");
    expect(routes).not.toContain('<%=');
  });

  // REGRESSION GUARD. The template used to emit a hand-written CMS-minimal table with no
  // UNGATED_ROUTES, so `/tenant/features` 404'd in every generated app — and that route is the
  // only caller of applyFeatureSelection, which seeds menuItems/main_<tenant>. A tenant
  // scaffolded without it can never build a menu, and `nx build` stays green throughout. Do
  // not replace these with a "no domain feature appears" assertion: gating is now dynamic
  // (isFeatureEnabledGuard per block), so no block name appears in this file either way and
  // such an assertion would pass vacuously.
  it('composes the route table from the gated catalogue and includes the feature picker', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme' });

    const routes = tree.read('apps/acme-app/src/app/app.routes.ts', 'utf-8') ?? '';
    expect(routes).toContain('composeGatedFeatureRoutes()');
    expect(routes).toContain('...UNGATED_ROUTES');
    expect(routes).toContain("from '@okr/tenant-routes'");
    // The ungated flatMap would make every catalogued screen reachable in every tenant.
    expect(routes).not.toContain('composeFeatureRoutes(');
  });

  it('does not emit secret/generated files', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme' });
    expect(tree.exists('apps/acme-app/.env')).toBe(false);
    expect(tree.exists('apps/acme-app/src/environments/environment.ts')).toBe(false);
    expect(tree.exists('apps/acme-app/src/firebase-config.js')).toBe(false);
  });

  // REGRESSION GUARD. The theme template shipped the Seeclub Stäfa palette until 2026-09, and
  // nothing downstream ever re-derived it — bka, bkg, kwa, p13, kring, okr and elab all went
  // live in another tenant's green/blue, because a palette that looks finished never prompts
  // anyone to ask. The template now carries a neutral placebo grey plus instructions; this test
  // fails the moment somebody pastes a real tenant's brand colours back into it.
  it('scaffolds a neutral placeholder theme, never another tenant’s brand colours', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme' });

    const theme = tree.read('apps/acme-app/src/theme/variables.scss', 'utf-8') ?? '';
    expect(theme).not.toContain('<%=');

    // The scs palette, verbatim — primary/secondary/tertiary plus the helper vars it leaked into.
    for (const scsColour of ['#009d53', '#014da2', '#00a2ff', '#6d89b9', '#f6f8fc']) {
      expect(theme.toLowerCase()).not.toContain(scsColour);
    }

    // …and it must still be a usable theme, not an empty file.
    expect(theme).toContain('--ion-color-primary:');
    expect(theme).toContain('--ion-color-primary-contrast:');
    // The instructions are the point: without them the placeholder is just a different default.
    expect(theme).toContain('PLATZHALTER');
    expect(theme).toContain('brand-styleguide');
  });
});
