import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, NamedModel, TaggedModel, PropertyType, BaseType } from './base.model';

// ──────────────────────────────────────────
// Field-type union
// ──────────────────────────────────────────

export type FieldType =
  | 'text' | 'email' | 'number' | 'phone' | 'iban' | 'ssn' | 'password'
  | 'dropdown' | 'checkbox' | 'radio' | 'file' | 'images'
  | 'date' | 'time' | 'signature' | 'rating' | 'avatar' | 'category'
  | 'implicit' | 'course'
  | 'person' | 'org' | 'resource'
  | 'label' | 'paragraph' | 'divider';

export interface FieldOption { label: string; value: string; }

// ──────────────────────────────────────────
// Conditions (1.125) — a field is shown only when its VisibilityRule holds
// ──────────────────────────────────────────

export type ConditionOp =
  | 'equals' | 'notEquals' | 'in' | 'notIn'          // choice fields, text, number
  | 'isChecked' | 'isNotChecked'                      // single checkbox
  | 'contains' | 'notContains'                        // checkbox with options
  | 'lt' | 'lte' | 'gt' | 'gte' | 'between'           // number, date (StoreDate compare)
  | 'ageGte' | 'ageLt'                                // date: age by year of birth (getAge)
  | 'isFilled' | 'isEmpty';                           // any input field

export interface FieldCondition {
  /** The controlling field's `id` (stable), NOT its `key`. Only fields with a lower `order`. */
  fieldId: string;
  op: ConditionOp;
  /** Absent for isChecked/isFilled/…; [from, to] for between. */
  value?: string | number | string[];
}

export interface VisibilityRule {
  match: 'all' | 'any';
  /** At least one condition. */
  conditions: FieldCondition[];
}

export interface FieldBase {
  id: string;
  key: string;
  label: string;
  helpText?: string;
  placeholder?: string;
  required: boolean;
  /** Hidden means absent: not required, not validated, not stored (client and server). */
  visibleIf?: VisibilityRule;
  /** Store the answer in the target's typed `properties` list instead of a top-level key; `key` becomes the property key. */
  asProperty?: boolean;
  /** Read-only when the value came from the link (pre-filled via query parameter, §8). */
  lockWhenPrefilled?: boolean;
  width: 'full' | 'half' | 'third';
  order: number;
}

export interface TextField extends FieldBase { type: 'text'; multiline?: boolean; minLength?: number; maxLength?: number; pattern?: string; }
export interface EmailField extends FieldBase { type: 'email'; }
export interface NumberField extends FieldBase { type: 'number'; min?: number; max?: number; step?: number; integer?: boolean; }
export interface PhoneField extends FieldBase { type: 'phone'; region?: string; }
export interface IbanField extends FieldBase { type: 'iban'; countryWhitelist?: string[]; }
// A Swiss AHV number (AHVN13), validated by its EAN-13 check digit and stored in the electronic
// 13-digit format. Never a typed property, and never copied out of the target record (privacy 1.19).
export interface SsnField extends FieldBase { type: 'ssn'; }
export interface PasswordField extends FieldBase { type: 'password'; minLength?: number; requireUppercase?: boolean; requireNumber?: boolean; requireSymbol?: boolean; }
/** The reserved value stored when the filler picks «Andere …» (§9); the free text goes to `<key>Other`. */
export const OTHER_OPTION_VALUE = 'other';

// `allowOther` (dropdown, radio, checkbox with options): adds a final «Andere …» choice with a text input (§9).
export interface DropdownField extends FieldBase { type: 'dropdown'; options: FieldOption[]; allowOther?: boolean; }
export interface CheckboxField extends FieldBase { type: 'checkbox'; options?: FieldOption[]; allowOther?: boolean; }
export interface RadioField extends FieldBase { type: 'radio'; options: FieldOption[]; allowOther?: boolean; }
export interface FileField extends FieldBase { type: 'file'; accept?: string; maxSizeMb?: number; maxCount?: number; }
export interface ImagesField extends FieldBase { type: 'images'; maxCount?: number; }
export interface DateField extends FieldBase { type: 'date'; min?: string; max?: string; }
export interface TimeField extends FieldBase { type: 'time'; min?: string; max?: string; }
export interface SignatureField extends FieldBase { type: 'signature'; }
export interface RatingField extends FieldBase { type: 'rating'; scale?: number; allowHalf?: boolean; }
export interface AvatarField extends FieldBase { type: 'avatar'; avatarType: 'person' | 'org' | 'resource'; multi?: boolean; }
// Single-select from a CategoryListModel (`categories` collection); `categoryName` is its name, the value is the item name.
export interface CategoryField extends FieldBase { type: 'category'; categoryName: string; }
// A value the filler never sees (§8.1): set by the section's `implicitValues`, else `defaultValue`, and, only when
// `fromLink`, by a query parameter of the form link. Never rendered, never required. Stored with the answers
// (top level, or as a typed property when `asProperty`, then typed by `valueType`).
export interface ImplicitField extends FieldBase {
  type: 'implicit';
  valueType: PropertyType;
  defaultValue?: BaseType;
  /** Accept the value from the link's query parameter; false = the server ignores any client value. */
  fromLink?: boolean;
}
/** The field types that pick a person, an organisation or a resource by name. */
export type ModelSelectFieldType = 'person' | 'org' | 'resource';
/** The suffix of the key that holds the okey of a record picked from the list: `<key>Key` (like `<key>Other`, §9). */
export const MODEL_SELECT_KEY_SUFFIX = 'Key';
// Pick a person, organisation or resource by name. The answer is the display NAME (text, as in a mail or a
// text field); when it was picked from the list, the record's okey travels as `<key>Key`. With `allowCustom`
// the filler may type a name that is not in the list (as in the Logbuch), and then there is no `<key>Key`.
// Orgs and resources are listed for anonymous fillers too (`getFormDefinition`, their names are public);
// persons only for a signed-in filler — an anonymous one always types the name.
export interface ModelSelectField extends FieldBase {
  type: ModelSelectFieldType;
  /** the org type / resource type the list is limited to (e.g. 'club', 'rboat'); '' or absent = all */
  filter?: string;
  /** the filler may type a name that is not in the list */
  allowCustom?: boolean;
}
// Display-only elements — no input value, never submitted. `label` holds the static text.
/** Course choice (spec 1.152): at most one per form, only on applications.* mappings, field key `courseKey`. */
export interface CourseField extends FieldBase {
  type: 'course';
  /** key of the derived value that holds the applicant type, usually 'applicationAs' */
  audienceFrom: string;
}
export interface LabelField extends FieldBase { type: 'label'; }
// A paragraph of static text (held in `label`); both flags default to true when absent.
export interface ParagraphField extends FieldBase { type: 'paragraph'; isIndented?: boolean; isSmall?: boolean; }
export interface DividerField extends FieldBase { type: 'divider'; }

export type Field =
  | TextField | EmailField | NumberField | PhoneField | IbanField | SsnField | PasswordField | ImplicitField
  | DropdownField | CheckboxField | RadioField | FileField | ImagesField
  | DateField | TimeField | SignatureField | RatingField | AvatarField | CategoryField | CourseField
  | ModelSelectField
  | LabelField | ParagraphField | DividerField;

// ──────────────────────────────────────────
// Submission target
// ──────────────────────────────────────────

export type SubmissionTarget =
  | { kind: 'collection'; mappingKey: string; modelType: string; collectionName: string }
  | { kind: 'url'; url: string }
  /** Nothing is stored: `submitForm` only mails the answers to the form section's `emailAddresses`
   *  (and opens its responsibility task, if any) — e.g. a website contact form. */
  | { kind: 'mail' };

// ──────────────────────────────────────────
// Form mapping — whitelists a Firestore collection as a submission target
// ──────────────────────────────────────────

export interface FormMapping {
  mappingKey: string;
  label: string;
  modelType: string;
  collectionName: string;
  includedFields?: string[];
  defaults?: Record<string, unknown>;
  /** Name of the typed-properties list on the target model (`'properties'` for application mappings); only mappings with it offer properties. */
  propertiesField?: string;
}

// ──────────────────────────────────────────
// Derived values (1.125) — server-derived from earlier answers, first matching case wins
// ──────────────────────────────────────────

export interface DerivedValue {
  /** Target key in the stored record. */
  key: string;
  cases: { when: VisibilityRule; value: string }[];
  otherwise?: string;
  /** Store in `properties` instead of at the top level. */
  asProperty?: boolean;
  /** Required when `asProperty`. */
  type?: PropertyType;
}

// ──────────────────────────────────────────
// Confirmation text (§10) — the first variant whose rule holds replaces the default text
// ──────────────────────────────────────────

export interface ConfirmationVariant { when: VisibilityRule; message: string; }

// ──────────────────────────────────────────
// Form definition model
// ──────────────────────────────────────────

export const FormDefinitionCollection = 'formDefinitions';
export const FormDefinitionModelName = 'formDefinition';

export class FormDefinitionModel implements OkrModel, NamedModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public formKey = '';
  public honeypotKey = '';
  public encryptionSalt = '';
  public encryptionKeyHash = '';
  public pdfTemplateId = '';
  public description = '';
  public target: SubmissionTarget = { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' };
  public fields: Field[] = [];
  public derivedValues: DerivedValue[] = [];
  public version = 1;
  public createdAt = '';
  public updatedAt = '';
  public createdBy = '';
  public fillerHelpText = '';  // form-specific paragraph in the filler's (i) help
  public confirmationMessage = '';                    // §10 — '' = today's default thank-you text
  public confirmationVariants: ConfirmationVariant[] = [];   // §10 — first matching variant wins
  public sendFillerConfirmation = false;              // §10 — mail to the filler's e-mail field
  public isOpen = true;                               // §11 — false = closed
  public closesAt = '';                               // §11 — StoreDate, '' = no date (Europe/Zurich day)
  public maxResponses = 0;                            // §11 — 0 = unlimited
  public showRemaining = false;                       // §11 — «Noch 3 Plätze frei»
  public closedMessage = '';                          // §11 — '' = «Dieses Formular nimmt keine Antworten mehr an.»
  public showCaptcha = false;                         // §10.5 — App Check required for every answer, with or without a page

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

// ──────────────────────────────────────────
// Form stats (§4.5, §11) — the counter of accepted responses; CF-only write, client read for authors.
// Not on the definition: the builder saves definitions with `updateModel` (a merge of the whole client
// object), which would write back a stale count. Holds no personal data.
// ──────────────────────────────────────────

export const FormStatsCollection = 'formStats';

/** Document id: `<formOkey>` or, when the section sets its own limit, `<formOkey>__<sectionOkey>`. */
export interface FormStatsModel {
  tenants: string[];
  responseCount: number;
}
