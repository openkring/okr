import { only, staticSuite } from 'vest';

import { ContextDiagramConfig } from '@okr/shared-models';

/** Form model of the context-diagram display settings: the config plus the memberAdmin's "save as default" switch. */
export type ContextDiagramConfigFormModel = ContextDiagramConfig & { saveChanges: boolean };

export function newContextDiagramConfigFormModel(config: ContextDiagramConfig, saveChanges = false): ContextDiagramConfigFormModel {
  return { ...config, saveChanges };
}

/**
 * The display settings are on/off switches only, so there is nothing a user can enter wrongly:
 * every combination is valid (the former modal accepted any combination as well).
 * The suite exists so the form follows the standard Signal Forms + Vest wiring.
 */
export const contextDiagramConfigValidations = staticSuite((_model: ContextDiagramConfigFormModel, field?: string) => {
  if (field) only(field);
});
