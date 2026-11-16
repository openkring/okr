/**
 * One-time migration (2026-11-16), follow-up to migrate-vcard-linkedin-notes.mjs: the remaining
 * vCard properties that the vCard import (15.11.2026) parked in persons.notes.
 *  NICKNAME        → persons.nickname     (when empty or the vCard value extends it; else reported, line kept)
 *  X-MAIDENNAME    → persons.maidenName   (same rule)
 *  twitter/xing/facebook X-SOCIALPROFILE → address (channel twitter|xing|facebook, url = handle)
 *  Skype (X-SOCIALPROFILE;TYPE=Skype, IMPP …Skype) → address (channel skype, url = Skype id)
 *  BDAY            → dob address when the person has none (1604 = Apple «no year» → 0000MMDD);
 *                    equal → line dropped; different → reported, line kept
 *  IBAN in a stray line → bankaccount address
 *  LinkedIn leftovers and every other vCard property line → dropped
 *  Stray text lines (no PROPERTY: prefix) → kept
 * A vCard-Import block left empty loses its header. Person index is rebuilt (mirror of getPersonIndex).
 *
 * Run:  node scripts/migrate-vcard-notes-rest.mjs          (dry run, default)
 *       node scripts/migrate-vcard-notes-rest.mjs --write
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
const WRITE = process.argv.includes('--write');

const HEADER = /^--- vCard-Import .* ---$/;
const PROP = /^([A-Z][A-Z0-9-]*)([;:])/;
const IBAN = /^\s*([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?)\s*$/;

const valueOf = l => l.slice(l.indexOf(': ') >= 0 ? l.indexOf(': ') + 2 : l.indexOf(':') + 1).trim();
const typeOf = l => (l.match(/TYPE=([^;:]+)/i) || [])[1]?.toLowerCase() ?? '';
const clean = s => s.replace(/[?#].*$/, '').replace(/\/+$/, '');

/** returns {channel, value} | null for a social line we convert */
function social(line, prop) {
  const v = valueOf(line), t = typeOf(line);
  if (prop === 'IMPP' && /X-SERVICE-TYPE=Skype/i.test(line)) return { channel: 'skype', value: v.replace(/^skype:/i, '') };
  if (prop !== 'X-SOCIALPROFILE') return null;
  let m;
  if (t === 'skype') return { channel: 'skype', value: v.replace(/^x-apple:/i, '') };
  if (t === 'twitter' && (m = clean(v).match(/twitter\.com\/(?:#!\/)?([^/]+)$/i))) return { channel: 'twitter', value: m[1] };
  if (t.startsWith('xing')) {
    if (/^x-apple:/i.test(v)) return { channel: 'xing', value: v.slice(8) };
    if ((m = clean(v).replace(/\/cv$/, '').match(/xing\.com\/profiles?\/([^/]+)$/i))) return { channel: 'xing', value: m[1] };
  }
  if (t.startsWith('facebook') && (m = clean(v).match(/facebook\.com\/([^/]+)$/i))) return { channel: 'facebook', value: m[1] };
  return null;
}

function bdayToStoreDate(v) {
  const m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!m) return null;
  return (m[1] === '1604' ? '0000' : m[1]) + m[2] + m[3];
}

function personIndex(p) {
  const parts = [['n', p.lastName], ['z', p.favZipCode], ['fn', p.firstName], ['bx', p.bexioId], ['nn', p.nickname], ['mn', p.maidenName]];
  return parts.filter(([, v]) => typeof v === 'string' ? v.length && v !== ' ' : v !== undefined && v !== null)
    .map(([k, v]) => `${k}:${v}`).join(' ');
}

function dropEmptyHeaders(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADER.test(lines[i].trim())) {
      let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length || HEADER.test(lines[j].trim())) continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function newAddress(tenantId, parentKey, ownerName, channel, fields, isFavorite, indexValue) {
  return {
    addressChannel: channel, addressChannelLabel: '', addressUsage: 'home', addressUsageLabel: '',
    email: '', phone: '', iban: '', ssn: '', dob: '', dod: '',
    streetName: '', streetNumber: '', addressValue2: '', zipCode: '', city: '', countryCode: '', url: '',
    isFavorite, isCc: false, isValidated: false, isArchived: false, tags: '', notes: '',
    tenants: [tenantId], parentKey, index: `n:${indexValue} p:${parentKey} o:${ownerName}`, ...fields,
  };
}

const persons = await db.collection('persons').get();
const st = { persons: 0, nickname: 0, maidenName: 0, twitter: 0, xing: 0, facebook: 0, skype: 0, dobCreated: 0, dobEqual: 0, iban: 0, dropped: {}, keptStray: 0, dupSkipped: 0 };
const report = { nicknameConflicts: [], maidenConflicts: [], bdayConflicts: [], unparsedSocial: [], unparsedBday: [] };
let batch = db.batch(), pending = 0;
const flush = async () => { if (WRITE && pending) await batch.commit(); batch = db.batch(); pending = 0; };

for (const doc of persons.docs) {
  const p = doc.data();
  if (typeof p.notes !== 'string' || !p.notes.includes('--- vCard-Import')) continue;
  const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  const lines = p.notes.split(/\r?\n/);
  const keep = []; const patch = {}; const want = []; // want: {channel, fields, indexValue}
  let inBlock = false, bday = null, bdayLine = null;
  for (const l of lines) {
    if (HEADER.test(l.trim())) { inBlock = true; keep.push(l); continue; }
    const m = l.match(PROP);
    if (!inBlock || !m) {
      if (inBlock && l.trim()) {
        const ib = l.match(IBAN);
        if (ib) { want.push({ channel: 'bankaccount', fields: { iban: ib[1].replace(/\s/g, '') }, indexValue: ib[1].replace(/\s/g, '') }); continue; }
        st.keptStray++;
      }
      keep.push(l); continue;
    }
    const prop = m[1];
    if (prop === 'NICKNAME' || prop === 'X-MAIDENNAME') {
      const field = prop === 'NICKNAME' ? 'nickname' : 'maidenName';
      const v = valueOf(l); const cur = (patch[field] ?? p[field] ?? '').trim();
      if (!cur || (v !== cur && v.toLowerCase().includes(cur.toLowerCase()))) { patch[field] = v; st[field]++; }
      else if (cur !== v) { report[field === 'nickname' ? 'nicknameConflicts' : 'maidenConflicts'].push({ okey: doc.id, name, existing: cur, vcard: v }); keep.push(l); }
      continue;
    }
    if (prop === 'BDAY') {
      const d = bdayToStoreDate(valueOf(l));
      if (!d) { report.unparsedBday.push({ okey: doc.id, name, line: l }); keep.push(l); continue; }
      bday = d; bdayLine = l; continue;
    }
    const s = social(l, prop);
    if (s) { want.push({ channel: s.channel, fields: { url: s.value }, indexValue: s.value }); continue; }
    if (prop === 'X-SOCIALPROFILE' && /twitter|xing|facebook|skype/i.test(typeOf(l))) report.unparsedSocial.push({ okey: doc.id, name, line: l });
    const key = prop === 'X-SOCIALPROFILE' ? `${prop}/${typeOf(l) || '?'}` : prop;
    st.dropped[key] = (st.dropped[key] ?? 0) + 1;
  }

  const parentKey = `person.${doc.id}`;
  const tenantId = (p.tenants ?? []).includes('bka') ? 'bka' : p.tenants?.[0];
  const needAddr = want.length || bday;
  const existing = needAddr ? (await db.collection('addresses').where('parentKey', '==', parentKey).get()).docs.map(d => d.data()).filter(a => !a.isArchived) : [];

  if (bday) {
    const dob = existing.find(a => a.addressChannel === 'dob');
    if (!dob) want.push({ channel: 'dob', fields: { dob: bday }, indexValue: '' });
    else {
      const e = String(dob.dob ?? '');
      const same = e === bday || (bday.startsWith('0000') && e.slice(4) === bday.slice(4));
      if (same) st.dobEqual++;
      else { report.bdayConflicts.push({ okey: doc.id, name, existingDob: e, vcardBday: bday }); keep.push(bdayLine); }
    }
  }

  const seen = new Set();
  for (const w of want) {
    const val = w.fields.url ?? w.fields.iban ?? w.fields.dob;
    const k = `${w.channel}|${val.toLowerCase()}`;
    const dup = seen.has(k) || existing.some(a => a.addressChannel === w.channel && String(a.url || a.iban || a.dob || '').toLowerCase() === val.toLowerCase());
    if (dup) { st.dupSkipped++; continue; }
    seen.add(k);
    const fav = w.channel !== 'dob' && !existing.some(a => a.addressChannel === w.channel) && ![...seen].some(x => x !== k && x.startsWith(w.channel + '|'));
    st[w.channel === 'dob' ? 'dobCreated' : w.channel === 'bankaccount' ? 'iban' : w.channel]++;
    console.log(`${WRITE ? '' : '[dry] '}${name} (${doc.id}) + ${w.channel} ${w.channel === 'bankaccount' ? '(iban)' : val}`);
    batch.set(db.collection('addresses').doc(), newAddress(tenantId, parentKey, name, w.channel, w.fields, fav, w.indexValue)); pending++;
  }

  const notes = dropEmptyHeaders(keep);
  if (notes === p.notes && !Object.keys(patch).length) continue;
  st.persons++;
  const upd = { notes, ...patch };
  if (patch.nickname !== undefined || patch.maidenName !== undefined) upd.index = personIndex({ ...p, ...patch });
  batch.update(doc.ref, upd); pending++;
  if (pending >= 400) await flush();
}
await flush();
console.log(JSON.stringify({ mode: WRITE ? 'WRITE' : 'DRY', ...st, ...report }, null, 1));
