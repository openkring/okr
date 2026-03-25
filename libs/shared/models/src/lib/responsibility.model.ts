import { DEFAULT_DATE, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { AvatarInfo } from './avatar-info';
import { BkModel, NamedModel, SearchableModel } from './base.model';

export class ResponsibilityModel implements BkModel, SearchableModel, NamedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public notes = DEFAULT_NOTES;

  public name = DEFAULT_NAME; // human readable description of the 

  // examples:   infra_rental / Clubareal Vermietung
  //             keys / Schlüsselverwaltung            (Bestellung)         
  //             president / Präsident                   person
  //             treasurer / Kassier                     person
  //             board / Vorstand                        group
  //             boat_comm / Bootskommission             group
  // 
  //             skiff_depot_rental / Skifflagerplatz
  //             admission_a / Mitgliederbewirtschaftung   (Antrag/Anmeldung)
  //             admission_k / Beitritt als Kandidierende    (Antrag/Anmeldung)
  //             admission_j / Beitritt als Jugendliche      (Antrag/Anmeldung)
  //             course_k    / Einsteigerkurse               (Antrag/Anmeldung)
  //             course_j    / Kurse Jugendliche

  public responsibleAvatar: AvatarInfo | undefined;   // Person or Group

  public delegateAvatar?: AvatarInfo;     // Person or Group, nullable
  public delegateValidFrom = DEFAULT_DATE;
  public delegateValidTo = DEFAULT_DATE;

  public validFrom = DEFAULT_DATE;
  public validTo = DEFAULT_DATE;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ResponsibilityCollection = 'responsibilities';
export const ResponsibilityModelName = 'responsibility';
