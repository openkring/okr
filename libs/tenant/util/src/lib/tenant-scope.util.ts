/**
 * Which Firestore collections are tenant-scoped, and which tenant ids are legitimate.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS DERIVED AND NOT A LIST
 * ─────────────────────────────────────────────────────────────────────────────────────
 * A hand-written list of tenant-scoped collections is exactly the artefact that rots:
 * whoever adds the 65th model will not remember to append it, and a migration that
 * silently skips a collection is worse than one that stops and asks. So the set is
 * DERIVED from `@okr/shared-models` source — the `*Collection` constants crossed with the
 * models that actually declare `tenants` — and anything the derivation cannot resolve
 * confidently is REPORTED as ambiguous rather than guessed either way.
 *
 * The functions here are pure: the caller supplies the file contents (a script reads them
 * from disk, a spec supplies fixtures). That is what lets the drift guard run as an
 * ordinary unit test with no Firestore and no filesystem coupling in the assertions.
 */

/** One `*.model.ts` file, as read from `libs/shared/models/src/lib`. */
export interface ModelSourceFile {
  /** Basename, e.g. `person.model.ts`. Used only for reporting. */
  file: string;
  source: string;
}

export interface ScopedCollection {
  /** The Firestore collection name, e.g. `persons`. */
  collection: string;
  /** The exported constant, e.g. `PersonCollection`. */
  constName: string;
  file: string;
  /** How the collection was matched to a model carrying `tenants`. */
  via: 'name-match' | 'sole-model-in-file';
}

export interface UnscopedCollection {
  collection: string;
  constName: string;
  file: string;
  reason: string;
}

export interface CollectionScan {
  /** Collections whose model demonstrably carries `tenants[]`. The migration scope. */
  scoped: ScopedCollection[];
  /** Collections whose model demonstrably does NOT carry `tenants[]`. Excluded. */
  unscoped: UnscopedCollection[];
  /**
   * Collections the derivation refused to classify — several models in one file, none
   * name-matching the constant. NEVER silently treated as either; the caller must stop.
   */
  ambiguous: { collection: string; constName: string; file: string; reason: string }[];
  /**
   * Declarations that carry `tenants` but live in a file with no `*Collection` constant.
   * Usually legitimate (embedded value objects, the `PersistedModel` base interface), but
   * a genuinely persisted model missing its constant would hide a whole collection from
   * the migration — so it is surfaced, not swallowed.
   */
  tenantModelsWithoutCollection: { model: string; file: string }[];
}

/** `export const XCollection = 'y';` — the constant name may contain digits (`I18nDefault`). */
const COLLECTION_RE = /export\s+const\s+([A-Za-z0-9_]*Collection)\s*(?::[^=]+)?=\s*['"]([^'"]+)['"]/g;

/**
 * `export class X ...` / `export interface X ...` — the start of a declaration.
 * Leading whitespace is tolerated: TypeScript forbids a nested `export class`, so nothing
 * but formatting can be indented here, and refusing indented declarations would silently
 * classify a merely reformatted model file as "carries no tenants" — a whole collection
 * dropped from the migration for a cosmetic reason.
 */
const DECL_RE = /^[ \t]*export\s+(?:abstract\s+)?(class|interface)\s+([A-Za-z0-9_]+)/gm;

/**
 * A `tenants` MEMBER declaration, not the word "tenants" in prose, an import, or a
 * constructor assignment.
 *
 * Both the annotated and the INFERRED form must match — the majority of the live models
 * write `public tenants = DEFAULT_TENANTS;` with no type annotation
 * (`person.model.ts`, `transfer.model.ts`, `org.model.ts`, …). An earlier version required
 * the `:` and silently classified sixteen tenant-scoped collections — `persons`, `orgs`,
 * `transfers`, `users`, `pages`, `resources` among them — as unscoped, which would have
 * made the migration skip them without a word. Hence the `[:=]`.
 *
 * The leading anchor is what keeps `this.tenants = [tenantId]` inside a constructor from
 * counting: `this.` sits between the indentation and the identifier.
 */
const TENANTS_MEMBER_RE =
  /^[ \t]*(?:public\s+|private\s+|protected\s+|readonly\s+|declare\s+|override\s+)*tenants\??\s*[:=]/m;

interface Decl {
  kind: 'class' | 'interface';
  name: string;
  body: string;
  hasTenants: boolean;
}

/** Split a source file into its top-level exported declarations. */
function declarations(source: string): Decl[] {
  const starts: { name: string; kind: 'class' | 'interface'; at: number }[] = [];
  DECL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DECL_RE.exec(source)) !== null) {
    starts.push({ kind: m[1] as 'class' | 'interface', name: m[2], at: m.index });
  }
  return starts.map((s, i) => {
    const body = source.slice(s.at, starts[i + 1]?.at ?? source.length);
    return { kind: s.kind, name: s.name, body, hasTenants: TENANTS_MEMBER_RE.test(body) };
  });
}

/**
 * Associate every `*Collection` constant with the model that backs it, and classify.
 *
 * Association ladder — each rung exists for a live case in `libs/shared/models`:
 *
 *  0. NO declaration in the file carries `tenants` ⇒ every collection in that file is
 *     unscoped. Covers `esign.model.ts` (two constants, all-interface, no `tenants`),
 *     `feature-rollout.model.ts`, `swisscities.model.ts` and `app-config.model.ts`.
 *  1. NAME MATCH: `XCollection` ⇒ the declaration named `XModel` (else `X`). Resolves the
 *     two-collection file `pdf-template.model.ts` correctly and independently
 *     (`TemplateCollection`→`TemplateModel`, `DocGenerationCollection`→`DocGenerationModel`),
 *     which no file-level heuristic could.
 *  2. SOLE MODEL IN FILE: exactly one constant in the file and exactly one declaration
 *     carrying `tenants` ⇒ they belong together. Covers `CategoryCollection` ⇒
 *     `CategoryListModel`, where the names deliberately differ.
 *  3. Anything else ⇒ AMBIGUOUS. Reported; never assumed.
 */
export function scanCollections(files: ModelSourceFile[]): CollectionScan {
  const scan: CollectionScan = {
    scoped: [], unscoped: [], ambiguous: [], tenantModelsWithoutCollection: [],
  };

  for (const { file, source } of files) {
    const consts: { constName: string; collection: string }[] = [];
    COLLECTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COLLECTION_RE.exec(source)) !== null) {
      consts.push({ constName: m[1], collection: m[2] });
    }

    const decls = declarations(source);
    const withTenants = decls.filter(d => d.hasTenants);

    if (consts.length === 0) {
      withTenants.forEach(d => scan.tenantModelsWithoutCollection.push({ model: d.name, file }));
      continue;
    }

    if (withTenants.length === 0) {
      consts.forEach(c => scan.unscoped.push({
        ...c, file, reason: 'no declaration in this file carries a `tenants` member',
      }));
      continue;
    }

    for (const c of consts) {
      const prefix = c.constName.replace(/Collection$/, '');
      const named = decls.find(d => d.name === `${prefix}Model`) ?? decls.find(d => d.name === prefix);
      if (named) {
        if (named.hasTenants) scan.scoped.push({ ...c, file, via: 'name-match' });
        else scan.unscoped.push({ ...c, file, reason: `${named.name} declares no \`tenants\` member` });
        continue;
      }
      if (consts.length === 1 && withTenants.length === 1) {
        scan.scoped.push({ ...c, file, via: 'sole-model-in-file' });
        continue;
      }
      scan.ambiguous.push({
        ...c, file,
        reason: `no declaration named ${prefix}Model/${prefix}, and the file has ` +
                `${consts.length} collection constant(s) and ${withTenants.length} model(s) ` +
                'carrying `tenants` — cannot decide which backs this collection',
      });
    }
  }

  const bySortKey = (a: { collection: string }, b: { collection: string }) =>
    a.collection.localeCompare(b.collection);
  scan.scoped.sort(bySortKey);
  scan.unscoped.sort(bySortKey);
  scan.ambiguous.sort(bySortKey);
  return scan;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// DRIFT GUARD
// ─────────────────────────────────────────────────────────────────────────────────────

/** Where an unknown tenant id was observed, and how often. */
export interface TenantIdOccurrence {
  tenantId: string;
  /** collection → number of documents carrying this id. Sorted, largest first. */
  byCollection: { collection: string; docs: number }[];
  totalDocs: number;
}

export interface TenantVocabularyDrift {
  /** Ids present in some `tenants[]` with no matching `app-config` document id. */
  unknown: TenantIdOccurrence[];
  /** `app-config` ids that no document anywhere claims. Not an error — a new tenant. */
  configsWithoutContent: string[];
  ok: boolean;
}

/**
 * THE GUARD: every id occurring in any `tenants[]` must exist as an `app-config` doc id.
 *
 * This is deliberately a PURE function over an already-collected census, for one reason:
 * the invariant it states is about live Firestore, which no unit test can read, so the
 * only testable part is the judgement. `scripts/normalize-tenant-ids.mjs` collects the
 * census and exits non-zero when `ok` is false — that is the part that runs against real
 * data; the spec next to this file proves the judgement itself goes red on an unknown id
 * rather than merely being asserted to.
 *
 * `allowlist` exists for ids that are deliberately not tenants — `default` is a seed
 * marker on `tags`, documented in `AppStore.getTags`. It must be passed explicitly by the
 * caller so that "we decided this one is fine" is always a visible decision and never a
 * silent hole in the guard.
 */
export function findTenantVocabularyDrift(
  configIds: readonly string[],
  census: Record<string, Record<string, number>>,
  allowlist: readonly string[] = [],
): TenantVocabularyDrift {
  const known = new Set(configIds);
  const allowed = new Set(allowlist);

  const occurrences = new Map<string, { collection: string; docs: number }[]>();
  const seen = new Set<string>();
  for (const [collection, ids] of Object.entries(census)) {
    for (const [tenantId, docs] of Object.entries(ids)) {
      if (docs <= 0) continue;
      seen.add(tenantId);
      if (known.has(tenantId) || allowed.has(tenantId)) continue;
      const list = occurrences.get(tenantId) ?? [];
      list.push({ collection, docs });
      occurrences.set(tenantId, list);
    }
  }

  const unknown: TenantIdOccurrence[] = [...occurrences.entries()]
    .map(([tenantId, byCollection]) => ({
      tenantId,
      byCollection: byCollection.sort((a, b) => b.docs - a.docs || a.collection.localeCompare(b.collection)),
      totalDocs: byCollection.reduce((n, c) => n + c.docs, 0),
    }))
    .sort((a, b) => b.totalDocs - a.totalDocs || a.tenantId.localeCompare(b.tenantId));

  return {
    unknown,
    configsWithoutContent: configIds.filter(id => !seen.has(id)).sort(),
    ok: unknown.length === 0,
  };
}

/** Human-readable failure text. Kept here so the script and any test report identically. */
export function formatDrift(drift: TenantVocabularyDrift): string {
  if (drift.ok) return 'tenant vocabulary is consistent: every tenants[] id has an app-config document.';
  const lines = [
    `TENANT VOCABULARY DRIFT — ${drift.unknown.length} id(s) appear in tenants[] with no app-config document:`,
  ];
  for (const u of drift.unknown) {
    const where = u.byCollection.map(c => `${c.collection}:${c.docs}`).join(', ');
    lines.push(`  "${u.tenantId}" — ${u.totalDocs} doc(s) across ${u.byCollection.length} collection(s): ${where}`);
  }
  lines.push(
    'Either create the missing app-config document, or remove the id from tenants[] ' +
    '(scripts/normalize-tenant-ids.mjs). Do NOT add the id to the guard\'s allowlist to ' +
    'silence this — the allowlist is for markers that are not tenants at all.',
  );
  return lines.join('\n');
}
