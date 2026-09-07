import { DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AddressableModel, OkrModel, SearchableModel, TaggedModel } from './base.model';
import { PrivacyUsage } from './enums/privacy-usage.enum';

export class PersonModel implements OkrModel, AddressableModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public gender = DEFAULT_GENDER;
  // ssnId/dateOfBirth/dateOfDeath/favEmail/favPhone were stripped in privacy 1.19 Phase 4:
  // ssn + dob + dod live only in the addresses vault; contact data is served by the
  // address-directory projection.
  // isDeceased + deathYear are the degraded-precision dod replicas (the dob analogue is
  // memberships.memberBirthYear): the fact and the year, never the full date, so that
  // member-facing filters and lists keep working. Always written together — deathYear is
  // '' exactly when isDeceased is false. onAddressChange is their only writer.
  public isDeceased = false;
  public deathYear = ''; // YYYY
  /**
   * Gespiegelte Tatsache aus `users`: diese Person hat einen App-Zugang. Geschrieben
   * AUSSCHLIESSLICH von `onUserWritten` (apps/functions/src/person/account-mirror.ts), nie von der
   * App.
   *
   * Existiert, weil `users` fuer gewoehnliche Benutzer nicht lesbar ist (firestore.rules), die
   * Einladung zu einem Anlass aber auf registrierte Benutzer einschraenken muss — dieselbe
   * Begruendung wie bei den `usage*`-Feldern unten.
   * Optional beim Lesen: jedes vor diesem Feld geschriebene Dokument liefert `undefined`.
   */
  public hasAccount = false;
  public favZipCode = '';
  public bexioId = DEFAULT_ID;

  // privacy preferences: how the person wants their sensitive attributes shared.
  // Read source for AppStore.getPersonPrivacySettings (persons are tenant-readable,
  // users are not). Edited via profile/admin and mirrored onto the person on save.
  public usageImages = PrivacyUsage.Public;
  public usageDateOfBirth = PrivacyUsage.Restricted;
  public usagePostalAddress = PrivacyUsage.Restricted;
  public usageEmail = PrivacyUsage.Restricted;
  public usagePhone = PrivacyUsage.Restricted;
  public usageName = PrivacyUsage.Restricted;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PersonCollection = 'persons';
export const PersonModelName = 'person';
