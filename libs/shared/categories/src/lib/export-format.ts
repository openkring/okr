import { CategoryModel, ExportFormat } from '@bk2/shared-models';

export type ExportFormatCategory = CategoryModel;



/* abbreviation contains the file extension
   name contains the format name
*/
export const ExportFormats: ExportFormatCategory[] = [
    {
        id: ExportFormat.JSON,
        abbreviation: 'json',
        name: 'json',
        i18nBase: 'core.export.json',
        icon: 'barcode'
    },
    {
        id: ExportFormat.XML,
        abbreviation: 'xml',
        name: 'xml',
        i18nBase: 'core.export.xml',
        icon: 'code'
    },
    {
        id: ExportFormat.XLSX,
        abbreviation: 'xlsx',
        name: 'xlsx',
        i18nBase: 'core.export.xlsx',
        icon: 'grid'
    },
    {
        id: ExportFormat.CSV,
        abbreviation: 'csv',
        name: 'csv',
        i18nBase: 'core.export.csv',
        icon: 'reorder-four'
    }
]
