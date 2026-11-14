import { Component, computed, inject, input, signal } from '@angular/core';
import { IonButton, IonContent, ModalController } from '@ionic/angular';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

/** A photo or clip of the journal the author may pick: its image key and a readable name. */
export interface PickablePhoto { key: string; label: string }

export interface JournalPhotoPickI18n { title: string; newItems: string; empty: string; cancel: string; save: string }

/**
 * Picks photos or clips of a journal for a section (spec 1.154 §2 «Photo picker»): a grid of the journal's photos,
 * a tap selects (several: toggles, one: dismisses at once), the change-confirmation bar dismisses with the selected keys
 * in tap order and role 'confirm'. «Neue Fotos» runs `importItems` — called inside the tap, so the browser's file
 * dialog opens — and dismisses with the imported keys. Presentational: the journal resolves the thumbnails
 * (`thumbnailUrl`, read in the template so a url that arrives later still shows) and does the import.
 */
@Component({
  selector: 'okr-journal-photo-pick-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, IonContent, IonButton],
  styles: [`
    .actions { padding: 8px 12px 0; }
    .status, .empty { margin: 8px 12px; color: var(--ion-color-medium); font-size: 0.9rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; padding: 12px; }
    .tile { position: relative; aspect-ratio: 1; padding: 0; border: 3px solid transparent; border-radius: 6px; overflow: hidden;
      background: var(--ion-color-light); cursor: pointer; }
    .tile.selected { border-color: var(--ion-color-primary); }
    .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tile .name { position: absolute; inset: auto 0 0 0; padding: 2px 4px; font-size: 0.7rem; color: var(--ion-color-medium); }
    .tile .badge { position: absolute; top: 4px; right: 4px; min-width: 22px; height: 22px; border-radius: 11px; line-height: 22px;
      font-size: 0.8rem; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); text-align: center; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().title }" [isModal]="true" />
    @if (multiple() && selected().length > 0) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="selected.set([])" (saveClicked)="save()" />
    }
    <ion-content>
      <div class="actions">
        <ion-button expand="block" fill="outline" [disabled]="importing()" (click)="importNew()">{{ i18n().newItems }}</ion-button>
      </div>
      @if (status(); as text) {
        <p class="status">{{ text }}</p>
      }
      @if (photos().length === 0) {
        <p class="empty">{{ i18n().empty }}</p>
      } @else {
        <div class="grid">
          @for (photo of photos(); track photo.key) {
            <button type="button" class="tile" [class.selected]="position(photo.key) > 0" [attr.aria-pressed]="position(photo.key) > 0"
              [attr.aria-label]="photo.label" (click)="toggle(photo.key)">
              @if (thumbnailUrl()(photo.key); as url) {
                <img [src]="url" [alt]="photo.label" loading="lazy" decoding="async" />
              } @else {
                <span class="name">{{ photo.label }}</span>
              }
              @if (multiple() && position(photo.key) > 0) {
                <span class="badge">{{ position(photo.key) }}</span>
              }
            </button>
          }
        </div>
      }
    </ion-content>
  `,
})
export class JournalPhotoPickModal {
  private readonly modalController = inject(ModalController);

  public readonly photos = input.required<PickablePhoto[]>();
  public readonly multiple = input(true);
  public readonly i18n = input.required<JournalPhotoPickI18n>();
  /** a displayable thumbnail url of an image key ('' while unknown) */
  public readonly thumbnailUrl = input.required<(key: string) => string>();
  /** imports new photos or clips and resolves to their image keys ([] when nothing was imported) */
  public readonly importItems = input.required<() => Promise<string[]>>();
  /** what the import is doing right now ('' when idle), e.g. the upload progress */
  public readonly progress = input<() => string>(() => '');

  protected readonly selected = signal<string[]>([]);
  protected readonly importing = signal(false);
  protected readonly status = computed(() => this.progress()());
  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({ cancel: this.i18n().cancel, save: this.i18n().save }));

  /** 1-based tap order of a selected key, 0 when not selected */
  protected position(key: string): number {
    return this.selected().indexOf(key) + 1;
  }

  protected toggle(key: string): void {
    if (!this.multiple()) {
      void dismissOverlay(this.modalController, [key], 'confirm');
      return;
    }
    this.selected.update((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
  }

  /** Starts the import inside the tap (the browser opens its file dialog only then). */
  protected importNew(): void {
    if (this.importing()) return;
    this.importing.set(true);
    const imported = this.importItems()();
    void imported.then((keys) => {
      this.importing.set(false);
      if (keys.length > 0) void dismissOverlay(this.modalController, this.multiple() ? [...this.selected(), ...keys] : keys.slice(0, 1), 'confirm');
    }, () => this.importing.set(false));
  }

  public save(): Promise<boolean> {
    return dismissOverlay(this.modalController, this.selected(), 'confirm');
  }
}
