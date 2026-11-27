import type { SectionModel } from '@okr/shared-models';

/** Whether a section is edited in the people block editor (spec 1.181): a people section, editable, with the gate open. Otherwise today's form opens. */
export function usesPeopleEditor(section: SectionModel, readOnly: boolean, gateOpen: boolean): boolean {
  return section.type === 'people' && !readOnly && gateOpen;
}
