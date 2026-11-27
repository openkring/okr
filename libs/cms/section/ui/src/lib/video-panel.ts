import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { IonCard, IonCardContent, IonIcon, IonNote } from '@ionic/angular';

import { URL_LENGTH } from '@okr/shared-constants';
import { VIDEO_ASPECT_RATIOS, VIDEO_CONFIG_SHAPE, VideoAspectRatio, VideoConfig } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import {
  applyVideoSource, getFieldErrors, parseVideoSource, SectionErrors, SectionI18n, videoAspectRatioOf, videoSourceLink, videoSourceOf, type VideoSource,
} from '@okr/cms-section-util';

const RATIO_LABELS: Record<VideoAspectRatio, 'video_ratio_wide' | 'video_ratio_classic' | 'video_ratio_square' | 'video_ratio_portrait'> = {
  '16:9': 'video_ratio_wide', '4:3': 'video_ratio_classic', '1:1': 'video_ratio_square', '9:16': 'video_ratio_portrait',
};
const FOUND_LABELS = { youtube: 'video_found_youtube', vimeo: 'video_found_vimeo', album: 'video_found_album' } as const;

/**
 * The settings of a video: one field for the link as the editor copied it (YouTube, Vimeo or an album video, `parseVideoSource`) and
 * the format. Shown in the video editor's panel while the video is selected, and read-only in the section form. Every change sets
 * `config` once; a text that is no video clears the stored one, so the suite reports it and the section cannot be saved so.
 */
@Component({
  selector: 'okr-video-panel',
  standalone: true,
  imports: [SvgIconPipe, ErrorNote, TextInput, IonCard, IonCardContent, IonIcon, IonNote],
  styles: [`
    .field-label { display: block; margin: 0 0 6px; font-size: 0.85rem; color: var(--ion-color-medium); }
    .found { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; font-size: 0.85rem; color: var(--ion-color-success-shade); }
    .found ion-icon { font-size: 18px; }
    .note { display: block; margin-top: 8px; font-size: 0.85rem; }
    .ratios { display: flex; flex-wrap: wrap; gap: 6px; }
    .ratio { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; width: 72px; height: 76px; padding: 6px 4px;
      font: inherit; font-size: 0.75rem; color: var(--ion-text-color); background: transparent; border: 1px solid var(--ion-color-light-shade); border-radius: 8px; cursor: pointer; }
    .ratio:disabled { cursor: default; opacity: 0.6; }
    .ratio.current { border: 2px solid var(--ion-color-primary); padding: 5px 3px; }
    .ratio .frame { max-width: 44px; max-height: 36px; background: var(--ion-color-primary); border-radius: 2px; }
  `],
  template: `
    @let t = i18n();
    <ion-card>
      <ion-card-content>
        <okr-text-input [i18n]="linkI18n()" [value]="linkText()" (valueChange)="onLinkChange($event)" [maxLength]="maxLength" [readOnly]="isReadOnly()" [showHelper]="true" />
        @if (linkInvalid()) {
          <okr-error-note [errors]="[t.video_link_error()]" />
        } @else if (found(); as found) {
          <p class="found"><ion-icon src="{{ 'checkmark' | svgIcon }}" aria-hidden="true" />{{ foundLabel(found) }}</p>
        }
        @if (!linkInvalid()) {
          <okr-error-note [errors]="errorsFor('url')" />
        }
        <okr-error-note [errors]="errorsFor('documentKey')" />
        <okr-error-note [errors]="errorsFor('baseUrl')" />
      </ion-card-content>
    </ion-card>
    <ion-card>
      <ion-card-content>
        <span class="field-label" id="video-ratio-label">{{ t.video_ratio_title() }}</span>
        <div class="ratios" role="radiogroup" aria-labelledby="video-ratio-label">
          @for (ratio of ratios; track ratio) {
            <button type="button" class="ratio" role="radio" [class.current]="ratio === aspectRatio()" [attr.aria-checked]="ratio === aspectRatio()"
              [disabled]="isReadOnly()" (click)="setRatio(ratio)">
              <span class="frame" [style.aspect-ratio]="ratio.replace(':', ' / ')" [style.width]="ratio === '9:16' ? 'auto' : '44px'" [style.height]="ratio === '9:16' ? '36px' : 'auto'"></span>
              {{ ratioLabel(ratio) }}
            </button>
          }
        </div>
        <ion-note class="note">{{ t.video_ratio_helper() }}</ion-note>
        <okr-error-note [errors]="errorsFor('aspectRatio')" />
      </ion-card-content>
    </ion-card>
  `,
})
export class VideoPanel {
  // inputs
  public readonly config = input.required<VideoConfig>();
  /** App origins (AppStore.appLinkOrigins): [0] builds the shown album link, every one is accepted when pasted. */
  public readonly linkOrigins = input<string[]>([]);
  public readonly readOnly = input(true);
  /** vest field name -> messages of the running section suite */
  public readonly errors = input<SectionErrors>({});
  public readonly i18n = input.required<SectionI18n>();

  // outputs
  public readonly configChange = output<VideoConfig>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly ratios = VIDEO_ASPECT_RATIOS;
  protected readonly maxLength = URL_LENGTH;

  protected readonly stored = computed(() => videoSourceOf(this.config()));
  protected readonly aspectRatio = computed(() => videoAspectRatioOf(this.config()));
  /** the text in the field: what the editor typed while it is being typed, else the stored video as a link */
  protected readonly linkText = signal('');
  protected readonly typed = computed(() => parseVideoSource(this.linkText(), this.linkOrigins()));
  protected readonly linkInvalid = computed(() => this.linkText().trim() !== '' && this.typed() === undefined);
  protected readonly found = computed(() => this.typed()?.kind);

  protected readonly linkI18n = computed(() => ({
    name: 'videoLink',
    label: this.i18n().video_link_label(),
    placeholder: this.i18n().video_link_placeholder(),
    helper: this.i18n().video_link_helper(),
  } as TextInputI18n));

  constructor() {
    // a stored video other than the typed one (another section, undo, «Abbrechen») shows as its link
    effect(() => {
      const stored = this.stored();
      untracked(() => {
        if (!sameSource(stored, this.typed())) this.linkText.set(videoSourceLink(stored, this.linkOrigins()[0] ?? ''));
      });
    });
  }

  /************************************** actions *********************************************** */
  protected onLinkChange(value: string): void {
    this.linkText.set(value ?? '');
    const source = this.typed();
    if (!sameSource(source, this.stored())) this.configChange.emit(applyVideoSource(this.current(), source));
  }

  protected setRatio(ratio: VideoAspectRatio): void {
    if (ratio !== this.aspectRatio()) this.configChange.emit({ ...this.current(), aspectRatio: ratio });
  }

  protected ratioLabel(ratio: VideoAspectRatio): string {
    return this.i18n()[RATIO_LABELS[ratio]]();
  }

  protected foundLabel(kind: VideoSource['kind']): string {
    return this.i18n()[FOUND_LABELS[kind]]();
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }

  /** the stored config with the fields of a document stored before 2026-11-27 left out */
  private current(): VideoConfig {
    const { url, baseUrl, documentKey, aspectRatio, clips } = { ...VIDEO_CONFIG_SHAPE, ...this.config() };
    return { url, baseUrl, documentKey: documentKey ?? '', ...(aspectRatio ? { aspectRatio } : {}), ...(clips ? { clips } : {}) };
  }
}

function sameSource(a: VideoSource | undefined, b: VideoSource | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
