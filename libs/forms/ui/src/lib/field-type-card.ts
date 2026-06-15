import { Component, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { FieldType } from '@bk2/shared-models';

export interface FieldTypeDef {
  type: FieldType;
  label: string;
  icon: string;
  description: string;
}

export const FIELD_TYPE_DEFS: FieldTypeDef[] = [
  { type: 'text',      label: 'Text',      icon: 'text',         description: 'Single- or multi-line text input' },
  { type: 'email',     label: 'Email',     icon: 'mail',         description: 'Email address with RFC 5322 validation' },
  { type: 'number',    label: 'Number',    icon: 'calendar-number',   description: 'Numeric input with min/max/step' },
  { type: 'phone',     label: 'Phone',     icon: 'tel',         description: 'International phone number (E.164)' },
  { type: 'iban',      label: 'IBAN',      icon: 'account',         description: 'Bank account number (ISO 13616)' },
  { type: 'password',  label: 'Password',  icon: 'lock-closed',  description: 'Masked input — stored as hash only' },
  { type: 'dropdown',  label: 'Dropdown',  icon: 'chevron-down', description: 'Single-select from a list of options' },
  { type: 'checkbox',  label: 'Checkbox',  icon: 'checkbox',     description: 'Boolean or multi-select checkboxes' },
  { type: 'radio',     label: 'Radio',     icon: 'radio-button-on', description: 'Single-select radio group' },
  { type: 'file',      label: 'File',      icon: 'upload',       description: 'File upload (stored in bucket)' },
  { type: 'images',    label: 'Images',    icon: 'image',        description: 'Image upload (imgix URLs)' },
  { type: 'date',      label: 'Date',      icon: 'calendar',     description: 'Date picker (YYYYMMDD)' },
  { type: 'time',      label: 'Time',      icon: 'time',         description: 'Time-of-day picker (HH:mm)' },
  { type: 'signature', label: 'Signature', icon: 'shield',       description: 'Client-side signature capture' },
  { type: 'rating',    label: 'Rating',    icon: 'star',         description: 'Star rating (1–5 by default)' },
  { type: 'avatar',    label: 'Avatar',    icon: 'person',       description: 'Select person/org/resource (auth only)' },
  { type: 'label',     label: 'Label',     icon: 'info-circle', description: 'Static text — no input, not submitted' },
  { type: 'divider',   label: 'Divider',   icon: 'remove',       description: 'Visual separator line' },
];

@Component({
  selector: 'bk-field-type-card',
  standalone: true,
  imports: [SvgIconPipe, IonCard, IonCardContent, IonIcon, IonLabel],
  styles: [`
    ion-card { margin: 4px; cursor: grab; }
    ion-card-content { display: flex; align-items: center; gap: 8px; padding: 8px; }
    ion-icon { font-size: 20px; flex-shrink: 0; }
    .desc { font-size: 11px; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-card (click)="add.emit(def())">
      <ion-card-content>
        <ion-icon src="{{ def().icon | svgIcon }}" />
        <div>
          <ion-label>{{ def().label }}</ion-label>
          <div class="desc">{{ def().description }}</div>
        </div>
      </ion-card-content>
    </ion-card>
  `,
})
export class FieldTypeCard {
  public readonly def = input.required<FieldTypeDef>();
  public readonly add = output<FieldTypeDef>();
}
