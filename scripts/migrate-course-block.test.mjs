// Run: node --test scripts/migrate-course-block.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planCourseBlock } from './migrate-course-block.mjs';

test('adds course only to tenants that have courses and lack the block', () => {
  const plan = planCourseBlock(new Set(['scs', 'p13']), [
    { id: 'scs', enabledFeatures: ['calevent'] },
    { id: 'p13', enabledFeatures: ['calevent', 'course'] },
    { id: 'la21staefa', enabledFeatures: ['calevent'] },
  ]);
  assert.deepEqual(plan, ['scs']);
});

test('leaves a legacy tenant without enabledFeatures alone', () => {
  assert.deepEqual(planCourseBlock(new Set(['old']), [{ id: 'old', enabledFeatures: undefined }]), []);
});
