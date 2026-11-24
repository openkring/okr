import { describe, expect, it } from 'vitest';

import { bareHostname } from './hostname.util';

describe('bareHostname', () => {
  it.each([
    ['app.seeclub.org', 'app.seeclub.org'],
    [' App.Kring.CH ', 'app.kring.ch'],
    ['la21staefa-app-54aef.web.app', 'la21staefa-app-54aef.web.app'],
    ['app.elab.glp-staefa.ch', 'app.elab.glp-staefa.ch'],
  ])('keeps %s', (v, r) => expect(bareHostname(v)).toBe(r));

  it.each(['', 'evil.ch:80', 'evil.ch:80@own.ch', 'a@own.ch', 'own.ch/x', 'own.ch\\x', 'own.ch?x', 'own.ch#x', 'own ch', 'localhost', 42, undefined, null])(
    'refuses %s',
    (v) => expect(bareHostname(v)).toBeUndefined(),
  );
});
