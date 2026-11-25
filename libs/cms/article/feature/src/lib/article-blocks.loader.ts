import type { Type } from '@angular/core';

import type { ArticleBlocks } from './article-blocks';

/** The component that draws the blocks of a free article, for `createComponent`: no chunk that loads at first holds it. */
export async function loadArticleBlocks(): Promise<Type<ArticleBlocks>> {
  return (await import('./article-blocks')).ArticleBlocks;
}
