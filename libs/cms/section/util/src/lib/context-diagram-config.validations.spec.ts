import { describe, expect, it } from 'vitest';

import { ContextDiagramConfig } from '@okr/shared-models';

import { contextDiagramConfigValidations, newContextDiagramConfigFormModel } from './context-diagram-config.validations';

const config: ContextDiagramConfig = {
  startElement: 'person.abc',
  showAvatar: true,
  showName: true,
  showMembers: false,
  showMemberships: false,
  showResponsibilities: true,
  showPersonalRels: false,
  showWorkRels: false,
  connectionNames: true,
  depth: 1,
};

describe('contextDiagramConfigValidations', () => {
  // The suite has no tests (every switch combination is valid), and Vest's isValid() is false
  // for a suite that ran none — the form reads per-field errors, so assert there are none.
  it('accepts the default configuration', () => {
    expect(contextDiagramConfigValidations(newContextDiagramConfigFormModel(config)).hasErrors()).toBe(false);
  });

  it('accepts every switch turned on, including saveChanges', () => {
    const all = newContextDiagramConfigFormModel({
      ...config, showMembers: true, showMemberships: true, showPersonalRels: true, showWorkRels: true,
    }, true);
    expect(contextDiagramConfigValidations(all).hasErrors()).toBe(false);
  });

  it('copies the config and defaults saveChanges to false', () => {
    const model = newContextDiagramConfigFormModel(config);
    expect(model.saveChanges).toBe(false);
    expect(model.showAvatar).toBe(true);
    expect(model).not.toBe(config);
  });
});
