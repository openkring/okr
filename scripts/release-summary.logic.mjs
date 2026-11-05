// Pure logic of the post-release test summary (scripts/release-summary.mjs). No I/O, so it is unit tested.

const SPEC = /(?:^|[\s(])([1-3]\.\d{1,3})(?=[\s),:;.—–]|$)/;
const SUBJECT = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$/;
const NOISE_SCOPES = new Set(['submodules', 'planning', 'skills', 'apps']);
const ROLLOUT_LINE = /functions? deploy|needs? a deploy|not deployed|backfill|migrat|release order|picker save|after (a|the) release/i;
const ROLLOUT_ITEM = /release|deploy|seed|picker|browser|test|manual|menuItems/i;
const BROAD_FROM = 15;
const STEP_SCRIPT = /^scripts\/((?:migrate|backfill|seed|repair)-[^/]+)\.(?:mjs|ts)$/;

const parts = (version) => version.split('.').map(Number);
const compare = (a, b) => parts(a).reduce((d, n, i) => d || n - parts(b)[i], 0);

/** The highest release tag below `version`, or null. Tags that are not vX.Y.Z are ignored. */
export function previousTag(tags, version) {
  const older = tags.filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).map((t) => t.slice(1)).filter((v) => compare(v, version) < 0);
  return older.length ? `v${older.sort(compare).at(-1)}` : null;
}

/** Splits `git log --format=%h%x1f%s%x1f%b%x1e` output into commits. */
export function parseCommits(log) {
  return log.split('\x1e').map((r) => r.trim()).filter(Boolean).map((record) => {
    const [hash, subject, body = ''] = record.split('\x1f');
    const [, type = '', scope = '', text = subject] = subject.match(SUBJECT) ?? [];
    return { hash, subject, body, type, scope, text, spec: subject.match(SPEC)?.[1] ?? '' };
  });
}

/** Commits a tester never needs: pointer bumps, planning notes, the release commit, internal refactors. */
export const isNoise = (c) => c.subject.startsWith('release:')
  || (c.type === 'chore' && (NOISE_SCOPES.has(c.scope) || !c.scope))
  || ['docs', 'test', 'style'].includes(c.type);

/** Commits per topic, biggest first: the spec number when the subject names one, else the scope. */
export function groupCommits(commits) {
  const groups = new Map();
  for (const c of commits) {
    const key = c.spec || c.scope || 'other';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups].map(([key, list]) => ({ key, commits: list })).sort((a, b) => b.commits.length - a.commits.length);
}

/** Body lines that announce work left after the release ("needs a functions deploy", "Release order: ..."). */
export const rolloutHints = (commits) => commits.flatMap((c) => c.body.split('\n')
  .map((line) => line.trim()).filter((line) => ROLLOUT_LINE.test(line)).map((line) => ({ hash: c.hash, line })));

/** Migration, backfill, seed and repair scripts the release added or changed; none of them runs by itself. */
export const stepScripts = (files) => [...new Set(files.map((f) => f.match(STEP_SCRIPT)?.[0]).filter(Boolean))]
  .filter((f) => !/\.(logic|test)\./.test(f)).sort();

/** Functions defined in a TypeScript source. Re-exports do not count: a barrel defines nothing. */
export const definedNames = (source) => [...source.matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map((m) => m[1]);

/** Relative value imports of a TypeScript source, as written. `import type` leaves the bundle. */
export const localImports = (source) => [...source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gm)].map((m) => m[1]);

/** Everything `entry` reaches through `graph` (file → imported files), itself included. */
export function reachable(entry, graph) {
  const seen = new Set([entry]);
  for (const file of seen) for (const next of graph[file] ?? []) seen.add(next);
  return seen;
}

/**
 * Deployed functions older than the last change to their file or anything it imports. `changed`
 * maps a file to its last author date: a rebase rewrites commit dates, which would flag a function
 * deployed from its branch before the merge. A file that `broadFrom` or more functions carry is
 * broad: it says little about any one of them, so `broad` is set only when nothing narrower hit.
 */
export function staleFunctions(functions, changed, deployed, broadFrom = BROAD_FROM) {
  const fanIn = (file) => functions.filter((f) => f.files.includes(file)).length;
  const newestFirst = (x, y) => new Date(changed[y]) - new Date(changed[x]);
  return functions.flatMap(({ name, files }) => {
    const hits = files.filter((f) => changed[f] && deployed[name] && new Date(deployed[name]) < new Date(changed[f])).sort(newestFirst);
    if (!hits.length) return [];
    const cause = hits.find((f) => fanIn(f) < broadFrom);
    return [{ name, deployedAt: deployed[name], cause: cause ?? hits[0], lastCommit: changed[cause ?? hits[0]], broad: !cause }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Open rollout and test items of the given specs from PENDING_IMPLEMENTATION.md. */
export function tocItems(markdown, specs) {
  const items = [];
  let spec = '';
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^#{2,3} (?:(\d+\.\d+) )?/);
    if (heading) spec = heading[1] ?? '';
    else if (specs.includes(spec) && /^- (🚀|🔴)/.test(line) && !/Excluded|Out of/.test(line) && ROLLOUT_ITEM.test(line)) items.push({ spec, line: line.slice(2) });
  }
  return items;
}

const section = (title, lines, empty) => [`## ${title}`, '', ...(lines.length ? lines : [empty]), ''];

/** The report: raw material for the checklist, which the `release` skill turns into the final list. */
export function renderReport({ version, from, commits, deployed, stale, hints, scripts, toc, sharedChanged }) {
  const useful = commits.filter((c) => !isNoise(c));
  const narrow = stale.filter((s) => !s.broad);
  const broad = Object.entries(Object.groupBy(stale.filter((s) => s.broad), (s) => s.cause));
  const staleLines = deployed
    ? [...narrow.map((s) => `- [ ] \`${s.name}\`: deployed ${s.deployedAt.slice(0, 16)}, \`${s.cause}\` changed ${s.lastCommit.slice(0, 16)}`),
      ...broad.map(([cause, list]) => `- Also ${list.length} more functions that only share \`${cause}\`: check whether the change matters to them.`)]
    : ['- [ ] **Not checked:** the deployed functions could not be read. Compare them by hand.'];
  if (deployed && sharedChanged.length) staleLines.push(`- Shared code changed too (${sharedChanged.join(', ')}): any function may need a deploy, not only those listed.`);
  return [
    `# v${version} test summary (facts)`, '',
    `${from}..v${version}: ${commits.length} commits, ${useful.length} relevant. Stale functions are candidates; steps below are not known to be done.`, '',
    ...section('Possibly stale Cloud Functions', staleLines, 'None found.'),
    ...section('Scripts that do not run by themselves', scripts.map((s) => `- [ ] \`${s}\``), 'None changed.'),
    ...section('Rollout notes in commit messages', hints.map((h) => `- ${h.hash}: ${h.line}`), 'None.'),
    ...section('Open items in the planning TOC', toc.map((t) => `- ${t.spec}: ${t.line}`), 'None, or planning is not available.'),
    ...section('Changes by topic', groupCommits(useful).flatMap((g) => [`### ${g.key} (${g.commits.length})`, '',
      ...g.commits.map((c) => `- ${c.hash} ${c.subject}`), '']), 'None.'),
  ].join('\n');
}
