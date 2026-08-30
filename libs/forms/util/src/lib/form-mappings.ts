import { FormMapping } from '@okr/shared-models';

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
  {
    // C5 §2 — the kring.ch lead form. The only mapping whose target is not a single document:
    // `submitForm` dispatches it to `createProspect`, which writes the prospect AND its contact
    // details into the address vault (`parentKey = 'prospect.<okey>'`). Never give a prospect a
    // loose email field. Mirrored in the inlined whitelist in `apps/functions/src/forms/index.ts`.
    mappingKey: 'prospects.default',
    label: 'Prospects (kring.ch)',
    modelType: 'ProspectModel',
    collectionName: 'prospects',
    defaults: { source: 'kring.ch' },
  },
  {
    // §6b / O1 — the boathouse reservation, converted from ReservationApplyModal. Like
    // `prospects.default` this is NOT written by the generic collection path: a reservation
    // carries typed avatars (reserver, resource) and a built search index, so `submitForm`
    // dispatches it to `createBoathouseReservation`, which also enforces the two cross-field
    // rules the builder's per-field validators cannot express. Mirrored in the inlined
    // whitelist in `apps/functions/src/forms/index.ts`.
    mappingKey: 'reservations.boathouse',
    label: 'Reservation Bootshaus',
    modelType: 'ReservationModel',
    collectionName: 'reservations',
    defaults: { state: 'initial' },
  },
];

export function getFormMapping(mappingKey: string): FormMapping | undefined {
  return FORM_MAPPINGS.find(m => m.mappingKey === mappingKey);
}
