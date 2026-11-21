import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, SearchableModel, TaggedModel } from './base.model';

/**
 * Haushalt (spec 1.168): Personen, die fuer Versand und Rechnung zusammengefasst werden. Ein Haushalt gehoert
 * genau einem Mandanten (`tenants` = `[tenantId]`); pro Person und Mandant gibt es hoechstens einen.
 *
 * ACHTUNG beim Lesen: Firestore liefert rohe Dokumente — spaetere Felder beim Lesen coalescen
 * (`bundle ?? DEFAULT_HOUSEHOLD_BUNDLE`, `?? []`).
 */
export interface HouseholdBundle {
  post: boolean; // one combined letter to the contact
  email: boolean; // one combined email to the contact
  inApp: boolean; // one combined in-app message to the contact
}

/** Post wird zusammengefasst (kostet Geld), E-Mail und In-App gehen an jede Person. */
export const DEFAULT_HOUSEHOLD_BUNDLE: HouseholdBundle = { post: true, email: false, inApp: false };

export class HouseholdModel implements OkrModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // exactly [tenantId]
  public isArchived = false;
  public index = DEFAULT_INDEX; // for search
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public name = DEFAULT_NAME; // «Familie Muster», «WG Seestrasse 4» — also the address line of a combined letter
  public type = ''; // item of the tenant's category list 'household_type'
  public memberKeys: string[] = []; // personKeys; query: memberKeys array-contains <personKey>
  public payerKey = ''; // personKey in memberKeys; '' = invoice per person
  public contactKey = ''; // personKey in memberKeys; receives a combined Versand
  public bundle: HouseholdBundle = { ...DEFAULT_HOUSEHOLD_BUNDLE };

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const HouseholdCollection = 'households'; // collection name for HouseholdModel
export const HouseholdModelName = 'household';
export const HouseholdTypeCategoryName = 'household_type'; // category list with the household types
export const HOUSEHOLD_RECIPIENT_PREFIX = 'household.'; // recipient key prefix, like 'person.' / 'group.'
