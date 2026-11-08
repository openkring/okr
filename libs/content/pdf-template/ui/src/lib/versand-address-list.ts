// libs/content/pdf-template/ui/src/lib/versand-address-list.ts
import { Component, input, output } from '@angular/core';
import { IonIcon, IonInput, IonItem, IonLabel, IonList } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { parseEmails } from '@okr/content-pdf-template-util';

/**
 * One recipient field of the Verteiler (To, CC, BCC): each address on its own line. Editable, every line
 * has a remove icon and an input below adds one or several addresses (comma or semicolon separated) on
 * Enter or when the input loses focus. The parent owns the list and decides what an add or remove means.
 */
@Component({
  selector: 'okr-versand-address-list',
  standalone: true,
  imports: [SvgIconPipe, IonList, IonItem, IonLabel, IonIcon, IonInput],
  template: `
    <ion-list lines="full">
      @for (address of addresses(); track address) {
        <ion-item>
          <ion-label>{{ address }}</ion-label>
          @if (editable()) {
            <ion-icon slot="end" src="{{ 'cancel' | svgIcon }}" [attr.aria-label]="removeLabel()" (click)="removed.emit(address)" />
          }
        </ion-item>
      }
      @if (editable()) {
        <ion-item lines="none">
          <ion-input #addInput [value]="''" type="email" inputmode="email" autocomplete="off"
            [placeholder]="placeholder()" [attr.aria-label]="label()"
            (keyup.enter)="add(addInput)" (ionChange)="add(addInput)" />
        </ion-item>
      }
    </ion-list>
  `,
})
export class VersandAddressList {
  public readonly addresses = input.required<string[]>();
  public readonly editable = input(true);
  /** The field name, for screen readers ('To:', 'CC:', 'BCC:'). */
  public readonly label = input('');
  public readonly placeholder = input('');
  public readonly removeLabel = input('');

  /** The addresses typed into the input, already parsed and normalised; may hold known ones. */
  public readonly added = output<string[]>();
  public readonly removed = output<string>();

  protected add(field: IonInput): void {
    const typed = parseEmails(String(field.value ?? ''));
    field.value = '';
    if (typed.length > 0) this.added.emit(typed);
  }
}
