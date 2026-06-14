import { PageModel } from '@bk2/shared-models';
import { buildSearchTokens, isType } from '@bk2/shared-util-core';

export function isPage(page: unknown, tenantId: string): page is PageModel {
  return isType(page, new PageModel(tenantId));
}

/*-------------------------- search index --------------------------------*/
export function getPageIndex(page: PageModel): string {
  return 'n:' + page.name + ' k:' + page.bkey + ' tt:' + buildSearchTokens(page.title);
}

export function getPageIndexInfo(): string {
  return 'n:ame k:ey tt:titleTokens';
}