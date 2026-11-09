import { describe, it, expect } from 'vitest';
import { buildContactBody, subjectLabel } from './contact';

describe('buildContactBody', () => {
  const base = { name: 'Bruno', email: 'bruno@example.com', subject: 'general' as const, message: 'Zeile 1\nZeile 2' };

  it('turns line breaks into real <br> tags', () => {
    expect(buildContactBody(base, 'msg_x')).toContain('Zeile 1<br>Zeile 2');
  });

  it('escapes html in user input', () => {
    const html = buildContactBody({ ...base, name: '<b>x</b>', message: '<script>alert(1)</script>' }, 'msg_x');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows the readable subject label, not the key', () => {
    expect(buildContactBody({ ...base, subject: 'boathouse' }, 'msg_x')).toContain('Bootshaus-Projekt');
  });

  it('shows the phone row only when given', () => {
    expect(buildContactBody(base, 'msg_x')).not.toContain('Telefon');
    expect(buildContactBody({ ...base, phone: '044 000 00 00' }, 'msg_x')).toContain('044 000 00 00');
  });
});

describe('subjectLabel', () => {
  it('maps every key to its German label', () => {
    expect(subjectLabel('course')).toBe('Kursanmeldung');
    expect(subjectLabel('youth')).toBe('Jugendrudern');
  });
});
