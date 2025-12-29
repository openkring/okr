import { only, staticSuite } from 'vest';

import { TableSection } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const tableSectionValidations = staticSuite((model: TableSection, field?: string) => {
    if (field) only(field);

    baseSectionValidations(model, field);

    /* tbd:

        data: {
        header: string[]; // column headers: strings or html, the length determines the number of columns
        values: string[]; // the content of the fields, from top left to bottom right (row by row)
    },
    grid: {
        template: string; 
        gap: string;
        backgroundColor: string;
        padding: string;
    },
    header: {
        backgroundColor: string;
        textAlign: string;
        fontSize: string;
        fontWeight: string;
        padding: string;
    },
    cell: {
        backgroundColor: string;
        textAlign: string;
        fontSize: string;
        fontWeight: string;
        padding: string;
    }
        */
});
