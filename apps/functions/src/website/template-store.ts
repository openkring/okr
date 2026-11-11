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

const SAFE_SITE = /^[A-Za-z0-9_-]+$/;
const SAFE_VERSION = /^[A-Za-z0-9._-]+$/;
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

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Checks the parsed `website.json`; returns the problem text, or undefined when the manifest is usable. */
function manifestError(m: unknown, siteId: string): string | undefined {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return 'manifest is not an object';
  const o = m as Record<string, unknown>;
  if (typeof o['siteId'] !== 'string' || o['siteId'] !== siteId) return `manifest siteId must be "${siteId}"`;
  if (typeof o['version'] !== 'string' || !o['version']) return 'manifest version must be a string';
  if (!isStringArray(o['sectionTypes'])) return 'manifest sectionTypes must be a string array';
  const fixed = o['fixedPages'];
  const fixedOk = Array.isArray(fixed) && fixed.every((f) => {
    const r = f as Record<string, unknown> | null;
    return !!r && typeof r === 'object' && typeof r['name'] === 'string' && !!r['name'] && typeof r['slug'] === 'string' && /^[a-z0-9-]+$/.test(r['slug']);
  });
  if (!fixedOk) return 'manifest fixedPages must be an array of {name, slug} (slug a-z, 0-9, -)';
  const legacy = o['legacyRedirects'];
  if (legacy !== undefined) {
    const ok = Array.isArray(legacy) && legacy.every((r) => !!r && typeof r === 'object' && typeof (r as Record<string, unknown>)['from'] === 'string' && typeof (r as Record<string, unknown>)['key'] === 'string');
    if (!ok) return 'manifest legacyRedirects must be an array of {from, key} strings';
  }
  return undefined;
}

export async function loadTemplates(siteId: string, version: string): Promise<TemplateSet> {
  if (!SAFE_SITE.test(siteId) || !SAFE_VERSION.test(version) || version.includes('..')) {
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new TemplateMissingError(`${prefix}website.json is not valid JSON`);
      }
      const bad = manifestError(parsed, siteId);
      if (bad) throw new TemplateMissingError(`${prefix}website.json: ${bad}`);
      set.manifest = parsed as TemplateManifest;
      hasManifest = true;
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
