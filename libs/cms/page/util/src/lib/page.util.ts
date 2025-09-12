import { ContentState, PageModel, PageType } from '@bk2/shared-models';
import { isType } from '@bk2/shared-util-core';

import { PageFormModel } from './page-form.model';

export function convertPageToForm(page: PageModel): PageFormModel {
  return {
    bkey: page.bkey,
    name: page.name,
    tags: page.tags,
    tenants: page.tenants,

    title: page.title,
    type: page.type ?? PageType.Content,
    state: page.state ?? ContentState.Draft,
    notes: page?.notes,
    sections: page.sections,
  };
}

export function convertFormToPage(page: PageModel | undefined, vm: PageFormModel, tenantId: string): PageModel {
  page ??= new PageModel(tenantId);
  page.name = vm.name ?? '';
  page.bkey = !vm.bkey || vm.bkey.length === 0 ? page.name : vm.bkey; // we want to use the name as the key of the menu item in the database
  page.tags = vm.tags ?? '';
  page.tenants = vm.tenants ?? [];
  page.title = vm.title ?? '';
  page.type = vm.type ?? PageType.Content;
  page.state = vm.state ?? ContentState.Draft;
  page.notes = vm.notes ?? '';
  page.sections = vm.sections ?? [];
  return page;
}

export function isPage(page: unknown, tenantId: string): page is PageModel {
  return isType(page, new PageModel(tenantId));
}
