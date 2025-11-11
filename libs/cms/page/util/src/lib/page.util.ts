import { PageModel } from '@bk2/shared-models';
import { isType } from '@bk2/shared-util-core';

import { PageFormModel } from './page-form.model';
import { DEFAULT_CONTENT_STATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PAGE_TYPE, DEFAULT_SECTIONS, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@bk2/shared-constants';

export function convertPageToForm(page: PageModel): PageFormModel {
  return {
    bkey: page.bkey,
    name: page.name,
    tags: page.tags,
    tenants: page.tenants,

    title: page.title,
    type: page.type ?? DEFAULT_PAGE_TYPE,
    state: page.state ?? DEFAULT_CONTENT_STATE,
    notes: page?.notes,
    sections: page.sections,
  };
}

export function convertFormToPage(page: PageModel | undefined, vm: PageFormModel, tenantId: string): PageModel {
  page ??= new PageModel(tenantId);
  page.name = vm.name ?? DEFAULT_NAME;
  page.bkey = !vm.bkey || vm.bkey.length === 0 ? page.name : vm.bkey; // we want to use the name as the key of the menu item in the database
  page.tags = vm.tags ?? DEFAULT_TAGS;
  page.tenants = vm.tenants ?? DEFAULT_TENANTS;
  page.title = vm.title ?? DEFAULT_TITLE;
  page.type = vm.type ?? DEFAULT_PAGE_TYPE;
  page.state = vm.state ?? DEFAULT_CONTENT_STATE;
  page.notes = vm.notes ?? DEFAULT_NOTES;
  page.sections = vm.sections ?? DEFAULT_SECTIONS;
  return page;
}

export function isPage(page: unknown, tenantId: string): page is PageModel {
  return isType(page, new PageModel(tenantId));
}
