import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AlertController, IonButton, IonChip, IonContent, IonIcon, IonLabel, ModalController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { Header } from './header';
import { PFX } from './scope';
import { I18nService, TranslatePipe } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { confirm, dismissOverlay, error, okrPrompt, TAG_EDITOR } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { AsyncPipe } from '@angular/common';

const ChipSelectStore = signalStore(
  withState({ chipName: '' }),
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    headerTitle: toSignal(
      toObservable(store.chipName).pipe(
        filter(name => name.length > 0),
        map(name => `@select.${name}`),
        switchMap(key => store.i18nService.translate(key))
      ),
      { initialValue: '' }
    ),
    labels: store.i18nService.translateAll({
      edit: PFX + 'chipSelect.edit',
      done: PFX + 'chipSelect.done',
      add: PFX + 'chipSelect.add',
      addPlaceholder: PFX + 'chipSelect.addPlaceholder',
      removeConfirm: PFX + 'chipSelect.removeConfirm',
      saveError: PFX + 'chipSelect.saveError',
      ok: '@ok',
      cancel: '@cancel',
    }),
  })),
  withMethods(store => ({
    setChipName(chipName: string): void { patchState(store, { chipName }); },
  })),
);

/**
 * Picks one chip. For an admin, when the offered chips are the values of one tag definition
 * (TAG_EDITOR), «Werte bearbeiten» switches to editing that definition's values in place —
 * add and remove, saved at once, as in AOC › Tags. Opened with `auto-height-modal`, so the box
 * is as tall as its chips.
 */
@Component({
  selector: 'okr-chip-select-modal',
  standalone: true,
  providers: [ChipSelectStore],
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    Header,
    IonContent, IonChip, IonLabel, IonButton, IonIcon
  ],
  styles: [`
    .edit { display: flex; justify-content: flex-end; margin-top: 8px; }
  `],
  template: `
    <okr-header [i18n]="{ title: store.headerTitle() }" [isModal]="true" />
    <ion-content class="ion-padding">
      @if (editing()) {
        @for (chip of values(); track chip) {
          <ion-chip color="primary" (click)="remove(chip)">
            <ion-label>{{ chip | translate | async }}</ion-label>
            <ion-icon src="{{ 'cancel' | svgIcon }}" />
          </ion-chip>
        }
        <ion-chip [outline]="true" color="primary" (click)="add()">
          <ion-icon src="{{ 'add-circle' | svgIcon }}" />
          <ion-label>{{ store.labels.add() }}</ion-label>
        </ion-chip>
      } @else {
        @for (chip of selectable(); track chip) {
          <ion-chip color="primary" (click)="select(chip)">
            <ion-label>{{ chip | translate | async }} </ion-label>
          </ion-chip>
        }
      }
      @if (tagModel()) {
        <div class="edit">
          <ion-button fill="clear" size="small" (click)="editing.set(!editing())">
            <ion-icon slot="start" src="{{ (editing() ? 'checkmark' : 'edit') | svgIcon }}" />
            {{ editing() ? store.labels.done() : store.labels.edit() }}
          </ion-button>
        </div>
      }
    </ion-content>
  `,
})
export class ChipSelectModal {
  protected readonly store = inject(ChipSelectStore);
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly tagEditor = inject(TAG_EDITOR, { optional: true });

  public chips = input.required<string[]>();
  public chipName = input.required<string>();
  /** all values on offer (comma-separated), selected ones included; identifies the tag definition */
  public allChips = input<string>('');
  /** the chips already chosen; they stay out of the selection after an edit, too */
  public selected = input<string[]>([]);

  protected editing = signal(false);
  // resolved once: after an edit the values no longer match the allChips the modal was opened with
  protected readonly tagModel = computed(() => {
    const allChips = this.allChips();
    return this.chipName() === 'tag' && allChips ? untracked(() => this.tagEditor?.editableModel(allChips)) : undefined;
  });
  protected readonly values = computed(() => {
    const model = this.tagModel();
    return model && this.tagEditor ? this.tagEditor.values(model) : this.chips();
  });
  protected readonly selectable = computed(() => this.tagModel() ? this.values().filter(v => !this.selected().includes(v)) : this.chips());

  constructor() {
    effect(() => this.store.setChipName(this.chipName()));
  }

  public async select(chip: string): Promise<boolean> {
    return await dismissOverlay(this.modalController, chip, 'confirm');
  }

  protected async add(): Promise<void> {
    const model = this.tagModel();
    if (!model || !this.tagEditor) return;
    const l = this.store.labels;
    const value = await okrPrompt(this.alertController, l.add(), l.addPlaceholder(), l.ok(), l.cancel());
    if (!value?.trim()) return;
    if (!(await this.tagEditor.add(model, value))) error(this.toastController, l.saveError());
  }

  protected async remove(chip: string): Promise<void> {
    const model = this.tagModel();
    if (!model || !this.tagEditor) return;
    const l = this.store.labels;
    const label = await firstValueFrom(this.store.i18nService.translate(chip));
    if (!(await confirm(this.alertController, fill(l.removeConfirm(), { value: label }), l.ok(), l.cancel(), true))) return;
    if (!(await this.tagEditor.remove(model, chip))) error(this.toastController, l.saveError());
  }
}
