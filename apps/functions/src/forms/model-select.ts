import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { Field } from '@okr/shared-models';
import { isModelSelect, MODEL_SELECT_COLLECTIONS, projectModelChoices, type ModelSelectChoice } from '@okr/shared-util-core';

/**
 * The lists of a form's person / org / resource pickers, read with the Admin SDK.
 *
 * Orgs and resources are listed for everybody — `getFormDefinition` is anonymous and their names are public
 * (a club, a boat). Persons are listed only with `withPersons` (a signed-in caller of `submitForm`, to check a
 * picked key) and are NEVER part of the public definition: an anonymous filler types the name.
 */
export async function readModelSelectChoices(
  db: Firestore,
  fields: Field[] | undefined,
  tenantId: string,
  withPersons: boolean,
): Promise<Record<string, ModelSelectChoice[]>> {
  const pickers = (Array.isArray(fields) ? fields : []).filter(isModelSelect).filter((f) => withPersons || f.type !== 'person');
  if (pickers.length === 0) return {};
  const byCollection = new Map<string, Promise<Record<string, unknown>[]>>();
  const docsOf = (collection: string) => {
    let docs = byCollection.get(collection);
    if (!docs) {
      docs = db.collection(collection).where('tenants', 'array-contains', tenantId).get()
        .then((snap) => snap.docs.map((d) => ({ ...d.data(), okey: d.id })))
        .catch((e) => {
          logger.warn(`forms: could not read ${collection} for a picker`, e);
          return [];   // the picker then only takes free text
        });
      byCollection.set(collection, docs);
    }
    return docs;
  };
  const result: Record<string, ModelSelectChoice[]> = {};
  for (const field of pickers) {
    result[field.key] = projectModelChoices(field, await docsOf(MODEL_SELECT_COLLECTIONS[field.type]), tenantId);
  }
  return result;
}
