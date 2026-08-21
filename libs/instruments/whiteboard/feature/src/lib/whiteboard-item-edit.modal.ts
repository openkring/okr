import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonButton, IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { WhiteboardItem } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { WhiteboardItemForm } from '@okr/instruments-whiteboard-ui';
import { WHITEBOARD_I18N_KEYS, WhiteboardI18n } from '@okr/instruments-whiteboard-util';
import { dismissOverlay } from '@okr/shared-util-angular';

/**
 * Per-item editor modal: edits a clone of one sticker/label (text + colour) and can delete it. Edits
 * never touch the live board array, so the live Firestore stream keeps the board fresh underneath
 * (the grid instruments' D4 anti-pattern). Returns the edited item via `dismiss(item, 'confirm')`,
 * a deletion via `dismiss(null, 'delete')`; the store merges the result into the latest board.
 */
@Component({
  selector: 'okr-whiteboard-item-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, WhiteboardItemForm, SvgIconPipe, IonContent, IonButton, IonIcon],
  styles: [`.delete-bar { display: flex; justify-content: flex-end; padding: 8px 12px; }`],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (itemData(); as item) {
        <okr-whiteboard-item-form
          [item]="item"
          (itemChange)="onItemChange($event)"
          [readOnly]="isReadOnly()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
        />
      }
      @if (!isReadOnly()) {
        <div class="delete-bar">
          <ion-button color="danger" fill="clear" (click)="remove()">
            <ion-icon slot="start" src="{{ 'trash' | svgIcon }}" />
            {{ i18n.as_delete() }}
          </ion-button>
        </div>
      }
    </ion-content>
  `,
})
export class WhiteboardItemEditModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(WHITEBOARD_I18N_KEYS) as WhiteboardI18n;

  public readonly item = input.required<WhiteboardItem>();
  public readonly readOnly = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  public itemData = linkedSignal(() => safeStructuredClone(this.item()));

  protected readonly headerTitle = computed(() => this.isReadOnly() ? this.i18n.view_label() : this.i18n.edit_label());
  protected readonly showConfirmation = computed(() => this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.itemData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.itemData.set(safeStructuredClone(this.item()));
  }

  public async remove(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'delete');
  }

  protected onItemChange(item: WhiteboardItem): void {
    this.itemData.set(item);
  }
}
