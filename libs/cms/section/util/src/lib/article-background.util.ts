import { ArticleConfig } from '@okr/shared-models';

import { footerBackground, isDarkColor } from './footer.util';

/** The article's own background that may go into a style binding; '' = none (the emphasis decides). */
export function articleBackground(config: Pick<ArticleConfig, 'background'> | undefined): string {
  return footerBackground(config?.background);
}

/**
 * Whether the text on the article's background is drawn white. An explicit `textColor` wins; without one the
 * brightness of the background decides ('auto' or absent) (as for the footer). Without a background: false.
 */
export function articleHasLightText(config: Pick<ArticleConfig, 'background' | 'textColor'> | undefined): boolean {
  const background = articleBackground(config);
  if (!background) return false;
  if (config?.textColor === 'light') return true;
  if (config?.textColor === 'dark') return false;
  return isDarkColor(background);
}
