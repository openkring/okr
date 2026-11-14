import { Component, computed, inject, input, model, signal } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonNote } from '@ionic/angular';

import { ErrorNote } from '@okr/shared-ui';
import { getFieldErrors, SECTION_TRACK_PICKER, SectionErrors, SectionI18n } from '@okr/cms-section-util';
import { JournalTrackConfig } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';

/**
 * The track card of the travel journal's section form (spec 1.154 phase 5): a summary of the chosen track and a
 * button that opens the journal's track picker (SECTION_TRACK_PICKER). The track key is never typed. Without a picker
 * (the CMS has none) the button is hidden and a hint says so.
 */
@Component({
  selector: 'okr-journal-track-config',
  standalone: true,
  imports: [IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonNote, ErrorNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().journal_track_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if (hasTrack()) {
          <p><strong>{{ i18n().journal_track_chosen() }}</strong>: {{ summary() }}</p>
        } @else {
          <p>{{ i18n().journal_track_none() }}</p>
        }
        @if (picker) {
          @if (!isReadOnly()) {
            <ion-button fill="outline" (click)="onPick()">
              {{ hasTrack() ? i18n().journal_track_change() : i18n().journal_track_pick() }}
            </ion-button>
          }
        } @else {
          <ion-note>{{ i18n().journal_track_unavailable() }}</ion-note>
        }
        <okr-error-note [errors]="errorsFor('trackKey')" />
      </ion-card-content>
    </ion-card>
  `
})
export class JournalTrackConfiguration {
  protected readonly picker = inject(SECTION_TRACK_PICKER, { optional: true });

  public readonly formData = model.required<JournalTrackConfig>();
  public readonly i18n = input.required<SectionI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});
  public readonly readOnly = input(true);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly trackKey = computed(() => this.formData().track?.trackKey ?? '');
  protected readonly hasTrack = computed(() => this.trackKey() !== '');

  /** the track just picked here, so its summary shows before the journal state knows it */
  private readonly picked = signal<{ trackKey: string; label: string } | undefined>(undefined);
  protected readonly summary = computed(() => {
    const key = this.trackKey();
    const picked = this.picked();
    return (picked?.trackKey === key ? picked.label : this.picker?.label(key)) || key;
  });

  /************************************** actions *********************************************** */
  protected async onPick(): Promise<void> {
    if (!this.picker || this.isReadOnly()) return;
    const chosen = await this.picker.pick(this.trackKey() || undefined);
    // nothing chosen (cancelled), or the same track again: no write, so the form stays clean
    if (!chosen || chosen.trackKey === this.trackKey()) return;
    this.picked.set(chosen);
    this.formData.set({ ...this.formData(), track: { trackKey: chosen.trackKey } });
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
