// Mapping of the WordPress «Stachethemes Event Calendar» events to calevents (spec 1.165 §8.4).
// Run: node --test scripts/la21staefa/stec-mapping.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mapStecEvent, occurrenceDates, parseRrule } from './stec-mapping.mjs';

const MAP = { groups: { 41: 'reparatur', 40: 'qatira', 43: 'kiss' }, locations: { 46: 'Alte Krone, Goethestrasse 14, 8712 Stäfa', 59: 'Kirchbühl, 8712 Stäfa' } };
const stec = (over = {}, meta = {}) => ({
  id: 1, title: { rendered: 'Reparatur Café' }, content: { rendered: '<p>Wir reparieren &amp; plaudern.</p>' },
  stec_cat: [41], stec_loc: [46], featured_media: 0,
  meta: { start_date: '2026-12-05T10:00', end_date: '2026-12-05T13:30', all_day: 'False', rrule: '', exdate: [], external_link: [], event_status: 'EventScheduled', ...meta },
  ...over,
});

test('parseRrule reads weekly with until and yearly', () => {
  assert.deepEqual(parseRrule('FREQ=WEEKLY;UNTIL=20271211;BYDAY=SA;'), { periodicity: 'weekly', until: '20271211' });
  assert.deepEqual(parseRrule('FREQ=YEARLY'), { periodicity: 'yearly', until: '' });
  assert.deepEqual(parseRrule(''), { periodicity: 'once', until: '' });
  assert.deepEqual(parseRrule('FREQ=MONTHLY;BYDAY=1SA'), { periodicity: null, until: '' });
});

test('a single event: dates, times, duration, group, location, plain description', () => {
  const { model, warnings } = mapStecEvent(stec(), MAP);
  assert.equal(model.name, 'Reparatur Café');
  assert.equal(model.description, 'Wir reparieren & plaudern.');
  assert.equal(model.startDate, '20261205');
  assert.equal(model.startTime, '10:00');
  assert.equal(model.durationMinutes, 210);
  assert.equal(model.fullDay, false);
  assert.equal(model.periodicity, 'once');
  assert.deepEqual(model.calendars, ['public', 'reparatur']);
  assert.equal(model.locations[0].label, 'Alte Krone, Goethestrasse 14, 8712 Stäfa');
  assert.equal(model.locations[0].key, '');
  assert.deepEqual(warnings, []);
});

test('a weekly series until a date (Qatira)', () => {
  const { model } = mapStecEvent(stec({ title: { rendered: 'Qatira &#8211; Sport am Samstag' }, stec_cat: [40], stec_loc: [59] },
    { start_date: '2027-05-15T15:00', end_date: '2027-05-15T19:00', rrule: 'FREQ=WEEKLY;UNTIL=20270710;BYDAY=SA;' }), MAP);
  assert.equal(model.name, 'Qatira – Sport am Samstag');
  assert.equal(model.periodicity, 'weekly');
  assert.equal(model.repeatUntilDate, '20270710');
});

test('a yearly event without end gets a warning and stays once', () => {
  const { model, warnings } = mapStecEvent(stec({}, { rrule: 'FREQ=YEARLY' }), MAP);
  assert.equal(model.periodicity, 'once');
  assert.match(warnings.join(' '), /ohne Enddatum/);
});

test('a full-day event (Flohmi-Tag)', () => {
  const { model } = mapStecEvent(stec({}, { start_date: '2026-03-21T00:00', end_date: '2026-03-21T23:59', all_day: 'True' }), MAP);
  assert.equal(model.fullDay, true);
  assert.equal(model.startTime, '');
  assert.equal(model.durationMinutes, 1440);
});

test('a suspicious 01:00 start is kept and warned', () => {
  const { model, warnings } = mapStecEvent(stec({}, { start_date: '2027-12-04T01:00', end_date: '2027-12-04T13:30' }), MAP);
  assert.equal(model.startTime, '01:00');
  assert.match(warnings.join(' '), /01:00/);
});

test('a monthly nth-weekday rule becomes a single event with a warning', () => {
  const { model, warnings } = mapStecEvent(stec({}, { rrule: 'FREQ=MONTHLY;BYDAY=1SA' }), MAP);
  assert.equal(model.periodicity, 'once');
  assert.match(warnings.join(' '), /FREQ=MONTHLY/);
});

test('an unknown category keeps the event public without a group, with a warning', () => {
  const { model, warnings } = mapStecEvent(stec({ stec_cat: [99] }), MAP);
  assert.deepEqual(model.calendars, ['public']);
  assert.match(warnings.join(' '), /Kategorie 99/);
});

test('an external link becomes the event url', () => {
  const { model } = mapStecEvent(stec({}, { external_link: [{ url: 'https://kiss-staefa.ch', label: 'KISS' }] }), MAP);
  assert.equal(model.url, 'https://kiss-staefa.ch');
});

test('a featured image is reported, not stored (EV7 not approved)', () => {
  const { model, warnings } = mapStecEvent(stec({ featured_media: 1462 }), MAP);
  assert.equal('imageUrl' in model, false);
  assert.match(warnings.join(' '), /Bild 1462/);
});

test('occurrenceDates drops the excluded dates of a series', () => {
  const recurring = (start, end) => ['20260131', '20260207', '20260214', '20260221'].filter(d => d >= start && d <= end);
  const { model, exdates } = mapStecEvent(stec({}, { start_date: '2026-01-31T15:00', end_date: '2026-01-31T19:00', rrule: 'FREQ=WEEKLY;UNTIL=20260221;BYDAY=SA', exdate: ['20260207', '20260214'] }), MAP);
  assert.deepEqual(occurrenceDates(model, exdates, recurring), ['20260131', '20260221']);
});

test('occurrenceDates of a single event is its date', () => {
  const { model, exdates } = mapStecEvent(stec(), MAP);
  assert.deepEqual(occurrenceDates(model, exdates, () => { throw new Error('not called'); }), ['20261205']);
});

test('the type is the first category that has one (group name as calevent category)', () => {
  const map = { groups: { 40: 'la21staefa_qatira', 56: 'la21staefa' }, types: { 40: 'Qatira', 56: 'Verein LA21' } };
  assert.equal(mapStecEvent(stec({ stec_cat: [99, 40] }), map).model.type, 'Qatira');
  assert.equal(mapStecEvent(stec({ stec_cat: [56] }), map).model.type, 'Verein LA21');
  assert.deepEqual(mapStecEvent(stec({ stec_cat: [56] }), map).model.calendars, ['public', 'la21staefa']);
  assert.equal(mapStecEvent(stec({ stec_cat: [] }), map).model.type, '');
});
