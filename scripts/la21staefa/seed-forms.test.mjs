import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMS, SECTIONS, PROJECT_GROUPS } from './seed-forms.mjs';

const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/; // libs/forms/util field-kind.ts
const DISPLAY = new Set(['label', 'paragraph', 'divider']);
const APPLICATION_FIELDS = new Set(['firstName', 'lastName', 'streetName', 'streetNumber', 'zipCode', 'city', 'email']);

for (const [id, form] of Object.entries(FORMS)) {
  test(`${id}: keys are camelCase, unique, in order`, () => {
    const inputs = form.fields.filter((f) => !DISPLAY.has(f.type));
    for (const f of inputs) assert.match(f.key, FIELD_KEY_PATTERN, f.key);
    assert.equal(new Set(inputs.map((f) => f.key)).size, inputs.length);
    assert.deepEqual(form.fields.map((f) => f.order), form.fields.map((_, i) => i));
  });
}

test('membership: every answer is a model field or a typed property', () => {
  for (const f of FORMS.la21staefaMembership.fields.filter((x) => !DISPLAY.has(x.type))) {
    const isProperty = f.asProperty === true && !(f.type === 'checkbox' && f.options?.length);
    assert.ok(APPLICATION_FIELDS.has(f.key) || isProperty, f.key);
  }
  assert.equal(FORMS.la21staefaMembership.fields.filter((f) => f.key.startsWith('pg')).length, PROJECT_GROUPS.length);
});

test('contact is mail-only and its section names a recipient', () => {
  assert.equal(FORMS.la21staefaContact.target.kind, 'mail');
  assert.ok(SECTIONS.la21staefa_kontakt.properties.emailAddresses.length > 0);
});

test('each section embeds its own form', () => {
  assert.equal(SECTIONS.la21staefa_anmeldung.properties.formKey, FORMS.la21staefaMembership.formKey);
  assert.equal(SECTIONS.la21staefa_kontakt.properties.formKey, FORMS.la21staefaContact.formKey);
});
