import { enforce, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { CommentModel } from '@bk2/shared-models';
import { baseValidations, dateValidations, stringValidations } from '@bk2/shared-util-core';

export const commentValidations = staticSuite((model: CommentModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);
  stringValidations('authorKey', model.authorKey, SHORT_NAME_LENGTH, 5, true);
  dateValidations('creationDateTime', model.creationDateTime);
  stringValidations('parentKey', model.parentKey, SHORT_NAME_LENGTH, 5, true);
  stringValidations('parentCollection', model.parentCollection, SHORT_NAME_LENGTH, 5, true);
  
  // check the parentCollection to be a supported collection: subject, resource, membership, ownership
  
  test('description', '@commentNotEmpty', () => {
    enforce(model.description).isNotEmpty();
  });
  test('description', '@commentShouldMakeSense', () => {
    enforce(model.description).notEquals('Neuer Kommentar wurde erstellt');
    enforce(model.description).notEquals('initial comment');
    enforce(model.description).notEquals('initial');
    enforce(model.description).notEquals('created');
    enforce(model.description).notEquals('deleted');
    enforce(model.description).notEquals('test');
    enforce(model.description).notEquals('blah');
    enforce(model.description).notEquals('gugus');
    enforce(model.description).notEquals('sugus');
    enforce(model.description).notEquals('...');

  });

});

// tbd: check the authorKey to reference into subjects
