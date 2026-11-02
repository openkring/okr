import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, NamedModel, TaggedModel, PropertyType } from './base.model';

// ──────────────────────────────────────────
// Field-type union
// ──────────────────────────────────────────

export type FieldType =
  | 'text' | 'email' | 'number' | 'phone' | 'iban' | 'ssn' | 'password'
  | 'dropdown' | 'checkbox' | 'radio' | 'file' | 'images'
  | 'date' | 'time' | 'signature' | 'rating' | 'avatar' | 'category'
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
export interface DropdownField extends FieldBase { type: 'dropdown'; options: FieldOption[]; }
export interface CheckboxField extends FieldBase { type: 'checkbox'; options?: FieldOption[]; }
export interface RadioField extends FieldBase { type: 'radio'; options: FieldOption[]; }
export interface FileField extends FieldBase { type: 'file'; accept?: string; maxSizeMb?: number; maxCount?: number; }
export interface ImagesField extends FieldBase { type: 'images'; maxCount?: number; }
export interface DateField extends FieldBase { type: 'date'; min?: string; max?: string; }
export interface TimeField extends FieldBase { type: 'time'; min?: string; max?: string; }
export interface SignatureField extends FieldBase { type: 'signature'; }
export interface RatingField extends FieldBase { type: 'rating'; scale?: number; allowHalf?: boolean; }
export interface AvatarField extends FieldBase { type: 'avatar'; avatarType: 'person' | 'org' | 'resource'; multi?: boolean; }
// Single-select from a CategoryListModel (`categories` collection); `categoryName` is its name, the value is the item name.
export interface CategoryField extends FieldBase { type: 'category'; categoryName: string; }
// Display-only elements — no input value, never submitted. `label` holds the static text.
export interface LabelField extends FieldBase { type: 'label'; }
// A paragraph of static text (held in `label`); both flags default to true when absent.
export interface ParagraphField extends FieldBase { type: 'paragraph'; isIndented?: boolean; isSmall?: boolean; }
export interface DividerField extends FieldBase { type: 'divider'; }

export type Field =
  | TextField | EmailField | NumberField | PhoneField | IbanField | SsnField | PasswordField
  | DropdownField | CheckboxField | RadioField | FileField | ImagesField
  | DateField | TimeField | SignatureField | RatingField | AvatarField | CategoryField
  | LabelField | ParagraphField | DividerField;

// ──────────────────────────────────────────
// Submission target
// ──────────────────────────────────────────

export type SubmissionTarget =
  | { kind: 'collection'; mappingKey: string; modelType: string; collectionName: string }
  | { kind: 'url'; url: string };

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

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}
