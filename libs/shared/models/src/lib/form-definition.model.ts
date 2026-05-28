import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, TaggedModel } from './base.model';

// ──────────────────────────────────────────
// Field-type union
// ──────────────────────────────────────────

export type FieldType =
  | 'text' | 'email' | 'number' | 'phone' | 'iban' | 'password'
  | 'dropdown' | 'checkbox' | 'radio' | 'file' | 'images'
  | 'date' | 'time' | 'signature' | 'rating' | 'avatar';

export interface FieldOption { label: string; value: string; }

export interface FieldBase {
  id: string;
  key: string;
  label: string;
  helpText?: string;
  placeholder?: string;
  required: boolean;
  visibleIf?: string;
  width: 'full' | 'half' | 'third';
  order: number;
}

export interface TextField extends FieldBase { type: 'text'; multiline?: boolean; minLength?: number; maxLength?: number; pattern?: string; }
export interface EmailField extends FieldBase { type: 'email'; }
export interface NumberField extends FieldBase { type: 'number'; min?: number; max?: number; step?: number; integer?: boolean; }
export interface PhoneField extends FieldBase { type: 'phone'; region?: string; }
export interface IbanField extends FieldBase { type: 'iban'; countryWhitelist?: string[]; }
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

export type Field =
  | TextField | EmailField | NumberField | PhoneField | IbanField | PasswordField
  | DropdownField | CheckboxField | RadioField | FileField | ImagesField
  | DateField | TimeField | SignatureField | RatingField | AvatarField;

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
}

// ──────────────────────────────────────────
// Form definition model
// ──────────────────────────────────────────

export const FormDefinitionCollection = 'formDefinitions';
export const FormDefinitionModelName = 'formDefinition';

export class FormDefinitionModel implements BkModel, NamedModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public formKey = '';
  public honeypotKey = '';
  public description = '';
  public target: SubmissionTarget = { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' };
  public fields: Field[] = [];
  public version = 1;
  public createdAt = '';
  public updatedAt = '';
  public createdBy = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}
