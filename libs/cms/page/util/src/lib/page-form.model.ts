import { DEFAULT_CONTENT_STATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PAGE_TYPE, DEFAULT_SECTIONS, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TITLE } from '@bk2/shared-constants';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type PageFormModel = DeepPartial<{
    bkey: string,
    name: string,
    tags: string,
    tenants: string[]

    title: string,
    type: string,
    state: string,
    notes: string,
    sections: string[],
}>;

export const pageFormModelShape: DeepRequired<PageFormModel> = {
    bkey: DEFAULT_KEY,
    name: DEFAULT_NAME,
    tags: DEFAULT_TAGS,
    tenants: DEFAULT_TENANTS,

    title: DEFAULT_TITLE,
    type: DEFAULT_PAGE_TYPE,
    state: DEFAULT_CONTENT_STATE,
    notes: DEFAULT_NOTES,

    sections: DEFAULT_SECTIONS,
};