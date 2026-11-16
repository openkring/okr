// libs/content/pdf-template/ui/src/lib/versand-address-list.ts
import { Component, computed, input, output, signal } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmailInput, EmailInputI18n } from '@okr/shared-ui';
import { copyToClipboard } from '@okr/shared-util-angular';
import { parseEmails } from '@okr/content-pdf-template-util';

/**
 * One recipient field of the Verteiler (To:, Cc:, Bcc:): each address on its own line, each with a copy icon
 * and — when removable — a remove icon. Editable, below the list an email field with a + button adds the
 * typed address (also on Enter). The parent owns the list and decides what an add or remove means: a
 * Versand's Bcc is removable but not editable, its addresses come from the Zustellung.
 */
@Component({
  selector: 'okr-versand-address-list',
  standalone: true,
  imports: [SvgIconPipe, EmailInput, IonList, IonItem, IonLabel, IonIcon, IonButton],
  styles: [`
    .add-row { display: flex; align-items: center; gap: 4px; padding-right: 8px; }
    .add-row okr-email { flex: 1; min-width: 0; }
  `],
  template: `
    <ion-list lines="full">
      @for (address of addresses(); track address) {
        <ion-item>
          <ion-label>{{ address }}</ion-label>
          <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="copyLabel()" (click)="copy(address)">
            <ion-icon slot="icon-only" src="{{ 'copy' | svgIcon }}" />
          </ion-button>
          @if (isRemovable()) {
            <ion-button slot="end" fill="clear" color="medium" [attr.aria-label]="removeLabel()" (click)="removed.emit(address)">
              <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
            </ion-button>
          }
        </ion-item>
      }
    </ion-list>
    @if (editable()) {
      <div class="add-row" (keyup.enter)="add()">
        <okr-email [i18n]="emailI18n()" [value]="draft()" (valueChange)="draft.set($event)"
          [readOnly]="false" [copyable]="false" [showHelper]="false" />
        <ion-button fill="clear" [disabled]="draft().trim().length === 0" [attr.aria-label]="addLabel()" (click)="add()">
          <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
        </ion-button>
      </div>
    }
  `,
})
export class VersandAddressList {
  public readonly addresses = input.required<string[]>();
  public readonly editable = input(true);
  /** Each line can be removed (default: when editable). */
  public readonly removable = input<boolean | undefined>(undefined);
  /** The field name ('To:', 'Cc:', 'Bcc:'), for screen readers only: the field shows the placeholder. */
  public readonly label = input('');
  public readonly placeholder = input('');
  public readonly removeLabel = input('');
  public readonly addLabel = input('');
  public readonly copyLabel = input('');

  /** The addresses typed into the field, already parsed and normalised; may hold known ones. */
  public readonly added = output<string[]>();
  public readonly removed = output<string>();
  /** An address was copied to the clipboard (the parent confirms it). */
  public readonly copied = output<string>();

  protected readonly draft = signal('');
  protected readonly isRemovable = computed(() => this.removable() ?? this.editable());
  /** No visible label: the accordion header names the field, the placeholder shows the format. */
  protected readonly emailI18n = computed((): EmailInputI18n => ({ name: this.label(), label: '', placeholder: this.placeholder() }));

  /** Copies right in the click handler: iOS refuses a clipboard write outside the user gesture. */
  protected async copy(address: string): Promise<void> {
    await copyToClipboard(address);
    this.copied.emit(address);
  }

  protected add(): void {
    const typed = parseEmails(this.draft());
    this.draft.set('');
    if (typed.length > 0) this.added.emit(typed);
  }
}
