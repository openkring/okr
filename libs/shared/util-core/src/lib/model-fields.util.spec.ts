import { describe, expect, it } from 'vitest';
import { hiddenFieldsOf, isFieldShown, MODEL_FIELDS, resourceFieldKey, withFieldVisibility, withoutModel } from './model-fields.util';

describe('model-fields.util', () => {
  describe('MODEL_FIELDS', () => {
    it('hides only person.title by default', () => {
      const hidden = Object.entries(MODEL_FIELDS).flatMap(([model, specs]) =>
        specs.filter((s) => !s.defaultVisible).map((s) => `${model}.${s.field}`));
      expect(hidden).toEqual(['person.title']);
    });
  });

  describe('hiddenFieldsOf', () => {
    it('returns the catalogue default when nothing is stored', () => {
      expect([...hiddenFieldsOf('person', undefined)]).toEqual(['title']);
      expect([...hiddenFieldsOf('person', null)]).toEqual(['title']);
    });
    it('shows a field the tenant switched on', () => {
      expect(hiddenFieldsOf('person', { person: { title: true } }).size).toBe(0);
    });
    it('hides a field the tenant switched off', () => {
      expect([...hiddenFieldsOf('person', { person: { nickname: false } })].sort()).toEqual(['nickname', 'title']);
    });
    it('ignores fields that are not hideable', () => {
      expect([...hiddenFieldsOf('person', { person: { firstName: false, gender: false } })]).toEqual(['title']);
    });
    it('returns an empty set for an unknown model key', () => {
      expect(hiddenFieldsOf('nope', { nope: { a: false } }).size).toBe(0);
    });
    it('falls back to the default for a non-boolean value', () => {
      const stored = { person: { title: 'yes', nickname: 0 } } as unknown as Record<string, Record<string, boolean>>;
      expect([...hiddenFieldsOf('person', stored)]).toEqual(['title']);
    });
    it('does not throw on a malformed model entry', () => {
      const stored = { person: null } as unknown as Record<string, Record<string, boolean>>;
      expect([...hiddenFieldsOf('person', stored)]).toEqual(['title']);
    });
  });

  describe('withFieldVisibility', () => {
    it('stores a value that differs from the default', () => {
      expect(withFieldVisibility(undefined, 'person', 'nickname', false)).toEqual({ person: { nickname: false } });
    });
    it('removes the entry when set back to the default', () => {
      expect(withFieldVisibility({ person: { nickname: false, notes: false } }, 'person', 'nickname', true))
        .toEqual({ person: { notes: false } });
    });
    it('removes an empty model entry', () => {
      expect(withFieldVisibility({ person: { nickname: false } }, 'person', 'nickname', true)).toEqual({});
    });
    it('uses the catalogue default of the field', () => {
      expect(withFieldVisibility(undefined, 'person', 'title', false)).toEqual({});
      expect(withFieldVisibility(undefined, 'person', 'title', true)).toEqual({ person: { title: true } });
    });
    it('does not mutate the input', () => {
      const stored = { person: { nickname: false } };
      const copy = JSON.parse(JSON.stringify(stored));
      withFieldVisibility(stored, 'person', 'nickname', true);
      withFieldVisibility(stored, 'org', 'taxId', false);
      expect(stored).toEqual(copy);
    });
    it('keeps other models', () => {
      expect(withFieldVisibility({ org: { taxId: false } }, 'person', 'nickname', false))
        .toEqual({ org: { taxId: false }, person: { nickname: false } });
    });
  });

  describe('prototype-named keys', () => {
    const names = ['constructor', '__proto__', 'toString'];
    it.each(names)('hiddenFieldsOf returns an empty set for model key %s', (name) => {
      expect(hiddenFieldsOf(name, undefined).size).toBe(0);
      expect(hiddenFieldsOf(name, { person: { nickname: false } }).size).toBe(0);
    });
    it.each(names)('withFieldVisibility does not throw or mutate for model key %s', (name) => {
      const stored = { person: { nickname: false } };
      const copy = JSON.parse(JSON.stringify(stored));
      expect(() => withFieldVisibility(stored, name, 'x', false)).not.toThrow();
      expect(stored).toEqual(copy);
      expect(({} as Record<string, unknown>)['x']).toBeUndefined();
      expect(Object.getPrototypeOf(withFieldVisibility(stored, name, 'x', false))).toBe(Object.prototype);
    });
    it('treats constructor as an ordinary unknown field inside person', () => {
      expect([...hiddenFieldsOf('person', { person: { constructor: false } as unknown as Record<string, boolean> })]).toEqual(['title']);
      expect(() => withFieldVisibility({ person: {} }, 'person', 'constructor', false)).not.toThrow();
    });
    it('does not let a stored __proto__ key set a prototype', () => {
      const stored = JSON.parse('{"__proto__":{"polluted":false},"person":{"nickname":false}}');
      const next = withFieldVisibility(stored, 'org', 'taxId', false);
      expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
      expect((next as Record<string, unknown>)['polluted']).toBeUndefined();
      expect(next['person']).toEqual({ nickname: false });
    });
  });

  describe('resourceFieldKey', () => {
    it('maps a type with its own form', () => {
      expect(resourceFieldKey('rboat')).toBe('resource.rboat');
    });
    it('maps a type without own form to other', () => {
      expect(resourceFieldKey('legaldoc')).toBe('resource.other');
      expect(resourceFieldKey(undefined)).toBe('resource.other');
    });
  });

  describe('isFieldShown', () => {
    it('hides a hidden field without errors', () => {
      expect(isFieldShown('a', new Set(['a']), [])).toBe(false);
    });
    it('shows a hidden field that has errors', () => {
      expect(isFieldShown('a', new Set(['a']), ['required'])).toBe(true);
    });
    it('shows a field that is not hidden', () => {
      expect(isFieldShown('b', new Set(['a']), [])).toBe(true);
    });
  });

  describe('withoutModel', () => {
    it('removes only the entry of that model', () => {
      const stored = { person: { nickname: false }, org: { taxId: false } };
      expect(withoutModel(stored, 'person')).toEqual({ org: { taxId: false } });
    });
    it('does not change the input', () => {
      const stored = { person: { nickname: false } };
      withoutModel(stored, 'person');
      expect(stored).toEqual({ person: { nickname: false } });
    });
    it('returns an empty map for null, undefined and unknown models', () => {
      expect(withoutModel(null, 'person')).toEqual({});
      expect(withoutModel(undefined, 'person')).toEqual({});
      expect(withoutModel({ org: { taxId: false } }, 'person')).toEqual({ org: { taxId: false } });
    });
    it('copes with prototype-named keys', () => {
      expect(withoutModel({ person: { nickname: false } }, '__proto__')).toEqual({ person: { nickname: false } });
    });
  });
});
