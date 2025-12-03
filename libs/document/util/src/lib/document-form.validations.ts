import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, KEY_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH, URL_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { dateValidations, isAfterDate, isFutureDate, stringValidations } from '@bk2/shared-util-core';
import { DocumentFormModel } from './document-form.model';

export const documentFormValidations = staticSuite((model: DocumentFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, WORD_LENGTH);
  stringValidations('fullPath', model.fullPath, URL_LENGTH);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  stringValidations('title', model.title, NAME_LENGTH);
  stringValidations('altText', model.altText, NAME_LENGTH);
  stringValidations('type', model.type, WORD_LENGTH);
  stringValidations('source', model.source, WORD_LENGTH);
  stringValidations('url', model.url, URL_LENGTH);
  stringValidations('mimeType', model.mimeType, WORD_LENGTH);
  stringValidations('authorKey', model.authorKey, WORD_LENGTH);
  stringValidations('authorName', model.authorName, NAME_LENGTH);
  dateValidations('dateOfDocCreation', model.dateOfDocCreation);
  dateValidations('dateOfDocLastUpdate', model.dateOfDocLastUpdate);
  stringValidations('locationKey', model.locationKey, WORD_LENGTH);
  stringValidations('hash', model.hash, LONG_NAME_LENGTH);
  stringValidations('priorVersionKey', model.priorVersionKey, WORD_LENGTH);
  stringValidations('version', model.version, WORD_LENGTH);
  //tagValidations('tags', model.tags);
  // tbd: tenantValidations
  // tbd: parentsValidations

  // cross field validations
  omitWhen(model.dateOfDocCreation === '', () => {
    test('dateOfDocCreation', '@documentDateOfDocCreationNotFuture', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isFutureDate(model.dateOfDocCreation!)).isFalsy();
    })
  });

  omitWhen(model.dateOfDocLastUpdate === '', () => {
    test('dateOfDocLastUpdate', '@documentDateOfDocLastUpdateNotFuture', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isFutureDate(model.dateOfDocLastUpdate!)).isFalsy();
    })
  });

  omitWhen(model.dateOfDocCreation === '' || model.dateOfDocLastUpdate === '', () => {
    test('dateOfDocCreation', '@documentDateOfDocCreationAfterLastUpdate', () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      enforce(isAfterDate(model.dateOfDocLastUpdate!, model.dateOfDocCreation!)).isTruthy();
    });
  })
  // cross collection validations
});

