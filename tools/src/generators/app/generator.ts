import { Tree, formatFiles, generateFiles, joinPathFragments } from '@nx/devkit';
import { AppGeneratorSchema } from './schema';

const TENANT_ID_RE = /^[a-z][a-z0-9-]+$/;

export async function appGenerator(tree: Tree, options: AppGeneratorSchema): Promise<void> {
  const { tenantId, appName, force = false } = options;

  if (!TENANT_ID_RE.test(tenantId)) {
    throw new Error(`Invalid tenantId "${tenantId}": must match ${TENANT_ID_RE}.`);
  }

  const appRoot = `apps/${tenantId}-app`;
  if (tree.exists(appRoot) && !force) {
    throw new Error(`${appRoot} already exists. Re-run with --force to overwrite.`);
  }

  generateFiles(tree, joinPathFragments(__dirname, 'files'), appRoot, {
    tenantId,
    appName,
    tmpl: '', // strips the __tmpl__ suffix from copied-verbatim files
  });

  await formatFiles(tree);
}

export default appGenerator;
