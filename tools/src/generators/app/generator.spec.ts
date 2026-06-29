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
});
