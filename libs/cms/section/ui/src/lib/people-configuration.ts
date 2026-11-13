import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular';

import { ColorsIonic, PeopleNameDisplays } from '@okr/shared-categories';
import {
  AvatarConfig, AvatarInfo, PEOPLE_BACKGROUNDS, PEOPLE_INFO_POSITIONS, PEOPLE_INFOS, PEOPLE_ORG_COLORS, PEOPLE_VIEWS,
  PeopleConfig, UserModel
} from '@okr/shared-models';
import {
  CategoryOld, CategoryOldI18n, Checkbox, CheckboxGroup, CheckboxGroupI18n, CheckboxI18n, Color, ErrorNote, NumberInput, NumberInputI18n,
  StringSelect, StringSelectI18n, TextInput, TextInputI18n
} from '@okr/shared-ui';
import { coerceBoolean, getAvatarName } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';

import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';
import { getFieldAndItemErrors, getPeopleResponsibilityIds, normalizeAvatarConfig, peopleField, PEOPLE_MAX_BG_COLORS, SectionErrors, SectionI18n } from '@okr/cms-section-util';

type PeopleSegment = 'content' | 'view' | 'image' | 'info';
const PEOPLE_SEGMENTS: PeopleSegment[] = ['content', 'view', 'image', 'info'];

/** Which segment renders which `avatar.*` field — an error in a hidden segment badges its button. */
const SEGMENT_FIELDS: Record<PeopleSegment, (keyof AvatarConfig)[]> = {
  content: ['title', 'linkedSection'],
  view: ['view', 'perRow', 'sliderRows', 'color'],
  image: ['imgWidth', 'imgHeight', 'imgRadius', 'facePad', 'background', 'bgOrgColor', 'bgColors', 'grayscale', 'altText'],
  info: ['nameDisplay', 'info', 'infoPosition'],
};

/**
 * Configuration of a people section, grouped into four segments:
 * Inhalt (who is shown), Darstellung (card / grid / slider), Bild (size, crop, background) and
 * Angaben (name, function, email and where they sit). Part of section.form — the parent owns
 * validation and saving; this component only edits `properties` and shows the `avatar.*` errors.
 */
@Component({
  selector: 'okr-people-config',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonButton, IonIcon,
    IonSegment, IonSegmentButton, IonLabel, IonBadge, IonItem, IonChip,
    CategoryOld, StringSelect, Checkbox, CheckboxGroup, TextInput, NumberInput, Color, ErrorNote
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-segment { margin-bottom: 8px; }
    ion-segment-button ion-badge { margin-left: 4px; }
    .bg-color { display: flex; align-items: center; }
    .bg-color okr-color { flex: 1; }
    .chips { display: flex; flex-wrap: wrap; align-items: center; }
  `],
  template: `
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().people_edit() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event.detail.value)" [scrollable]="true">
            @for(seg of segments; track seg) {
              <ion-segment-button [value]="seg">
                <ion-label>{{ segmentLabel(seg) }}
                  @if(segmentErrorCount()[seg] > 0) {
                    <ion-badge color="danger">{{ segmentErrorCount()[seg] }}</ion-badge>
                  }
                </ion-label>
              </ion-segment-button>
            }
          </ion-segment>

          <ion-grid>
            @switch(segment()) {
              @case('content') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="peopleTypeI18n()" [selectedString]="type()" (selectedStringChange)="onTypeChange($event)"
                      [readOnly]="isReadOnly()" [stringList]="peopleTypes" [labels]="peopleTypeLabels()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    @if(type() === 'group') {
                      <ion-button fill="outline" [disabled]="isReadOnly()" (click)="groupSelectClicked.emit()">
                        <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />
                        {{ groupId() || i18n().select_group() }}
                      </ion-button>
                    }
                  </ion-col>
                  @if(type() === 'persons') {
                    <ion-col size="12">
                      <ion-item lines="none">
                        <div class="chips">
                          @if(!isReadOnly()) {
                            <ion-button fill="clear" size="large" (click)="selectClicked.emit()" [attr.aria-label]="i18n().people_add()">
                              <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
                            </ion-button>
                          }
                          @for(person of persons(); track $index) {
                            <ion-chip color="primary">
                              @if(isReadOnly()) {
                                <ion-label>{{ personName(person) }}</ion-label>
                              } @else {
                                <ion-button fill="clear" (click)="onPersonRemove($index)">
                                  <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />
                                  <ion-label>{{ personName(person) }}</ion-label>
                                </ion-button>
                              }
                            </ion-chip>
                          }
                        </div>
                      </ion-item>
                    </ion-col>
                  }
                  @if(type() === 'responsibility') {
                    <ion-col size="12">
                      <ion-item lines="none">
                        <div class="chips">
                          @if(!isReadOnly()) {
                            <ion-button fill="clear" size="large" (click)="responsibilitySelectClicked.emit()" [attr.aria-label]="i18n().select_responsibility()">
                              <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
                            </ion-button>
                          }
                          @for(id of responsibilityIds(); track id) {
                            <ion-chip color="primary">
                              @if(isReadOnly()) {
                                <ion-label>{{ responsibilityName(id) }}</ion-label>
                              } @else {
                                <ion-button fill="clear" (click)="onResponsibilityRemove(id)">
                                  <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />
                                  <ion-label>{{ responsibilityName(id) }}</ion-label>
                                </ion-button>
                              }
                            </ion-chip>
                          }
                        </div>
                      </ion-item>
                    </ion-col>
                  }
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="titleI18n()" [value]="config().title" (valueChange)="onFieldChange('title', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="errorsFor('title')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="linkedSectionI18n()" [value]="config().linkedSection" (valueChange)="onFieldChange('linkedSection', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="errorsFor('linkedSection')" />
                  </ion-col>
                </ion-row>
              }

              @case('view') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="viewI18n()" [selectedString]="config().view" (selectedStringChange)="onFieldChange('view', $event)"
                      [readOnly]="isReadOnly()" [stringList]="views" [labels]="viewLabels()" />
                    <okr-error-note [errors]="errorsFor('view')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-category-old [i18n]="colorI18n()" [value]="config().color" (valueChange)="onFieldChange('color', $event)" [readOnly]="isReadOnly()" [categories]="colors" />
                    <okr-error-note [errors]="errorsFor('color')" />
                  </ion-col>
                  @if(config().view === 'slider') {
                    <ion-col size="12" size-md="6">
                      <okr-number-input [i18n]="perRowI18n()" [value]="config().perRow" (valueChange)="onFieldChange('perRow', $event)"
                        [integer]="true" [min]="3" [max]="10" [showHelper]="true" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="errorsFor('perRow')" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <okr-number-input [i18n]="sliderRowsI18n()" [value]="config().sliderRows" (valueChange)="onFieldChange('sliderRows', $event)"
                        [integer]="true" [min]="1" [max]="4" [showHelper]="true" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="errorsFor('sliderRows')" />
                    </ion-col>
                  }
                </ion-row>
              }

              @case('image') {
                <ion-row>
                  <ion-col size="6" size-md="3">
                    <okr-number-input [i18n]="imgWidthI18n()" [value]="config().imgWidth" (valueChange)="onFieldChange('imgWidth', $event)"
                      [integer]="true" [min]="16" [max]="1000" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errorsFor('imgWidth')" />
                  </ion-col>
                  <ion-col size="6" size-md="3">
                    <okr-number-input [i18n]="imgHeightI18n()" [value]="config().imgHeight" (valueChange)="onFieldChange('imgHeight', $event)"
                      [integer]="true" [min]="16" [max]="1000" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errorsFor('imgHeight')" />
                  </ion-col>
                  <ion-col size="6" size-md="3">
                    <okr-text-input [i18n]="imgRadiusI18n()" [value]="config().imgRadius" (valueChange)="onFieldChange('imgRadius', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errorsFor('imgRadius')" />
                  </ion-col>
                  <ion-col size="6" size-md="3">
                    <okr-number-input [i18n]="facePadI18n()" [value]="config().facePad" (valueChange)="onFieldChange('facePad', $event)"
                      [min]="0" [max]="2" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errorsFor('facePad')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="backgroundI18n()" [selectedString]="config().background" (selectedStringChange)="onFieldChange('background', $event)"
                      [readOnly]="isReadOnly()" [stringList]="backgrounds" [labels]="backgroundLabels()" />
                    <okr-error-note [errors]="errorsFor('background')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    @if(config().background === 'orgColor') {
                      <okr-string-select [i18n]="bgOrgColorI18n()" [selectedString]="config().bgOrgColor" (selectedStringChange)="onFieldChange('bgOrgColor', $event)"
                        [readOnly]="isReadOnly()" [stringList]="orgColors" [labels]="orgColorLabels()" />
                      <okr-error-note [errors]="errorsFor('bgOrgColor')" />
                    }
                    @if(config().background === 'colors') {
                      <ion-label class="ion-padding-start">{{ i18n().people_bgColors_label() }}</ion-label>
                      @for(hex of config().bgColors; track $index) {
                        <div class="bg-color">
                          <okr-color [label]="i18n().people_bgColors_color() + ' ' + ($index + 1)" [hexColor]="hex" (hexColorChange)="onBgColorChange($index, $event)" [readOnly]="isReadOnly()" />
                          <ion-button fill="clear" color="danger" [disabled]="isReadOnly()" (click)="onBgColorRemove($index)">
                            <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                          </ion-button>
                        </div>
                      }
                      @if(config().bgColors.length < maxBgColors) {
                        <ion-button fill="clear" [disabled]="isReadOnly()" (click)="onBgColorAdd()">
                          <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                          {{ i18n().people_bgColors_add() }}
                        </ion-button>
                      }
                      <okr-error-note [errors]="errorsFor('bgColors')" />
                    }
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="grayscaleI18n()" [checked]="config().grayscale" (checkedChange)="onFieldChange('grayscale', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errorsFor('grayscale')" />
                  </ion-col>
                  <ion-col size="12">
                    <okr-text-input [i18n]="altTextI18n()" [value]="config().altText" (valueChange)="onFieldChange('altText', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="errorsFor('altText')" />
                  </ion-col>
                </ion-row>
              }

              @case('info') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-category-old [i18n]="nameDisplayI18n()" [value]="config().nameDisplay" (valueChange)="onFieldChange('nameDisplay', $event)" [readOnly]="isReadOnly()" [categories]="nameDisplays" />
                    <okr-error-note [errors]="errorsFor('nameDisplay')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="infoPositionI18n()" [selectedString]="config().infoPosition" (selectedStringChange)="onFieldChange('infoPosition', $event)"
                      [readOnly]="isReadOnly()" [stringList]="infoPositions" [labels]="infoPositionLabels()" />
                    <okr-error-note [errors]="errorsFor('infoPosition')" />
                  </ion-col>
                  <ion-col size="12">
                    <okr-checkbox-group [i18n]="infoI18n()" [stringList]="infos" [labels]="infoLabels()"
                      [selectedStrings]="config().info" (selectedStringsChange)="onFieldChange('info', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errorsFor('info')" />
                  </ion-col>
                </ion-row>
              }
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
  `
})
export class PeopleConfiguration {
  private readonly responsibilityService = inject(ResponsibilityService);

  // inputs
  public formData = model.required<PeopleConfig>();
  public currentUser = input.required<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  public readonly i18n = input.required<SectionI18n>();
  public readonly errors = input<SectionErrors>({});

  public selectClicked = output<void>();
  public groupSelectClicked = output<void>();
  public responsibilitySelectClicked = output<void>();

  // state
  protected readonly segment = signal<PeopleSegment>('content');

  // fields — legacy sections are normalized (defaults + the retired showName/showLabel flags)
  protected readonly config = computed(() => normalizeAvatarConfig(this.formData()?.avatar));
  protected readonly persons = computed(() => this.formData()?.persons ?? []);
  protected readonly groupId = computed(() => this.formData()?.groupId ?? '');
  /** the chosen responsibilities; a legacy single `responsibilityId` is read as a list of one */
  protected readonly responsibilityIds = computed(() => getPeopleResponsibilityIds(this.formData()));
  protected readonly type = computed(() => this.formData()?.type ?? 'persons');

  // passing constants to template
  protected readonly segments = PEOPLE_SEGMENTS;
  protected readonly nameDisplays = PeopleNameDisplays;
  protected readonly colors = ColorsIonic;
  protected readonly peopleTypes = ['persons', 'group', 'responsibility'];
  protected readonly views = PEOPLE_VIEWS;
  protected readonly backgrounds = PEOPLE_BACKGROUNDS;
  protected readonly orgColors = PEOPLE_ORG_COLORS;
  protected readonly infos = PEOPLE_INFOS;
  protected readonly infoPositions = PEOPLE_INFO_POSITIONS;
  protected readonly maxBgColors = PEOPLE_MAX_BG_COLORS;

  /** responsibility okey → name, to label the chips (only loaded while the type is responsibility) */
  private readonly responsibilityNamesResource = rxResource({
    params: () => ({ load: this.type() === 'responsibility' && !!this.currentUser() }),
    stream: ({ params }) => {
      if (!params.load) return of({} as Record<string, string>);
      return this.responsibilityService.list().pipe(
        map(list => Object.fromEntries(list.map(r => [r.okey, r.name])) as Record<string, string>)
      );
    },
  });

  /** number of `avatar.*` errors per segment, so an error in a hidden segment stays visible */
  protected readonly segmentErrorCount = computed(() => {
    const counts = { content: 0, view: 0, image: 0, info: 0 } as Record<PeopleSegment, number>;
    for (const seg of PEOPLE_SEGMENTS) {
      counts[seg] = SEGMENT_FIELDS[seg].reduce((sum, field) => sum + this.errorsFor(field).length, 0);
    }
    return counts;
  });

  // option labels
  protected readonly peopleTypeLabels = computed(() => [
    this.i18n().people_type_persons(), this.i18n().people_type_group(), this.i18n().people_type_responsibility()
  ]);
  protected readonly viewLabels = computed(() => [
    this.i18n().people_view_card(), this.i18n().people_view_grid(), this.i18n().people_view_slider()
  ]);
  protected readonly backgroundLabels = computed(() => [
    this.i18n().people_background_original(), this.i18n().people_background_removed(),
    this.i18n().people_background_orgColor(), this.i18n().people_background_colors()
  ]);
  protected readonly orgColorLabels = computed(() => [
    this.i18n().people_bgOrgColor_primary(), this.i18n().people_bgOrgColor_secondary(), this.i18n().people_bgOrgColor_alternating()
  ]);
  protected readonly infoLabels = computed(() => [
    this.i18n().people_info_function(), this.i18n().people_info_email(), this.i18n().people_info_emailLink()
  ]);
  protected readonly infoPositionLabels = computed(() => [
    this.i18n().people_infoPosition_overlayTop(), this.i18n().people_infoPosition_overlayBottom(),
    this.i18n().people_infoPosition_above(), this.i18n().people_infoPosition_below(),
    this.i18n().people_infoPosition_left(), this.i18n().people_infoPosition_right()
  ]);

  // field i18n
  protected readonly peopleTypeI18n = computed(() => ({ name: 'peopleType', label: this.i18n().people_type(), helper: this.i18n().people_type_helper() } as StringSelectI18n));
  protected readonly titleI18n = computed(() => ({
    name: 'title', label: this.i18n().people_title_label(), placeholder: this.i18n().people_title_placeholder(), helper: this.i18n().people_title_helper(),
  } as TextInputI18n));
  protected readonly linkedSectionI18n = computed(() => ({
    name: 'linkedSection', label: this.i18n().people_linkedSection_label(), placeholder: this.i18n().people_linkedSection_placeholder(), helper: this.i18n().people_linkedSection_helper(),
  } as TextInputI18n));
  protected readonly viewI18n = computed(() => ({ name: 'view', label: this.i18n().people_view_label(), helper: this.i18n().people_view_helper() } as StringSelectI18n));
  protected readonly colorI18n = computed(() => ({ name: 'color', label: this.i18n().people_color_label(), helper: this.i18n().people_color_helper() } as CategoryOldI18n));
  protected readonly perRowI18n = computed(() => this.numberI18n('perRow', this.i18n().people_perRow_label(), this.i18n().people_perRow_placeholder(), this.i18n().people_perRow_helper()));
  protected readonly sliderRowsI18n = computed(() => this.numberI18n('sliderRows', this.i18n().people_sliderRows_label(), this.i18n().people_sliderRows_placeholder(), this.i18n().people_sliderRows_helper()));
  protected readonly imgWidthI18n = computed(() => this.numberI18n('imgWidth', this.i18n().people_imgWidth_label(), this.i18n().people_imgWidth_placeholder(), this.i18n().people_imgWidth_helper()));
  protected readonly imgHeightI18n = computed(() => this.numberI18n('imgHeight', this.i18n().people_imgHeight_label(), this.i18n().people_imgHeight_placeholder(), this.i18n().people_imgHeight_helper()));
  protected readonly facePadI18n = computed(() => this.numberI18n('facePad', this.i18n().people_facePad_label(), this.i18n().people_facePad_placeholder(), this.i18n().people_facePad_helper()));
  protected readonly imgRadiusI18n = computed(() => ({
    name: 'imgRadius', label: this.i18n().people_imgRadius_label(), placeholder: this.i18n().people_imgRadius_placeholder(), helper: this.i18n().people_imgRadius_helper(),
  } as TextInputI18n));
  protected readonly backgroundI18n = computed(() => ({ name: 'background', label: this.i18n().people_background_label(), helper: this.i18n().people_background_helper() } as StringSelectI18n));
  protected readonly bgOrgColorI18n = computed(() => ({ name: 'bgOrgColor', label: this.i18n().people_bgOrgColor_label(), helper: this.i18n().people_bgOrgColor_helper() } as StringSelectI18n));
  protected readonly grayscaleI18n = computed(() => ({ name: 'grayscale', label: this.i18n().people_grayscale_label(), helper: this.i18n().people_grayscale_helper() } as CheckboxI18n));
  protected readonly altTextI18n = computed(() => ({
    name: 'altText', label: this.i18n().people_altText_label(), placeholder: this.i18n().people_altText_placeholder(), helper: this.i18n().people_altText_helper(),
  } as TextInputI18n));
  protected readonly nameDisplayI18n = computed(() => ({ name: 'nameDisplay', label: this.i18n().people_nameDisplay_label(), helper: this.i18n().people_nameDisplay_helper() } as CategoryOldI18n));
  protected readonly infoI18n = computed(() => ({ name: 'info', label: this.i18n().people_info_label(), helper: this.i18n().people_info_helper() } as CheckboxGroupI18n));
  protected readonly infoPositionI18n = computed(() => ({ name: 'infoPosition', label: this.i18n().people_infoPosition_label(), helper: this.i18n().people_infoPosition_helper() } as StringSelectI18n));

  private numberI18n(name: string, label: string, placeholder: string, helper: string): NumberInputI18n {
    return { name, label, placeholder, helper };
  }

  protected segmentLabel(seg: PeopleSegment): string {
    switch (seg) {
      case 'content': return this.i18n().people_segment_content();
      case 'view': return this.i18n().people_segment_view();
      case 'image': return this.i18n().people_segment_image();
      case 'info': return this.i18n().people_segment_info();
    }
  }

  protected errorsFor(field: keyof AvatarConfig): string[] {
    return getFieldAndItemErrors(this.errors(), peopleField(field));
  }

  /************************************** actions *********************************************** */
  protected onSegmentChange(value: unknown): void {
    if (PEOPLE_SEGMENTS.includes(value as PeopleSegment)) this.segment.set(value as PeopleSegment);
  }

  protected personName(person: AvatarInfo): string {
    return getAvatarName(person);
  }

  protected responsibilityName(id: string): string {
    return this.responsibilityNamesResource.value()?.[id] || id;
  }

  protected onPersonRemove(index: number): void {
    this.formData.update(vm => ({ ...vm, persons: (vm.persons ?? []).filter((_, i) => i !== index) }));
  }

  /** writes the list and drops the legacy single key, so a legacy section is saved in the new shape */
  protected onResponsibilityRemove(id: string): void {
    this.formData.update(vm => {
      const next: PeopleConfig = { ...vm, responsibilityIds: getPeopleResponsibilityIds(vm).filter(r => r !== id) };
      delete next.responsibilityId;
      return next;
    });
  }

  /**
   * Every change writes the complete, normalized avatar config: a legacy section is saved in the
   * new shape on its first edit, and the retired showName/showLabel flags are dropped.
   */
  protected onFieldChange(fieldName: keyof AvatarConfig, fieldValue: unknown): void {
    this.formData.update((vm) => {
      const avatar = { ...normalizeAvatarConfig(vm.avatar), [fieldName]: fieldValue } as AvatarConfig;
      delete avatar.showName;
      delete avatar.showLabel;
      return { ...vm, avatar };
    });
  }

  protected onBgColorChange(index: number, hex: string): void {
    const bgColors = [...this.config().bgColors];
    bgColors[index] = hex;
    this.onFieldChange('bgColors', bgColors);
  }

  protected onBgColorAdd(): void {
    if (this.config().bgColors.length >= PEOPLE_MAX_BG_COLORS) return;
    this.onFieldChange('bgColors', [...this.config().bgColors, '#e0e0e0']);
  }

  protected onBgColorRemove(index: number): void {
    this.onFieldChange('bgColors', this.config().bgColors.filter((_, i) => i !== index));
  }

  protected onTypeChange(type: string): void {
    this.formData.update(vm => ({ ...vm, type: type as PeopleConfig['type'] }));
  }
}
