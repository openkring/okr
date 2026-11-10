import { SectionCta } from '@okr/shared-models';

/**
 * A call-to-action may only point somewhere safe: an https link, mailto:/tel:, a site path, an
 * in-page anchor, or a relative page of the website («bootshaus.html», «seite.html?key=…»).
 * Everything else — javascript:, protocol-relative, plain http, parent paths — is rejected.
 */
export function isSectionCtaUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (u.length === 0) return false;
  if (u.startsWith('https://') || u.startsWith('mailto:') || u.startsWith('tel:')) return true;
  if (u.startsWith('#')) return u.length > 1;
  if (u.startsWith('/')) return !u.startsWith('//');
  return /^[\w-]+\.html([?#].*)?$/.test(u);
}

/** Keeps only CTAs that can be rendered (label and safe url), at most `max`. */
export function validCtas(ctas: SectionCta[] | undefined, max: number): SectionCta[] {
  return (ctas ?? [])
    .filter((c) => typeof c?.label === 'string' && c.label.trim().length > 0 && isSectionCtaUrl(c.url))
    .slice(0, max)
    .map((c) => ({ ...c, label: c.label.trim(), url: c.url.trim() }));
}
