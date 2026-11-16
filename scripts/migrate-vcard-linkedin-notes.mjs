/**
 * One-time migration (2026-11-16): LinkedIn X-SOCIALPROFILE lines that the vCard import
 * (15.11.2026) parked in persons.notes.
 *  - linkedin.com/in/<handle>       → new address (addressChannel 'linkedin', url = handle), line removed
 *  - linkedin.com/profile/view?id=N → line removed, no address (legacy numeric ids; decided by user)
 *  - anything else (pub/, linkd.in, /e/v2, …) → left in notes and reported
 * A vCard-Import block left empty after removal loses its header line too.
 * Idempotent: skips a handle the person already has as a linkedin address.
 *
 * Run:  node scripts/migrate-vcard-linkedin-notes.mjs          (dry run, default)
 *       node scripts/migrate-vcard-linkedin-notes.mjs --write
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const WRITE = process.argv.includes('--write');

const LINKEDIN_LINE = /^X-SOCIALPROFILE[^:]*TYPE=(linkedin|[a-z.]*linkedin\.com|linkd\.in)/i;
const HEADER = /^--- vCard-Import .* ---$/;

function classify(line) {
  const url = line.slice(line.indexOf(': ') + 2).trim();
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (m) { try { return { kind: 'handle', handle: decodeURIComponent(m[1]) }; } catch { return { kind: 'handle', handle: m[1] }; } }
  if (/linkedin\.com\/profile\/view\?id=/i.test(url)) return { kind: 'legacy' };
  return { kind: 'other', url };
}

function cleanNotes(lines, drop) {
  const kept = lines.filter((_, i) => !drop.has(i));
  // drop vCard headers whose block is now empty (next non-blank line is another header or EOF)
  const out = [];
  for (let i = 0; i < kept.length; i++) {
    if (HEADER.test(kept[i].trim())) {
      let j = i + 1; while (j < kept.length && !kept[j].trim()) j++;
      if (j >= kept.length || HEADER.test(kept[j].trim())) { continue; }
    }
    out.push(kept[i]);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const persons = await db.collection('persons').get();
const stats = { persons: 0, addresses: 0, legacyRemoved: 0, skippedExisting: 0 };
const others = [];
let batch = db.batch(), pending = 0;
const flush = async () => { if (WRITE && pending) { await batch.commit(); } batch = db.batch(); pending = 0; };

for (const doc of persons.docs) {
  const p = doc.data();
  if (typeof p.notes !== 'string' || !/X-SOCIALPROFILE/i.test(p.notes)) continue;
  const lines = p.notes.split(/\r?\n/);
  const drop = new Set(); const handles = new Set();
  lines.forEach((l, i) => {
    if (!LINKEDIN_LINE.test(l)) return;
    const c = classify(l);
    if (c.kind === 'handle') { handles.add(c.handle); drop.add(i); }
    else if (c.kind === 'legacy') { stats.legacyRemoved++; drop.add(i); }
    else others.push({ okey: doc.id, name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), url: c.url });
  });
  if (!drop.size) continue;
  stats.persons++;

  const tenantId = (p.tenants ?? []).includes('bka') ? 'bka' : p.tenants?.[0];
  const parentKey = `person.${doc.id}`;
  const ownerName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  const existing = handles.size
    ? (await db.collection('addresses').where('parentKey', '==', parentKey).where('addressChannel', '==', 'linkedin').get()).docs.map(d => d.data().url)
    : [];
  let first = existing.length === 0;
  for (const handle of handles) {
    if (existing.includes(handle)) { stats.skippedExisting++; continue; }
    const address = {
      addressChannel: 'linkedin', addressChannelLabel: '', addressUsage: 'home', addressUsageLabel: '',
      email: '', phone: '', iban: '', ssn: '', dob: '', dod: '',
      streetName: '', streetNumber: '', addressValue2: '', zipCode: '', city: '', countryCode: '',
      url: handle, isFavorite: first, isCc: false, isValidated: false, isArchived: false,
      tags: '', notes: '', tenants: [tenantId], parentKey,
      index: `n:${handle} p:${parentKey} o:${ownerName}`,
    };
    first = false;
    console.log(`${WRITE ? '' : '[dry] '}${ownerName} (${doc.id}) + linkedin ${handle}`);
    batch.set(db.collection('addresses').doc(), address); pending++; stats.addresses++;
  }
  batch.update(doc.ref, { notes: cleanNotes(lines, drop) }); pending++;
  if (pending >= 400) await flush();
}
await flush();
console.log(JSON.stringify({ mode: WRITE ? 'WRITE' : 'DRY', ...stats, othersLeftInNotes: others }, null, 1));
