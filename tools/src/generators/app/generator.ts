import { Tree, formatFiles, generateFiles, joinPathFragments, logger } from '@nx/devkit';
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

  // The theme ships a deliberately neutral placeholder palette, not a brand (see the header of
  // src/theme/variables.scss). Nothing downstream enforces that it gets replaced, and a palette
  // that merely LOOKS finished is what let four tenants go live in another tenant's colours —
  // so the reminder is printed where the person scaffolding cannot miss it.
  logger.info(
    [
      '',
      `✔ ${appRoot} scaffolded.`,
      '',
      'Noch offen — die App traegt bis dahin ein neutrales Platzhalter-Grau:',
      `  1. Markenfarben ableiten  → ${appRoot}/src/theme/variables.scss (Anleitung steht im Kopf der Datei)`,
      '     Skill `styling`; Quelle ist der Brand Guide des Mandanten, sonst site.css, sonst das Logo.',
      `  2. .env anlegen           → ${appRoot}/.env (aus .env.example, niemals committen)`,
      '  3. Erster Admin-Login     → /tenant/features aufrufen und einmal speichern,',
      '     sonst hat der Mandant kein Hauptmenue. Skill `provision-tenant`.',
      '',
    ].join('\n'),
  );
}

export default appGenerator;
