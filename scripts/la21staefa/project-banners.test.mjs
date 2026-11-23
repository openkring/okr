// Run: node --test scripts/la21staefa/project-banners.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HEADER, HEADER_PHOTOS, KEEP, bannerSection, sliderSection, writtenKeys } from './project-banners.mjs';

test('writtenKeys holds exactly the sections that the run replaces or trims', () => {
  const group = { name: 'Gruppe', subTitle: '', color: '#112233', logo: '' };
  const pageOf = (project) => `la21staefa_${project}_content`;
  const projects = Object.keys(HEADER_PHOTOS);
  const banners = projects.map((p) => bannerSection(pageOf(p), group, 'a', 'b').name);
  const sliders = projects.filter((p) => HEADER_PHOTOS[p].length > 0).map((p) => sliderSection(pageOf(p), group, HEADER_PHOTOS[p]).name);
  const headers = Object.keys(KEEP).map((p) => `${pageOf(p)}_${HEADER[p][0]}`);

  assert.ok(banners.length > 0 && sliders.length > 0 && headers.length > 0);
  assert.deepEqual(writtenKeys().sort(), [...banners, ...sliders, ...headers].sort());
});
