import { websiteNodeValidations, WebsiteNodeFormModel } from './website-node.validations';

const m = (o: Partial<WebsiteNodeFormModel> = {}): WebsiteNodeFormModel => ({
  type: 'page', label: 'Vorstand', slug: 'vorstand', url: '', style: 'default', ...o,
});

describe('websiteNodeValidations', () => {
  it('accepts a valid page', () => expect(websiteNodeValidations(m()).isValid()).toBe(true));
  it('requires a label up to 60 chars', () => {
    expect(websiteNodeValidations(m({ label: '' })).hasErrors('label')).toBe(true);
    expect(websiteNodeValidations(m({ label: 'x'.repeat(61) })).hasErrors('label')).toBe(true);
  });
  it('rejects an uppercase page slug and an empty one', () => {
    expect(websiteNodeValidations(m({ slug: 'Vorstand' })).hasErrors('slug')).toBe(true);
    expect(websiteNodeValidations(m({ slug: '' })).hasErrors('slug')).toBe(true);
  });
  it('requires a link url with an allowed prefix', () => {
    const link = (url: string) => m({ type: 'link', slug: '', url });
    expect(websiteNodeValidations(link('ftp://x')).hasErrors('url')).toBe(true);
    expect(websiteNodeValidations(link('')).hasErrors('url')).toBe(true);
    for (const ok of ['mailto:a@b.ch', 'https://a.ch', '/termine?cat=regatta']) {
      expect(websiteNodeValidations(link(ok)).isValid()).toBe(true);
    }
  });
  it('rejects http and tel links', () => {
    for (const bad of ['tel:+41', 'http://x.ch']) {
      expect(websiteNodeValidations(m({ type: 'link', slug: '', url: bad })).hasErrors('url')).toBe(true);
    }
  });
  it('ignores slug for links and url for pages', () => {
    expect(websiteNodeValidations(m({ type: 'link', slug: 'BAD', url: '/x' })).isValid()).toBe(true);
    expect(websiteNodeValidations(m({ url: 'ftp://x' })).isValid()).toBe(true);
  });
  it('menu needs only a label', () => {
    expect(websiteNodeValidations(m({ type: 'menu', slug: '', url: '' })).isValid()).toBe(true);
  });
});
