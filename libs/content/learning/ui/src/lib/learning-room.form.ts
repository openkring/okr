import { Component, computed, effect, inject, input, linkedSignal, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { LearningCurators } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, Chips, ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, getFullName } from '@okr/shared-util-core';
import {
  LEARNING_ROOM_NAME_MAX, LearningI18n, LearningRoomFormData, learningRoomValidations, LearningTab, parseTopics,
} from '@okr/content-learning-util';

/** A folder the room may use as its root, for the folder select. */
export interface LearningFolderOption {
  key: string;
  name: string;
}

type RoomMode = LearningRoomFormData['mode'];
type RoomField = keyof LearningRoomFormData;

const MODES: RoomMode[] = ['menu', 'group'];
const TABS: LearningTab[] = ['files', 'videos', 'images'];

/**
 * Settings of a learning room (spec 1.115 §5.1, §6): name, how it is reached (menu entry with its own
 * root folder, or a group whose folder is the root), topics, curators per topic and the start tab.
 *
 * Curators are bare person okeys, picked one by one; group admins are NOT curators by themselves
 * (ruling of Task 3), the form says so. Curators of a topic that is removed are dropped with it.
 */
@Component({
  selector: 'okr-learning-room-form',
  standalone: true,
  imports: [
    SvgIconPipe, TextInput, StringSelect, Checkbox, Chips, ErrorNote,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote, IonButton, IonIcon, IonChip,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .add { padding: 4px 16px 8px; }
    .persons { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 16px; }
    .topic { font-weight: 600; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="modeI18n()" [stringList]="modes" [labels]="modeLabels()"
                    [selectedString]="mode()" (selectedStringChange)="onModeChange($event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>

              @if (mode() === 'menu') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-checkbox [i18n]="createFolderI18n()" [checked]="createFolder()" (checkedChange)="onCreateFolderChange($event)"
                      [showHelper]="true" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    @if (!createFolder()) {
                      <okr-string-select [i18n]="folderI18n()" [stringList]="folderKeys()" [labels]="folderLabels()"
                        [selectedString]="folder()" (selectedStringChange)="onFieldChange('folder', $event)" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="folderErrors()" />
                    }
                  </ion-col>
                </ion-row>
              } @else {
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-icon slot="start" src="{{ 'people' | svgIcon }}" />
                      <ion-label>
                        {{ i18n().roomForm_group_label() }}
                        <p>{{ shownGroupName() || i18n().roomForm_group_none() }}</p>
                      </ion-label>
                      @if (!isReadOnly()) {
                        <ion-button slot="end" fill="outline" (click)="pickGroup()">{{ i18n().roomForm_group_pick() }}</ion-button>
                      }
                    </ion-item>
                    <ion-item lines="none">
                      <ion-note>{{ i18n().roomForm_group_helper() }}</ion-note>
                    </ion-item>
                    <okr-error-note [errors]="groupKeyErrors()" />
                  </ion-col>
                </ion-row>
              }

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="defaultTabI18n()" [stringList]="tabs" [labels]="tabLabels()"
                    [selectedString]="defaultTab()" (selectedStringChange)="onFieldChange('defaultTab', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- topics -->
        <okr-chips chipName="tag" [storedChips]="topics()" (storedChipsChange)="onTopicsChange($event)"
          [allChips]="allTopics()" [readOnly]="isReadOnly()" />
        <ion-item lines="none">
          <ion-note>{{ i18n().roomForm_topics_helper() }}</ion-note>
        </ion-item>
        <okr-error-note [errors]="topicsErrors()" />

        <!-- curators per topic -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().roomForm_curators_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-item lines="none">
              <ion-note>{{ i18n().roomForm_curators_helper() }}</ion-note>
            </ion-item>
            <ion-item lines="none">
              <ion-icon slot="start" src="{{ 'info-circle' | svgIcon }}" />
              <ion-note>{{ i18n().roomForm_curators_groupAdmins() }}</ion-note>
            </ion-item>
            @for (topic of topicList(); track topic) {
              <ion-item lines="none">
                <ion-label class="topic">{{ topic }}</ion-label>
                @if (!isReadOnly()) {
                  <ion-button slot="end" fill="clear" (click)="addCurator(topic)">
                    <ion-icon slot="start" src="{{ 'person-add' | svgIcon }}" />
                    {{ i18n().roomForm_curators_add() }}
                  </ion-button>
                }
              </ion-item>
              <div class="persons">
                @for (personKey of curatorsOf(topic); track personKey) {
                  <ion-chip [outline]="true">
                    <ion-label>{{ personName(personKey) }}</ion-label>
                    @if (!isReadOnly()) {
                      <ion-icon src="{{ 'cancel' | svgIcon }}" [attr.aria-label]="i18n().form_remove()" (click)="removeCurator(topic, personKey)" />
                    }
                  </ion-chip>
                } @empty {
                  <ion-note>{{ i18n().roomForm_curators_none() }}</ion-note>
                }
              </div>
            } @empty {
              <ion-item lines="none">
                <ion-note>{{ i18n().roomForm_curators_noTopics() }}</ion-note>
              </ion-item>
            }
            <okr-error-note [errors]="curatorsErrors()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class LearningRoomForm {
  private readonly modelSelector = inject(MODEL_SELECTOR);

  // inputs
  public readonly i18n = input.required<LearningI18n>();
  public formData = model.required<LearningRoomFormData>();
  /** all document tags of the tenant (comma-separated), the topic catalogue */
  public readonly allTopics = input('');
  /** folders a menu room may use as its root */
  public readonly folders = input<LearningFolderOption[]>([]);
  /** display name of the current group of a group room */
  public readonly groupName = input('');
  /** display names of persons by okey (the curators already stored) */
  public readonly personNames = input<Record<string, string>>({});
  /** the tenant whose accounts the person picker offers first */
  public readonly tenantId = input('');
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly roomForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, learningRoomValidations as any));
  private readonly validationResult = vestErrors(this.roomForm);
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly folderErrors = computed(() => this.validationResult().getErrors('folder'));
  protected readonly groupKeyErrors = computed(() => this.validationResult().getErrors('groupKey'));
  protected readonly topicsErrors = computed(() => this.validationResult().getErrors('topics'));
  protected readonly curatorsErrors = computed(() => this.validationResult().getErrors('curators'));

  constructor() {
    effect(() => this.valid.emit(this.roomForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces */
  protected readonly nameLength = LEARNING_ROOM_NAME_MAX;
  protected readonly modes = MODES;
  protected readonly tabs = TABS;

  // fields
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly mode = computed<RoomMode>(() => this.formData()?.mode ?? 'menu');
  protected readonly folder = computed(() => this.formData()?.folder ?? '');
  protected readonly createFolder = computed(() => !!this.formData()?.createFolder);
  protected readonly topics = computed(() => this.formData()?.topics ?? '');
  protected readonly topicList = computed(() => parseTopics(this.topics()));
  protected readonly curators = computed(() => this.formData()?.curators ?? []);
  protected readonly defaultTab = computed<LearningTab>(() => this.formData()?.defaultTab ?? 'files');

  /** the stored folder stays selectable even when it is not in `folders` */
  private readonly folderOptions = computed(() => {
    const list = this.folders();
    const current = this.folder();
    return current && !list.some(f => f.key === current) ? [...list, { key: current, name: current }] : list;
  });
  protected readonly folderKeys = computed(() => this.folderOptions().map(f => f.key));
  protected readonly folderLabels = computed(() => this.folderOptions().map(f => f.name || f.key));

  /** the name of a group picked while the form is open wins over the given one */
  protected readonly shownGroupName = linkedSignal(() => this.groupName());
  /** names of persons picked while the form is open, on top of `personNames` */
  private readonly pickedNames = linkedSignal<Record<string, string>>(() => ({ ...this.personNames() }));

  // i18n of the shared/ui primitives
  protected readonly nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().roomForm_name_label(),
    placeholder: this.i18n().roomForm_name_placeholder(),
    helper: this.i18n().roomForm_name_helper(),
  } as TextInputI18n));
  protected readonly modeI18n = computed(() => ({
    name: 'mode', label: this.i18n().roomForm_mode_label(), helper: this.i18n().roomForm_mode_helper(),
  } as StringSelectI18n));
  protected readonly modeLabels = computed(() => [this.i18n().roomForm_mode_menu(), this.i18n().roomForm_mode_group()]);
  protected readonly folderI18n = computed(() => ({
    name: 'folder', label: this.i18n().roomForm_folder_label(), helper: this.i18n().roomForm_folder_helper(),
  } as StringSelectI18n));
  protected readonly createFolderI18n = computed(() => ({
    name: 'createFolder', label: this.i18n().roomForm_createFolder_label(), helper: this.i18n().roomForm_createFolder_helper(),
  } as CheckboxI18n));
  protected readonly defaultTabI18n = computed(() => ({
    name: 'defaultTab', label: this.i18n().roomForm_defaultTab_label(), helper: this.i18n().roomForm_defaultTab_helper(),
  } as StringSelectI18n));
  protected readonly tabLabels = computed(() => [this.i18n().tab_files(), this.i18n().tab_videos(), this.i18n().tab_images()]);

  protected curatorsOf(topic: string): string[] {
    return this.curators().find(c => c.tag === topic)?.personKeys ?? [];
  }

  protected personName(personKey: string): string {
    return this.pickedNames()[personKey] || personKey;
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: RoomField, fieldValue: string | boolean | LearningCurators[]): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** Switching the access resets the root: a menu room picks a folder, a group room uses the group's. */
  protected onModeChange(value: string): void {
    const mode: RoomMode = value === 'group' ? 'group' : 'menu';
    if (mode === this.mode()) return;
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, mode, groupKey: '', folder: '', createFolder: false }));
    this.shownGroupName.set('');
  }

  protected onCreateFolderChange(createFolder: boolean): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, createFolder, folder: createFolder ? '' : vm.folder }));
  }

  /** A group room uses the group's existing folder (keyed by the group okey) as its root. */
  public async pickGroup(): Promise<void> {
    const group = await this.modelSelector.selectGroup();
    if (!group?.okey) return;
    this.shownGroupName.set(group.name);
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, groupKey: group.okey, folder: group.okey }));
  }

  /** Writes the topics and drops the curators of every topic that is gone. */
  protected onTopicsChange(topics: string): void {
    const list = parseTopics(topics);
    this.dirty.emit(true);
    this.formData.update(vm => ({
      ...vm,
      topics: list.join(','),
      curators: (vm.curators ?? []).filter(c => list.includes(c.tag)),
    }));
  }

  public async addCurator(topic: string): Promise<void> {
    const avatar = await this.modelSelector.selectPersonAvatar('', '', false, false, {
      accountsFirst: this.tenantId() || undefined,
      excludeKeys: this.curatorsOf(topic),
    });
    if (!avatar?.key) return;
    this.pickedNames.update(names => ({ ...names, [avatar.key]: getFullName(avatar.name1, avatar.name2) }));
    this.setCurators(topic, [...this.curatorsOf(topic), avatar.key]);
  }

  protected removeCurator(topic: string, personKey: string): void {
    this.setCurators(topic, this.curatorsOf(topic).filter(k => k !== personKey));
  }

  private setCurators(topic: string, personKeys: string[]): void {
    const others = this.curators().filter(c => c.tag !== topic);
    const curators = personKeys.length ? [...others, { tag: topic, personKeys }] : others;
    // keep the topic order of the room
    const order = this.topicList();
    curators.sort((a, b) => order.indexOf(a.tag) - order.indexOf(b.tag));
    this.onFieldChange('curators', curators);
  }
}
