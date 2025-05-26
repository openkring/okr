import { enforce, omitWhen, only, staticSuite, test} from 'vest';
import { categoryValidations, compareDate, dateValidations, isFutureDate, numberValidations, stringValidations } from '@bk2/shared/util';
import { DocumentModel } from '@bk2/shared/models';
import { dirValidations } from './dir.validations';
import { SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { baseValidations } from '@bk2/shared/data-access';

export const documentValidations = staticSuite((model: DocumentModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);
  categoryValidations('docType', model.docType, DocumentType);
  dirValidations('dir', model.dir);
  stringValidations('fileName', model.fileName, SHORT_NAME_LENGTH);
  stringValidations('extension', model.extension, SHORT_NAME_LENGTH);
  stringValidations('mimeType', model.mimeType, SHORT_NAME_LENGTH);
  numberValidations('size', model.size, true, 0, 1000000000);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
  stringValidations('altText', model.altText, SHORT_NAME_LENGTH);
  stringValidations('authorKey', model.authorKey, SHORT_NAME_LENGTH);
  stringValidations('authorName', model.authorName, SHORT_NAME_LENGTH);
  dateValidations('dateOfDocCreation', model.dateOfDocCreation);
  dateValidations('dateOfDocLastUpdate', model.dateOfDocLastUpdate);
  stringValidations('locationKey', model.locationKey, SHORT_NAME_LENGTH);
  stringValidations('md5hash', model.md5hash, SHORT_NAME_LENGTH);
  stringValidations('priorVersionKey', model.priorVersionKey, SHORT_NAME_LENGTH);
  stringValidations('version', model.version, SHORT_NAME_LENGTH);

  // cross validations
  omitWhen(model.dateOfDocCreation === '', () => {
    test('dateOfDocCreation', '@docCreationNotFuture', () => {
      enforce(isFutureDate(model.dateOfDocCreation)).isFalsy();
    })
  });

  omitWhen(model.dateOfDocLastUpdate === '', () => {
    test('dateOfDocLastUpdate', '@docUpdateNotFuture', () => {
      enforce(isFutureDate(model.dateOfDocLastUpdate)).isFalsy();
    })
  });

  omitWhen(model.dateOfDocCreation === '' || model.dateOfDocLastUpdate === '', () => {
    test('dateOfDocLastUpdate', '@docUpdateAfterCreation', () => {
      enforce(compareDate(model.dateOfDocLastUpdate, model.dateOfDocCreation) >= 0);
    });
  })
});

// tbd: cross the authorKey to reference into subjects
// tbd: cross the locationKey to reference into locations
// tbd: cross the priorVersionKey to reference into documents