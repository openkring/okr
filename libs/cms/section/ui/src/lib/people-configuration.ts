import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import { IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular';

import {
  AvatarConfig, AvatarInfo, PeopleConfig, peopleHiddenKeys, UserModel
} from '@okr/shared-models';
import { ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, fill, getAvatarName } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';

import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';
import {
  clearPeopleResponsibilityParent, getFieldAndItemErrors, getPeopleResponsibilityIds, getPeopleResponsibilityParentKey, normalizeAvatarConfig,
  peopleField, removePeoplePerson, removePeopleResponsibility, SectionErrors, SectionI18n, setPeopleSource, showPeoplePerson
} from '@okr/cms-section-util';

import { PeopleLookConfig } from './people-look-configuration';

type PeopleSegment = 'content' | 'look';
const PEOPLE_SEGMENTS: PeopleSegment[] = ['content', 'look'];

/** Which segment renders which `avatar.*` field — an error in a hidden segment badges its button. */
const SEGMENT_FIELDS: Record<PeopleSegment, (keyof AvatarConfig)[]> = {
  content: ['title', 'linkedSection', 'altText'],
  look: ['size', 'shape', 'fill', 'textPosition', 'grayscale', 'nameDisplay', 'info', 'width'],
};

/**
 * Configuration of a people section, grouped into two segments:
 * Inhalt (who is shown, title, linked section, alt text) and Aussehen (`okr-people-look-config`). Part of section.form — the parent owns
 * validation and saving; this component only edits `properties` and shows the `avatar.*` errors.
 */
@Component({
  selector: 'okr-people-config',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonButton, IonIcon,
    IonSegment, IonSegmentButton, IonLabel, IonBadge, IonItem, IonChip, IonNote,
    StringSelect, TextInput, ErrorNote, PeopleLookConfig
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-segment { margin-bottom: 8px; }
    ion-segment-button ion-badge { margin-left: 4px; }
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
                  @if(type() === 'group' && groupId()) {
                    <!-- members of the group this section does not show -->
                    <ion-col size="12">
                      <ion-item lines="none">
                        <div class="chips">
                          @if(!isReadOnly()) {
                            <ion-button fill="outline" (click)="excludeSelectClicked.emit()">
                              <ion-icon slot="start" src="{{ 'eye-off' | svgIcon }}" />
                              {{ i18n().select_exclude_member() }}
                            </ion-button>
                          }
                          @for(key of hiddenKeys(); track key) {
                            <ion-chip color="medium">
                              @if(isReadOnly()) {
                                <ion-label>{{ hiddenName(key) }}</ion-label>
                              } @else {
                                <ion-button fill="clear" (click)="onHiddenRemove(key)">
                                  <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />
                                  <ion-label>{{ hiddenName(key) }}</ion-label>
                                </ion-button>
                              }
                            </ion-chip>
                          }
                        </div>
                      </ion-item>
                      @if(hiddenKeys().length > 0) {
                        <ion-item lines="none"><ion-note>{{ i18n().select_excluded_hint() }}</ion-note></ion-item>
                      }
                    </ion-col>
                  }
                  @if(type() === 'persons') {
                    <ion-col size="12">
                      <ion-item lines="none">
                        <div class="chips">
                          @if(!isReadOnly()) {
                            <ion-button fill="clear" size="large" (click)="selectClicked.emit()" [attr.aria-label]="i18n().people_add()">
                              <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
                            </ion-button>
                          }
                          @for(person of persons(); track person.key) {
                            <ion-chip color="primary">
                              @if(isReadOnly()) {
                                <ion-label>{{ personName(person) }}</ion-label>
                              } @else {
                                <ion-button fill="clear" (click)="onPersonRemove(person.key)">
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
                          @if(responsibilityParentKey()) {
                            <ion-chip color="secondary">
                              @if(isReadOnly()) {
                                <ion-label>{{ responsibilityParentLabel() }}</ion-label>
                              } @else {
                                <ion-button fill="clear" (click)="onResponsibilityParentRemove()">
                                  <ion-icon slot="start" src="{{ 'cancel' | svgIcon }}" />
                                  <ion-label>{{ responsibilityParentLabel() }}</ion-label>
                                </ion-button>
                              }
                            </ion-chip>
                          }
                        </div>
                      </ion-item>
                    </ion-col>
                    @if(!isReadOnly() && !responsibilityParentKey()) {
                      <ion-col size="12" size-md="6">
                        <ion-button fill="outline" (click)="responsibilityParentSelectClicked.emit()">
                          <ion-icon slot="start" src="{{ 'search' | svgIcon }}" />
                          {{ i18n().select_responsibility_parent() }}
                        </ion-button>
                      </ion-col>
                    }
                  }
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="titleI18n()" [value]="config().title" (valueChange)="onFieldChange('title', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="errorsFor('title')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="linkedSectionI18n()" [value]="config().linkedSection" (valueChange)="onFieldChange('linkedSection', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="errorsFor('linkedSection')" />
                  </ion-col>
                  <ion-col size="12">
                    <okr-text-input [i18n]="altTextI18n()" [value]="config().altText" (valueChange)="onFieldChange('altText', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="errorsFor('altText')" />
                  </ion-col>
                </ion-row>
              }

              @case('look') {
                <okr-people-look-config [config]="formData()" (configChange)="formData.set($event)" [readOnly]="isReadOnly()" [i18n]="i18n()" [errors]="errors()" />
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
  /** pick a member of the group that this section should not show */
  public excludeSelectClicked = output<void>();
  public responsibilitySelectClicked = output<void>();
  public responsibilityParentSelectClicked = output<void>();

  // state
  protected readonly segment = signal<PeopleSegment>('content');

  // fields — legacy sections are normalized (defaults + the retired showName/showLabel flags)
  protected readonly config = computed(() => normalizeAvatarConfig(this.formData()?.avatar));
  protected readonly persons = computed(() => this.formData()?.persons ?? []);
  protected readonly groupId = computed(() => this.formData()?.groupId ?? '');
  /** keys of the persons this section hides, whatever the source */
  protected readonly hiddenKeys = computed(() => peopleHiddenKeys(this.formData()));
  /** the chosen responsibilities; a legacy single `responsibilityId` is read as a list of one */
  protected readonly responsibilityIds = computed(() => getPeopleResponsibilityIds(this.formData()));
  /** the group whose active responsibilities follow the chosen ones ('group.<okey>'), or '' */
  protected readonly responsibilityParentKey = computed(() => getPeopleResponsibilityParentKey(this.formData()));
  protected readonly responsibilityParentLabel = computed(() => fill(this.i18n().select_responsibility_parent_chip(), {
    name: this.formData()?.responsibilityParentName?.trim() || this.responsibilityParentKey(),
  }));
  protected readonly type = computed(() => this.formData()?.type ?? 'persons');

  // passing constants to template
  protected readonly segments = PEOPLE_SEGMENTS;
  protected readonly peopleTypes = ['persons', 'group', 'responsibility'];

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
    const counts = { content: 0, look: 0 } as Record<PeopleSegment, number>;
    for (const seg of PEOPLE_SEGMENTS) {
      counts[seg] = SEGMENT_FIELDS[seg].reduce((sum, field) => sum + this.errorsFor(field).length, 0);
    }
    return counts;
  });

  // option labels
  protected readonly peopleTypeLabels = computed(() => [
    this.i18n().people_type_persons(), this.i18n().people_type_group(), this.i18n().people_type_responsibility()
  ]);
  // field i18n
  protected readonly peopleTypeI18n = computed(() => ({ name: 'peopleType', label: this.i18n().people_type(), helper: this.i18n().people_type_helper() } as StringSelectI18n));
  protected readonly titleI18n = computed(() => ({
    name: 'title', label: this.i18n().people_title_label(), placeholder: this.i18n().people_title_placeholder(), helper: this.i18n().people_title_helper(),
  } as TextInputI18n));
  protected readonly linkedSectionI18n = computed(() => ({
    name: 'linkedSection', label: this.i18n().people_linkedSection_label(), placeholder: this.i18n().people_linkedSection_placeholder(), helper: this.i18n().people_linkedSection_helper(),
  } as TextInputI18n));
  protected readonly altTextI18n = computed(() => ({
    name: 'altText', label: this.i18n().people_altText_label(), placeholder: this.i18n().people_altText_placeholder(), helper: this.i18n().people_altText_helper(),
  } as TextInputI18n));

  protected segmentLabel(seg: PeopleSegment): string {
    switch (seg) {
      case 'content': return this.i18n().people_segment_content();
      case 'look': return this.i18n().people_segment_look();
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

  /** a hidden person is shown again; the name comes from the stale `excludedPersons` entry, else the key itself */
  protected hiddenName(key: string): string {
    const person = this.formData()?.excludedPersons?.find(p => p?.key === key);
    return (person && getAvatarName(person)) || key;
  }

  protected onHiddenRemove(key: string): void {
    this.formData.update(vm => showPeoplePerson(vm, key));
  }

  protected onPersonRemove(key: string): void {
    this.formData.update(vm => removePeoplePerson(vm, key));
  }

  protected onResponsibilityRemove(id: string): void {
    this.formData.update(vm => removePeopleResponsibility(vm, id));
  }

  protected onResponsibilityParentRemove(): void {
    this.formData.update(vm => clearPeopleResponsibilityParent(vm));
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

  protected onTypeChange(type: string): void {
    this.formData.update(vm => setPeopleSource(vm, type as PeopleConfig['type']));
  }
}
