import { DEFAULT_DATE, DEFAULT_DATETIME, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { NamedModel, OkrModel, SearchableModel, TaggedModel } from './base.model';
import { MoneyModel } from './money.model';

/**
 * Trainings-Kurse (spec 1.132): ein Kurs fasst die Termine einer Gruppen-Kalenderreihe zusammen
 * (`CalEventModel.courseKey`), fuehrt die Anwesenheit und erzeugt die Meldung (J+S) sowie die
 * Trainerentschaedigung.
 */

/** Anwesenheit einer Person an einem Termin. */
export type AttendancePresence = 'present' | 'absent' | 'excused';
/** Funktion der Person an diesem Termin (J+S: Leiter/in oder Teilnehmer/in). */
export type AttendanceFunction = 'leader' | 'participant';

/**
 * Ein Eintrag in `CalEventModel.attendance` (Schluessel = personKey). Eine Map statt einer
 * Array-Erweiterung von `attendees[]`, damit ein Eintrag per Feldpfad einzeln schreibbar ist.
 */
export type AttendanceEntry = {
  person: AvatarInfo;
  presence: AttendancePresence;
  function: AttendanceFunction;
  by: string; // personKey of whoever wrote it
  at: string; // StoreDateTime
};

/** Meldeprofil eines Kurses: 'none' = keine Meldung, 'generic' = allgemeine Tabelle, 'js' = Jugend+Sport. */
export type ReportProfile = 'none' | 'generic' | 'js';
/** J+S-Benutzergruppe der Kursmeldung. */
export type JsUserGroup = '1' | '2' | '4' | '5';

/** Profilparameter fuer `reportProfile === 'js'` (spec 1.132 §9.2). */
export type JsReportSettings = {
  courseNumber: string;
  userGroup: JsUserGroup;
  mainSportCategory: 'abs1' | 'abs2';
};

/**
 * Lesbar fuer alle, die die Gruppe sehen (Trainierende brauchen Name, Zeitraum, Trainer).
 * KEINE Betraege — die stehen im geschuetzten Unterdokument `finance/settings` (`CourseFinanceModel`).
 *
 * ACHTUNG beim Lesen: Firestore liefert rohe Dokumente, dieser Initialisierer laeuft dabei NICHT.
 * Fuer Felder, die erst spaeter dazukamen, immer coalescen (`?? ''`, `?? {}`).
 */
export class CourseModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // tenant IDs that this model belongs to
  public isArchived = false; // whether the model is archived
  public name = DEFAULT_NAME; // a meaningful name for the course
  public index = DEFAULT_INDEX; // for search
  public tags = DEFAULT_TAGS; // tags for searching and filtering
  public notes = DEFAULT_NOTES;

  public groupKey = DEFAULT_KEY; // okey of the training group (orgModelType 'group')
  public startDate = DEFAULT_DATE; // StoreDate, first day of the course (inclusive)
  public endDate = DEFAULT_DATE; // StoreDate, last day of the course (inclusive)

  public responsiblePersons: AvatarInfo[] = []; // the first one receives the task at the end of the course
  public trainers: AvatarInfo[] = []; // may confirm the attendance

  /**
   * Server-maintained mirror of `trainers[].key` + `responsiblePersons[].key`, so firestore.rules can test
   * trainership with `in` (pattern `GroupModel.adminKeys`). Never write from the client.
   * Optional on read: absent until the maintaining trigger has run.
   */
  public trainerKeys: string[] = [];
  /**
   * Server-maintained mirror of `responsiblePersons[].key` alone. Gates the finance sub-document
   * (`CourseFinanceModel`), which trainers must NOT read. Never write from the client.
   * Optional on read: absent until the maintaining trigger has run.
   */
  public responsibleKeys: string[] = [];

  public reportProfile: ReportProfile = 'generic'; // reporting profile; optional on read → `?? 'generic'`
  /**
   * Profile parameters; for 'js' see `JsReportSettings`. Partial because they are filled in step by step
   * before the report. Optional on read → `?? {}`.
   */
  public reportSettings: Partial<JsReportSettings> = {};
  /** `calevent_type` value → activity type of the profile ('training' → 'Training', …). Optional on read → `?? {}`. */
  public typeMapping: Record<string, string> = {};

  public isLocked = false; // frozen after the report; optional on read
  public lockedBy: AvatarInfo | undefined; // who froze the course
  public lockedAt = DEFAULT_DATETIME; // StoreDateTime

  public endTaskKey = ''; // task at the end of the course; '' = not created yet
  public reportedAt = DEFAULT_DATETIME; // StoreDateTime, optional note «gemeldet»

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const CourseCollection = 'courses'; // collection name for CourseModel
export const CourseModelName = 'course';

/** A person eligible for the trainer compensation, optionally with an own rate (else `defaultRate`). */
export type CourseEligible = { person: AvatarInfo; rate?: MoneyModel };

/**
 * Protected sub-document `courses/{courseKey}/finance/settings`. Firestore rules cannot hide fields, so the
 * amounts live in their own document, readable only by the course's responsible persons (`responsibleKeys`),
 * group admins, `roles.treasurer`, privileged and admin.
 */
export class CourseFinanceModel {
  public accountingTenantId = ''; // THE BOOKS — never derived from tenantId (accounting skill)
  public accountKey = ''; // expense account; '' → AccountingConfigModel.defaultCompensationAccountKey
  public costCenterKey = ''; // optional; '' → account default, then book default
  public defaultRate = new MoneyModel(0); // rate per led training (Rappen); `periodicity` of the MoneyModel is never read
  public eligible: CourseEligible[] = []; // persons entitled to compensation, optionally with an own rate
  public requestedAt = DEFAULT_DATETIME; // StoreDateTime of the last request
  public requestedBy?: AvatarInfo; // who made the last request
}

export const CourseFinanceSubcollection = 'finance'; // courses/{courseKey}/finance
export const CourseFinanceDocId = 'settings'; // courses/{courseKey}/finance/settings
