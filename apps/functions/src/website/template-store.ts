// Loads a tenant website's Handlebars template set from Storage (design §6.4).
// Layout: gs://<default bucket>/websites/<siteId>/templates/<version>/
//   website.json, layout.hbs, partials/*.hbs, sections/*.hbs, pages/*.hbs
// Written only by scripts/website-templates-upload.mjs (storage.rules deny every client).
import { getStorage } from 'firebase-admin/storage';
import type { PublishProblem, TemplateManifest, TemplateSet } from '@okr/cms-website-render';

/** `website.json` or `layout.hbs` is missing or unreadable: the caller reports `problem` as templateMissing. */
export class TemplateMissingError extends Error {
  public readonly problem: PublishProblem;

  public constructor(detail: string) {
    super(`templateMissing: ${detail}`);
    this.name = 'TemplateMissingError';
    this.problem = { code: 'templateMissing', detail };
  }
}

const SAFE_SEGMENT = /^[\w.-]+$/;
const MAX_CACHE = 20;
const cache = new Map<string, TemplateSet>();

export function clearTemplateCache(): void {
  cache.clear();
}

/** `partials/nav.hbs` → ['partials', 'nav']; anything else → undefined. */
function splitHbs(relative: string): [string, string] | undefined {
  const m = /^(partials|sections|pages)\/([\w-]+)\.hbs$/.exec(relative);
  return m ? [m[1], m[2]] : undefined;
}

export async function loadTemplates(siteId: string, version: string): Promise<TemplateSet> {
  if (!SAFE_SEGMENT.test(siteId) || !SAFE_SEGMENT.test(version) || version === '.' || version === '..') {
    throw new TemplateMissingError(`invalid template location ${siteId}@${version}`);
  }
  const key = `${siteId}@${version}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const prefix = `websites/${siteId}/templates/${version}/`;
  const [objects] = await getStorage().bucket().getFiles({ prefix });
  const set: TemplateSet = {
    manifest: undefined as unknown as TemplateManifest,
    layout: '',
    partials: {},
    sections: {},
    pages: {},
  };
  let hasManifest = false;
  let hasLayout = false;

  for (const object of objects) {
    const relative = object.name.slice(prefix.length);
    const [buffer] = await object.download();
    const text = buffer.toString('utf8');
    if (relative === 'website.json') {
      try {
        set.manifest = JSON.parse(text) as TemplateManifest;
        hasManifest = true;
      } catch {
        throw new TemplateMissingError(`${prefix}website.json is not valid JSON`);
      }
    } else if (relative === 'layout.hbs') {
      set.layout = text;
      hasLayout = true;
    } else {
      const parts = splitHbs(relative);
      if (parts) set[parts[0] as 'partials' | 'sections' | 'pages'][parts[1]] = text;
    }
  }
  if (!hasManifest) throw new TemplateMissingError(`${prefix}website.json not found`);
  if (!hasLayout) throw new TemplateMissingError(`${prefix}layout.hbs not found`);

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, set);
  return set;
}
