import { Component, computed, input, model } from '@angular/core';
import { IonCol, IonGrid, IonLabel, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular';

import { PeopleNameDisplays } from '@okr/shared-categories';
import {
  AvatarConfig, PEOPLE_FILLS, PEOPLE_INFOS, PEOPLE_SHAPES, PEOPLE_SIZES, PEOPLE_TEXT_POSITIONS, PeopleConfig, PeopleLook,
  resolvePeopleLook
} from '@okr/shared-models';
import {
  CategoryOld, CategoryOldI18n, Checkbox, CheckboxGroup, CheckboxGroupI18n, CheckboxI18n, ErrorNote
} from '@okr/shared-ui';
import { getFieldAndItemErrors, normalizeAvatarConfig, peopleField, SectionErrors, SectionI18n, setPeopleLook } from '@okr/cms-section-util';

/**
 * «Aussehen» of a people section: size, shape, background and text position as segments, black-and-white,
 * and the name format, the details shown and the width. Part of the people form and of the block editor;
 * the parent owns validation and saving. Every change writes once; nothing is written on init.
 */
@Component({
  selector: 'okr-people-look-config',
  standalone: true,
  imports: [IonGrid, IonRow, IonCol, IonSegment, IonSegmentButton, IonLabel, CategoryOld, Checkbox, CheckboxGroup, ErrorNote],
  styles: [`
    :host { display: block; }
    ion-segment { margin-bottom: 4px; }
    .look-label { display: block; padding: 8px 16px 4px; font-size: 0.85rem; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-grid>
      <ion-row>
        <ion-col size="12" size-md="6">
          <ion-label class="look-label">{{ i18n().people_look_size_label() }}</ion-label>
          <ion-segment [value]="look().size" [disabled]="readOnly()" (ionChange)="onSize($event.detail.value)">
            @for (value of sizes; track value) {
              <ion-segment-button [value]="value"><ion-label>{{ sizeLabels()[value] }}</ion-label></ion-segment-button>
            }
          </ion-segment>
          <okr-error-note [errors]="errorsFor('size')" />
        </ion-col>
        <ion-col size="12" size-md="6">
          <ion-label class="look-label">{{ i18n().people_look_shape_label() }}</ion-label>
          <ion-segment [value]="look().shape" [disabled]="readOnly()" (ionChange)="onShape($event.detail.value)">
            @for (value of shapes; track value) {
              <ion-segment-button [value]="value"><ion-label>{{ shapeLabels()[value] }}</ion-label></ion-segment-button>
            }
          </ion-segment>
          <okr-error-note [errors]="errorsFor('shape')" />
        </ion-col>
        <ion-col size="12" size-md="6">
          <ion-label class="look-label">{{ i18n().people_look_fill_label() }}</ion-label>
          <ion-segment [value]="look().fill" [disabled]="readOnly()" (ionChange)="onFill($event.detail.value)">
            @for (value of fills; track value) {
              <ion-segment-button [value]="value"><ion-label>{{ fillLabels()[value] }}</ion-label></ion-segment-button>
            }
          </ion-segment>
          <okr-error-note [errors]="errorsFor('fill')" />
        </ion-col>
        <ion-col size="12" size-md="6">
          <ion-label class="look-label">{{ i18n().people_look_textPosition_label() }}</ion-label>
          <ion-segment [value]="look().textPosition" [disabled]="readOnly()" (ionChange)="onTextPosition($event.detail.value)">
            @for (value of textPositions; track value) {
              <ion-segment-button [value]="value"><ion-label>{{ textPositionLabels()[value] }}</ion-label></ion-segment-button>
            }
          </ion-segment>
          <okr-error-note [errors]="errorsFor('textPosition')" />
        </ion-col>
        <ion-col size="12">
          <okr-checkbox [i18n]="grayscaleI18n()" [checked]="look().grayscale" (checkedChange)="onGrayscale($event)" [readOnly]="readOnly()" />
          <okr-error-note [errors]="errorsFor('grayscale')" />
        </ion-col>
        <ion-col size="12" size-md="6">
          <okr-category-old [i18n]="nameDisplayI18n()" [value]="avatar().nameDisplay" (valueChange)="onField('nameDisplay', $event)" [readOnly]="readOnly()" [categories]="nameDisplays" />
          <okr-error-note [errors]="errorsFor('nameDisplay')" />
        </ion-col>
        <ion-col size="12">
          <okr-checkbox-group [i18n]="infoI18n()" [stringList]="infos" [labels]="infoLabels()"
            [selectedStrings]="avatar().info" (selectedStringsChange)="onField('info', $event)" [readOnly]="readOnly()" />
          <okr-error-note [errors]="errorsFor('info')" />
        </ion-col>
        <ion-col size="12">
          <okr-checkbox [i18n]="widthI18n()" [checked]="avatar().width === 'article'" (checkedChange)="onField('width', $event ? 'article' : 'full')" [readOnly]="readOnly()" />
          <okr-error-note [errors]="errorsFor('width')" />
        </ion-col>
      </ion-row>
    </ion-grid>
  `
})
export class PeopleLookConfig {
  public readonly config = model.required<PeopleConfig>();
  public readonly readOnly = input(false);
  public readonly i18n = input.required<SectionI18n>();
  public readonly errors = input<SectionErrors>({});

  protected readonly sizes = PEOPLE_SIZES;
  protected readonly shapes = PEOPLE_SHAPES;
  protected readonly fills = PEOPLE_FILLS;
  protected readonly textPositions = PEOPLE_TEXT_POSITIONS;
  protected readonly nameDisplays = PeopleNameDisplays;
  protected readonly infos = PEOPLE_INFOS;

  /** the look as drawn: a stored choice wins, else it is derived from the old fields */
  protected readonly look = computed(() => resolvePeopleLook(this.config()?.avatar));
  /** legacy sections are normalized (defaults + the retired showName/showLabel flags) */
  protected readonly avatar = computed(() => normalizeAvatarConfig(this.config()?.avatar));

  protected readonly sizeLabels = computed(() => ({
    S: this.i18n().people_look_size_S(), M: this.i18n().people_look_size_M(), L: this.i18n().people_look_size_L(),
  }));
  protected readonly shapeLabels = computed(() => ({
    round: this.i18n().people_look_shape_round(), rounded: this.i18n().people_look_shape_rounded(), square: this.i18n().people_look_shape_square(),
  }));
  protected readonly fillLabels = computed(() => ({
    original: this.i18n().people_look_fill_original(), primary: this.i18n().people_look_fill_primary(), alternating: this.i18n().people_look_fill_alternating(),
  }));
  protected readonly textPositionLabels = computed(() => ({
    below: this.i18n().people_look_textPosition_below(), right: this.i18n().people_look_textPosition_right(), overlay: this.i18n().people_look_textPosition_overlay(),
  }));
  protected readonly infoLabels = computed(() => [
    this.i18n().people_info_function(), this.i18n().people_info_email(), this.i18n().people_info_emailLink()
  ]);

  protected readonly grayscaleI18n = computed(() => ({ name: 'grayscale', label: this.i18n().people_grayscale_label(), helper: this.i18n().people_grayscale_helper() } as CheckboxI18n));
  protected readonly widthI18n = computed(() => ({ name: 'width', label: this.i18n().people_width_label(), helper: this.i18n().people_width_helper() } as CheckboxI18n));
  protected readonly nameDisplayI18n = computed(() => ({ name: 'nameDisplay', label: this.i18n().people_nameDisplay_label(), helper: this.i18n().people_nameDisplay_helper() } as CategoryOldI18n));
  protected readonly infoI18n = computed(() => ({ name: 'info', label: this.i18n().people_info_label(), helper: this.i18n().people_info_helper() } as CheckboxGroupI18n));

  protected errorsFor(field: keyof AvatarConfig): string[] {
    return getFieldAndItemErrors(this.errors(), peopleField(field));
  }

  protected onSize(value: unknown): void {
    if (PEOPLE_SIZES.includes(value as PeopleLook['size']) && value !== this.look().size) this.writeLook({ size: value as PeopleLook['size'] });
  }

  protected onShape(value: unknown): void {
    if (PEOPLE_SHAPES.includes(value as PeopleLook['shape']) && value !== this.look().shape) this.writeLook({ shape: value as PeopleLook['shape'] });
  }

  protected onFill(value: unknown): void {
    if (PEOPLE_FILLS.includes(value as PeopleLook['fill']) && value !== this.look().fill) this.writeLook({ fill: value as PeopleLook['fill'] });
  }

  protected onTextPosition(value: unknown): void {
    if (PEOPLE_TEXT_POSITIONS.includes(value as PeopleLook['textPosition']) && value !== this.look().textPosition) {
      this.writeLook({ textPosition: value as PeopleLook['textPosition'] });
    }
  }

  protected onGrayscale(value: boolean): void {
    if (value !== this.look().grayscale) this.writeLook({ grayscale: value });
  }

  /** The complete, normalized avatar is written, so a legacy section is saved in the new shape on its first edit. */
  private writeLook(patch: Partial<PeopleLook>): void {
    this.config.update((c) => this.withoutRetiredFlags(setPeopleLook({ ...c, avatar: normalizeAvatarConfig(c.avatar) }, patch)));
  }

  protected onField(field: keyof AvatarConfig, value: unknown): void {
    this.config.update((c) => this.withoutRetiredFlags({ ...c, avatar: { ...normalizeAvatarConfig(c.avatar), [field]: value } as AvatarConfig }));
  }

  private withoutRetiredFlags(c: PeopleConfig): PeopleConfig {
    const avatar = { ...c.avatar };
    delete avatar.showName;
    delete avatar.showLabel;
    return { ...c, avatar };
  }
}
