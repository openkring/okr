import { ContentState, PageType } from '@bk2/shared/models';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type PageFormModel = DeepPartial<{
    bkey: string,
    name: string,
    tags: string,
    tenants: string[]

    title: string,
    type: PageType,
    state: ContentState,
    notes: string,
    sections: string[],
}>;

export const pageFormModelShape: DeepRequired<PageFormModel> = {
    bkey: '',
    name: '',
    tags: '',
    tenants: [],

    title: '',
    type: PageType.Content,
    state: ContentState.Draft,
    notes: '',

    sections: [],
};