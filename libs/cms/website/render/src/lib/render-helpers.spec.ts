import { compileTemplate, createTemplateEnv, runsOf, scriptJson } from './render-helpers';

const render = (source: string, context: unknown = {}): string =>
  compileTemplate(createTemplateEnv(), 'spec.hbs', source)(context, { lang: 'de', year: 2026 });

describe('template data helpers', () => {
  it('or: first truthy param, else the last', () => {
    expect(render('{{or a "x"}}', { a: '' })).toBe('x');
    expect(render('{{or a "x"}}', { a: 'top' })).toBe('top');
    expect(render('{{or a b}}', { a: 0, b: '' })).toBe('');
  });

  it('and / not', () => {
    expect(render('{{#if (and a b)}}y{{else}}n{{/if}}', { a: 1, b: 'z' })).toBe('y');
    expect(render('{{#if (and a b)}}y{{else}}n{{/if}}', { a: 1, b: '' })).toBe('n');
    expect(render('{{#if (not a)}}y{{else}}n{{/if}}', { a: 0 })).toBe('y');
  });

  it('gt, add, sub, mod as numbers', () => {
    expect(render('{{#if (gt a 1)}}y{{else}}n{{/if}}', { a: 2 })).toBe('y');
    expect(render('{{#if (gt a 1)}}y{{else}}n{{/if}}', { a: '1' })).toBe('n');
    expect(render('{{add a 1}}/{{sub 12 a}}/{{mod a 2}}', { a: 3 })).toBe('4/9/1');
  });

  it('startsWith / contains, optionally ignoring case', () => {
    expect(render('{{#if (startsWith u "https://")}}y{{else}}n{{/if}}', { u: 'https://a' })).toBe('y');
    expect(render('{{#if (startsWith u "https://")}}y{{else}}n{{/if}}', { u: 'HTTPS://a' })).toBe('n');
    expect(render('{{#if (startsWith u "https://" ignoreCase=true)}}y{{else}}n{{/if}}', { u: 'HTTPS://a' })).toBe('y');
    expect(render('{{#if (contains c "blue" ignoreCase=true)}}y{{else}}n{{/if}}', { c: 'DarkBlue' })).toBe('y');
    expect(render('{{#if (contains c "blue")}}y{{else}}n{{/if}}', {})).toBe('n');
  });

  it('initials: first letters, upper-cased', () => {
    expect(render('{{initials a b}}', { a: 'anna', b: 'berg' })).toBe('AB');
    expect(render('{{initials a b}}', { a: '', b: undefined })).toBe('');
  });

  it('count: records with an own field equal to the value', () => {
    const list = [{ tab: 'files' }, { tab: 'videos' }, { tab: 'files' }, null, 'files'];
    expect(render('{{count list "tab" "files"}}', { list })).toBe('2');
    expect(render('{{count list "tab" "files"}}', { list: 'x' })).toBe('0');
    expect(render('{{count list "constructor" x}}', { list: [{}], x: Object })).toBe('0');
  });

  it('runs: consecutive matching records grouped, others alone', () => {
    const a = { type: 'logo', n: 1 };
    const b = { type: 'logo', n: 2 };
    const c = { type: 'link', n: 3 };
    const d = { type: 'logo', n: 4 };
    expect(runsOf([a, b, c, d], 'type', 'logo')).toEqual([
      { match: true, items: [a, b] },
      { match: false, items: [c] },
      { match: true, items: [d] },
    ]);
    expect(runsOf(undefined, 'type', 'logo')).toEqual([]);
    expect(render('{{#each (runs list "type" "logo")}}[{{#if match}}{{#each items}}{{n}}{{/each}}{{else}}-{{/if}}]{{/each}}', { list: [a, b, c, d] })).toBe(
      '[12][-][4]',
    );
  });

  it('json: script-safe JSON', () => {
    const value = { t: '</script><!-- a & b \u2028' };
    const out = render('{{{json v}}}', { v: value });
    expect(out).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(out)).toEqual(value);
    expect(scriptJson(undefined)).toBe('null');
  });
});

describe('homepage helpers', () => {
  it('cssUrl: percent-encodes what could leave a CSS url("…")', () => {
    expect(render('{{{cssUrl u}}}', { u: 'https://a.b/c d.jpg?x=(1)"\'\\<>' })).toBe('https://a.b/c%20d.jpg?x=%281%29%22%27%5C%3C%3E');
    expect(render('{{cssUrl u}}', {})).toBe('');
  });

  it('breaks: escaped text with each newline as <br>', () => {
    expect(render('{{breaks c}}', { c: 'Bild <1>\nQuelle & Co' })).toBe('Bild &lt;1&gt;<br>Quelle &amp; Co');
    expect(render('{{breaks c}}', {})).toBe('');
  });
});
