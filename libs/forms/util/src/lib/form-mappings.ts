import { FormMapping } from '@bk2/shared-models';

export const FORM_MAPPINGS: FormMapping[] = [
  {
    mappingKey: 'applications.default',
    label: 'Applications',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
    defaults: { state: 'applied', source: 'form' },
  },
  {
    mappingKey: 'applications.junior',
    label: 'Applications (Junioren)',
    modelType: 'ApplicationModel',
    collectionName: 'applications',
    defaults: { state: 'applied', source: 'form', applicationAs: 'youth' },
  },
];

export function getFormMapping(mappingKey: string): FormMapping | undefined {
  return FORM_MAPPINGS.find(m => m.mappingKey === mappingKey);
}
