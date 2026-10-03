import { Component, computed, effect, input, linkedSignal, model, signal, untracked } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonLabel, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular/standalone';

import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { VideoConfig } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';
import { isVideoDocKey, parseVideoLink, videoLink } from '@okr/content-document-util';
import { getFieldErrors, SectionErrors, SectionI18n } from '@okr/cms-section-util';

@Component({
  selector: 'okr-video-config',
  standalone: true,
  imports: [
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonSegment, IonSegmentButton, IonLabel,
    TextInput,
    ErrorNote
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ cardTitle() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <ion-segment [value]="source()" (ionChange)="onSourceChange($event.detail.value)" [disabled]="isReadOnly()">
                  <ion-segment-button value="youtube"><ion-label>{{ i18n().video_source_youtube() }}</ion-label></ion-segment-button>
                  <ion-segment-button value="album"><ion-label>{{ i18n().video_source_album() }}</ion-label></ion-segment-button>
                </ion-segment>
              </ion-col>
            </ion-row>
            @if (source() === 'album') {
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="albumLinkI18n()" [value]="linkText()" (valueChange)="onLinkChange($event)" [maxLength]=300 [readOnly]="isReadOnly()" [showHelper]=true />
                  @if (linkEmpty()) {
                    <okr-error-note [errors]="[i18n().video_albumLink_required()]" />
                  } @else if (linkInvalid() || errorsFor('documentKey').length > 0) {
                    <okr-error-note [errors]="[i18n().video_albumLink_error()]" />
                  }
                </ion-col>
              </ion-row>
            } @else {
            <ion-row>
              <ion-col size="12">
                <okr-text-input [i18n]="youtubeIdI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />
                <okr-error-note [errors]="errorsFor('url')" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="widthI18n()" [value]="width()" (valueChange)="onFieldChange('width', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />
                <okr-error-note [errors]="errorsFor('width')" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="heightI18n()" [value]="height()" (valueChange)="onFieldChange('height', $event)" [maxLength]=11 [readOnly]="isReadOnly()" [showHelper]=true />
                <okr-error-note [errors]="errorsFor('height')" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="frameborderI18n()" [value]="frameborder()" (valueChange)="onFieldChange('frameborder', $event)" [maxLength]=4 [readOnly]="isReadOnly()" [showHelper]=true />
                <okr-error-note [errors]="errorsFor('frameborder')" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="baseUrlI18n()" [value]="baseUrl()" (valueChange)="onFieldChange('baseUrl', $event)" [maxLength]=100 [readOnly]="isReadOnly()" [showHelper]=true />
                <okr-error-note [errors]="errorsFor('baseUrl')" />
              </ion-col>
            </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
    `
})
export class VideoConfiguration {
  // inputs
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  public formData = model.required<VideoConfig>();
  public title = input<string>();
  public readonly readOnly = input(true);
  /** App origins (AppStore.appLinkOrigins): [0] builds the shown link, every one is accepted when pasted. */
  public readonly linkOrigins = input<string[]>([]);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly i18n = input.required<SectionI18n>();

  // linked signals (fields)
  protected url = linkedSignal(() => this.formData().url ?? '');
  protected width = linkedSignal(() => this.formData().width ?? '100%');
  protected height = linkedSignal(() => this.formData().height ?? 'auto');
  protected frameborder = linkedSignal(() => this.formData().frameborder ?? '0');
  protected baseUrl = linkedSignal(() => this.formData().baseUrl ?? 'https://www.youtube.com/embed/');
  protected documentKey = computed(() => this.formData().documentKey ?? '');   // legacy docs: undefined
  /** which source the editor shows; an empty album key still keeps the album tab open */
  protected source = signal<'youtube' | 'album'>('youtube');
  /** the pasted text; seeded once from the stored key, edits flow one way into documentKey */
  protected linkText = signal('');
  protected linkInvalid = signal(false);
  protected linkEmpty = computed(() => this.source() === 'album' && this.linkText().trim() === '');
  /** changes when a different section is loaded; re-seeds the source and link */
  public readonly resetKey = input<string>('');
  constructor() {
    effect(() => {
      this.resetKey();
      const key = untracked(() => this.documentKey());
      untracked(() => {
        this.source.set(key !== '' ? 'album' : 'youtube');
        const origin = this.linkOrigins()[0] ?? '';
        this.linkText.set(key !== '' ? (origin ? videoLink(origin, key) : key) : '');
        this.linkInvalid.set(false);
      });
    });
  }

  protected cardTitle = computed(() => this.title() ?? this.i18n().video_edit);

  protected youtubeIdI18n = computed(() => ({
    name: 'youtubeId',
    label: this.i18n().video_youtubeId_label(),
    placeholder: this.i18n().video_youtubeId_placeholder(),
    helper: this.i18n().video_youtubeId_helper(),
  } as TextInputI18n));

  protected widthI18n = computed(() => ({
    name: 'width',
    label: this.i18n().video_width_label(),
    placeholder: this.i18n().video_width_placeholder(),
    helper: this.i18n().video_width_helper(),
  } as TextInputI18n));

  protected heightI18n = computed(() => ({
    name: 'height',
    label: this.i18n().video_height_label(),
    placeholder: this.i18n().video_height_placeholder(),
    helper: this.i18n().video_height_helper(),
  } as TextInputI18n));

  protected frameborderI18n = computed(() => ({
    name: 'frameborder',
    label: this.i18n().video_frameborder_label(),
    placeholder: this.i18n().video_frameborder_placeholder(),
    helper: this.i18n().video_frameborder_helper(),
  } as TextInputI18n));

  protected baseUrlI18n = computed(() => ({
    name: 'baseUrl',
    label: this.i18n().video_baseUrl_label(),
    placeholder: this.i18n().video_baseUrl_placeholder(),
    helper: this.i18n().video_baseUrl_helper(),
  } as TextInputI18n));

  protected albumLinkI18n = computed(() => ({
    name: 'albumLink',
    label: this.i18n().video_albumLink_label(),
    placeholder: this.i18n().video_albumLink_placeholder(),
    helper: this.i18n().video_albumLink_helper(),
  } as TextInputI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onSourceChange(value: string | number | undefined): void {
    const next = value === 'album' ? 'album' : 'youtube';
    if (next === this.source()) return;
    this.source.set(next);
    this.linkInvalid.set(false);
    if (next === 'youtube' && this.documentKey() !== '') this.onFieldChange('documentKey', '');
  }

  /** accepts the player's copied link or a bare key; unparseable non-empty input keeps documentKey as is */
  protected onLinkChange(value: string): void {
    const text = (value ?? '').trim();
    this.linkText.set(value ?? '');
    if (text === '') {
      this.linkInvalid.set(false);
      this.onFieldChange('documentKey', '');
      return;
    }
    const key = parseVideoLink(text, this.linkOrigins()) ?? (isVideoDocKey(text) ? text : '');
    this.linkInvalid.set(key === '');
    if (key !== '') this.onFieldChange('documentKey', key);
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
