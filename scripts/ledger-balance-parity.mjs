#!/usr/bin/env node
// scripts/ledger-balance-parity.mjs — read-only parity check of the ledger balances (spec 1.177 §10, gate for step 2b).
//
// For each set of books it reads the stored `ledger-balances` documents and the whole ledger (the clients' scope:
// tenants of the books' config, accountingTenantId, not archived) and compares, without sharing any code with the
// function that wrote the documents:
//   - Bilanz (all posted lines up to the fiscal-year end) and ER (within the fiscal year), per account, every year;
//   - bookings per calendar month (every status) and the booking / line totals;
// Prints the differences and exits 1 when there is one. Writes nothing.
//
//   node scripts/ledger-balance-parity.mjs scs gss
//
// Uses the caller's ADC (gcloud auth application-default login), project bkaiser-org.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'bkaiser-org';
const books = process.argv.slice(2).filter(a => !a.startsWith('-'));
if (books.length === 0) {
  console.error('usage: node scripts/ledger-balance-parity.mjs <accountingTenantId>…');
  process.exit(2);
}

initializeApp({ projectId: PROJECT });
const db = getFirestore();

const pad2 = n => String(n).padStart(2, '0');
function fiscalRange(year, start) {
  if (start === 1) return { from: `${year}0101`, to: `${year}1231` };
  const endYear = year + 1;
  const endMonth = start - 1;
  const last = new Date(endYear, endMonth, 0).getDate();
  return { from: `${year}${pad2(start)}01`, to: `${endYear}${pad2(endMonth)}${pad2(last)}` };
}
const add = (map, key, d, k) => { const e = map.get(key) ?? { d: 0, k: 0 }; e.d += d; e.k += k; map.set(key, e); };

let failures = 0;
for (const id of books) {
  const config = (await db.collection('accounting-configs').doc(id).get()).data();
  if (!config) { console.error(`${id}: no accounting-config`); failures++; continue; }
  const tenants = config.tenants ?? [];
  const start = Number(config.fiscalYearStart ?? 1) || 1;
  const scoped = c => db.collection(c).where('tenants', 'array-contains-any', tenants).where('accountingTenantId', '==', id).where('isArchived', '==', false);

  const [docSnap, bookingSnap, lineSnap] = await Promise.all([
    db.collection('ledger-balances').where('tenants', 'array-contains-any', tenants).where('accountingTenantId', '==', id).get(),
    scoped('bookings').select('date', 'status').get(),
    scoped('booking-lines').select('bookingKey', 'accountKey', 'debitAmount', 'creditAmount').get(),
  ]);
  const docs = docSnap.docs.map(d => d.data());
  if (docs.length === 0) { console.error(`${id}: no ledger-balances documents`); failures++; continue; }

  const bookings = new Map(bookingSnap.docs.map(d => [d.id, { date: d.data().date ?? '', posted: d.data().status === 'posted' }]));
  const lines = lineSnap.docs.map(d => d.data());
  const diffs = [];

  // totals
  const storedBookings = docs.reduce((s, d) => s + (d.bookingCount ?? 0), 0);
  const storedLines = docs.reduce((s, d) => s + (d.lineCount ?? 0), 0);
  if (storedBookings !== bookings.size) diffs.push(`bookings: stored ${storedBookings}, ledger ${bookings.size}`);
  if (storedLines !== lines.length) diffs.push(`lines: stored ${storedLines}, ledger ${lines.length}`);

  // bookings per month
  const monthCounts = new Map();
  for (const b of bookings.values()) if (/^\d{8}$/.test(b.date)) monthCounts.set(b.date.slice(0, 6), (monthCounts.get(b.date.slice(0, 6)) ?? 0) + 1);
  for (const d of docs) {
    if (!d.year) continue;
    (d.bookingCounts ?? []).forEach((n, i) => {
      const ym = `${d.year}${pad2(i + 1)}`;
      if ((monthCounts.get(ym) ?? 0) !== n) diffs.push(`bookings ${ym}: stored ${n}, ledger ${monthCounts.get(ym) ?? 0}`);
    });
  }

  // Bilanz and ER per fiscal year: direct from lines vs from cells
  const years = [...new Set([...bookings.values()].filter(b => /^\d{8}$/.test(b.date)).map(b => {
    const y = Number(b.date.slice(0, 4)); const m = Number(b.date.slice(4, 6));
    return start > 1 && m < start ? y - 1 : y;
  }))].sort();
  for (const year of years) {
    const { from, to } = fiscalRange(year, start);
    for (const [label, lo] of [['Bilanz', ''], ['ER', from]]) {
      const direct = new Map();
      for (const l of lines) {
        const b = bookings.get(l.bookingKey);
        if (!b?.posted || !l.accountKey) continue;
        if ((lo && b.date < lo) || b.date > to) continue;
        add(direct, l.accountKey, l.debitAmount?.amount ?? 0, l.creditAmount?.amount ?? 0);
      }
      const viaCells = new Map();
      const loYm = lo ? Number(lo.slice(0, 6)) : -Infinity;
      const hiYm = Number(to.slice(0, 6));
      for (const d of docs) {
        for (const c of d.cells ?? []) {
          const ok = d.year === 0 ? !lo : (d.year * 100 + c.m >= loYm && d.year * 100 + c.m <= hiYm);
          if (ok) add(viaCells, c.a, c.d, c.k);
        }
      }
      for (const a of new Set([...direct.keys(), ...viaCells.keys()])) {
        const x = direct.get(a) ?? { d: 0, k: 0 }; const y = viaCells.get(a) ?? { d: 0, k: 0 };
        if (x.d !== y.d || x.k !== y.k) diffs.push(`${label} ${year} ${a}: ledger ${x.d}/${x.k}, cells ${y.d}/${y.k}`);
      }
    }
  }

  const computedAt = docs.map(d => d.computedAt).sort().at(-1);
  console.log(`${id}: ${docs.length} documents (newest ${computedAt}), ${bookings.size} bookings, ${lines.length} lines, fiscal years ${years[0]}–${years.at(-1)}: ${diffs.length ? `${diffs.length} DIFFERENCES` : 'no difference'}`);
  for (const d of diffs.slice(0, 50)) console.log(`  ${d}`);
  if (diffs.length) failures++;
}
process.exit(failures ? 1 : 0);
