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
    expect(routes).toContain("redirectTo: 'public/welcome'");
    expect(routes).not.toContain('finance');
  });

  it('does not emit secret/generated files', async () => {
    await appGenerator(tree, { tenantId: 'acme', appName: 'Acme' });
    expect(tree.exists('apps/acme-app/.env')).toBe(false);
    expect(tree.exists('apps/acme-app/src/environments/environment.ts')).toBe(false);
    expect(tree.exists('apps/acme-app/src/firebase-config.js')).toBe(false);
  });
});
