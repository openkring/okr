import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map, of } from 'rxjs';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton,
} from '@ionic/angular';

import { AvatarConfig, AvatarInfo, CategoryListModel, isSameValue, PeopleConfig, PeopleSection, RoleName, SectionModel, UserModel } from '@okr/shared-models';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { fill, getAvatarName, hasRole } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ResponsibilityService } from '@okr/relationship-responsibility-data-access';
import {
  ArticleEditorI18n, clearPeopleResponsibilityParent, getFieldAndItemErrors, getFieldErrors, getPeopleResponsibilityIds, getPeopleResponsibilityParentKey,
  hidePeoplePerson, normalizeAvatarConfig, peopleField, pickErrors, removePeoplePerson, removePeopleResponsibility, restErrors, SectionErrors,
  setPeoplePersonLabel, setPeopleSource, showAllPeople, showPeoplePerson, type PeopleSourceType,
} from '@okr/cms-section-util';

import { ARTICLE_PANEL_STYLES } from './article-panel.styles';
import { PeopleLookConfig } from './people-look-configuration';
import { SectionPanel } from './section-panel';

/** The person selected in the canvas, as the panel shows it. */
export interface PeoplePanelPerson {
  person: AvatarInfo;
  /** where the person comes from, ready to show («Von Hand ausgewählt», «Kommt aus der Gruppe …») */
  source: string;
  /** the function shown with the person: its label, or the one of its responsibility / membership */
  func: string;
  hidden: boolean;
}

/** What the panel asks the editor to pick: a person, a group, a responsibility, or the group whose responsibilities follow. */
export type PeoplePanelPick = 'person' | 'group' | 'responsibility' | 'parent';

const SOURCES: PeopleSourceType[] = ['persons', 'group', 'responsibility'];
/** «Mehr»: the avatar texts typed here */
type MoreField = 'altText' | 'linkedSection' | 'title';

/**
 * The side panel of the people block editor (spec 1.181 §7.4). With a person selected: its name, function, where it comes from and
 * what can be done with it. Without: «Abschnitt» (`okr-section-panel`: who sees the section, how wide it is, where the intro stands,
 * behind its toggle type, key, tags and notes) and in it «Wer wird gezeigt», «Aussehen», «Mehr». Title, subtitle and intro are typed in the canvas; their errors stand at the top.
 * Every change sets `section` once; nothing is set on init. Picking is left to the editor (`pick`).
 */
@Component({
  selector: 'okr-people-panel',
  standalone: true,
  imports: [
    ErrorNote, TextInput, PeopleLookConfig, SectionPanel, SvgIconPipe,
    IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonIcon, IonLabel, IonNote, IonSegment, IonSegmentButton,
  ],
  host: { role: 'region', '[attr.aria-label]': 'regionLabel()' },
  styles: [ARTICLE_PANEL_STYLES, `
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 0 8px; }
    .source { padding: 8px 8px 4px; }
    .person-name { padding: 4px 16px 8px; font-size: 1.05rem; font-weight: 600; }
    .read-only { display: block; padding: 4px 16px; }
    .read-only strong { display: block; font-size: 0.8rem; font-weight: normal; opacity: 0.75; }
  `],
  template: `
    @let t = i18n();
    @if (selected(); as sel) {
      <div class="panel-head">
        <ion-button fill="clear" size="small" [title]="t.people_editor_person_back()" [attr.aria-label]="t.people_editor_person_back()" (click)="deselect.emit()">
          <ion-icon slot="icon-only" src="{{ 'arrow-back' | svgIcon }}" aria-hidden="true" />
        </ion-button>
        <h2>{{ t.people_editor_person_title() }}</h2>
      </div>
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <div class="person-name">{{ personName(sel.person) }}</div>
          @if (isPersons()) {
            <okr-text-input [i18n]="functionI18n()" [value]="sel.person.label ?? ''" (valueChange)="setLabel(sel.person.key, $event)" [readOnly]="false" />
            <okr-error-note [errors]="labelErrors(sel.person.key)" />
          } @else {
            <div class="read-only"><strong>{{ t.people_info_function() }}</strong>{{ sel.func || '–' }}</div>
            <ion-note class="note">{{ t.people_editor_person_function() }}</ion-note>
          }
          <ion-note class="note">{{ sel.source }}</ion-note>
          @if (sel.hidden) { <ion-note class="note outdated">{{ t.people_editor_person_hidden() }}</ion-note> }
          <div class="actions">
            @if (sel.hidden) {
              <ion-button size="small" fill="outline" (click)="show(sel.person.key)">
                <ion-icon slot="start" src="{{ 'eye-on' | svgIcon }}" aria-hidden="true" />{{ t.people_editor_show() }}
              </ion-button>
            } @else {
              <ion-button size="small" fill="outline" (click)="hide(sel.person.key)">
                <ion-icon slot="start" src="{{ 'eye-off' | svgIcon }}" aria-hidden="true" />{{ t.people_editor_hide() }}
              </ion-button>
            }
            @if (isPersons()) {
              <ion-button size="small" fill="outline" color="danger" (click)="remove(sel.person.key)">
                <ion-icon slot="start" src="{{ 'trash' | svgIcon }}" aria-hidden="true" />{{ t.people_editor_remove() }}
              </ion-button>
            }
          </div>
        </ion-card-content>
      </ion-card>
    } @else {
      <!-- «Abschnitt» as in every section editor; «Wer», «Aussehen» and «Mehr» stand between its settings and tags and notes -->
      <okr-section-panel [section]="section()" (sectionChange)="set($event)" [(showDetails)]="sectionDetails"
        [currentUser]="currentUser()" [roles]="roles()" [states]="states()" [allTags]="allTags()" [i18n]="t" [errors]="fieldErrors()">
      <!-- an error that no field below shows, so that a missing save banner is never unexplained -->
      <ng-container ngProjectAs="[okrPanelErrors]">
        @for (error of rest(); track error.field) { <okr-error-note [errors]="error.messages" /> }
      </ng-container>

      <ion-card>
        <ion-card-header><ion-card-title>{{ t.people_editor_who_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <div class="source">
            <ion-segment [value]="type()" [attr.aria-label]="t.people_editor_who_label()" (ionChange)="setSource($event.detail.value)">
              @for (source of sources; track source) {
                <ion-segment-button [value]="source"><ion-label>{{ sourceLabels()[source] }}</ion-label></ion-segment-button>
              }
            </ion-segment>
          </div>
          @switch (type()) {
            @case ('persons') {
              <div class="chips">
                @for (person of config().persons; track person.key) {
                  <ion-chip color="primary">
                    <ion-label>{{ personName(person) }}</ion-label>
                    <ion-button fill="clear" size="small" [attr.aria-label]="removeLabel(personName(person))" (click)="remove(person.key)">
                      <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" aria-hidden="true" />
                    </ion-button>
                  </ion-chip>
                }
              </div>
              <div class="actions">
                <ion-button size="small" fill="outline" (click)="pick.emit('person')">
                  <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" aria-hidden="true" />{{ t.people_editor_add() }}
                </ion-button>
              </div>
            }
            @case ('group') {
              <div class="actions">
                <ion-button size="small" fill="outline" (click)="pick.emit('group')">
                  <ion-icon slot="start" src="{{ 'search' | svgIcon }}" aria-hidden="true" />{{ groupName() || config().groupId || t.select_group() }}
                </ion-button>
              </div>
            }
            @case ('responsibility') {
              <div class="chips">
                @for (id of responsibilityIds(); track id) {
                  <ion-chip color="primary">
                    <ion-label>{{ responsibilityName(id) }}</ion-label>
                    <ion-button fill="clear" size="small" [attr.aria-label]="removeLabel(responsibilityName(id))" (click)="removeResponsibility(id)">
                      <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" aria-hidden="true" />
                    </ion-button>
                  </ion-chip>
                }
                @if (parentKey()) {
                  <ion-chip color="secondary">
                    <ion-label>{{ parentLabel() }}</ion-label>
                    <ion-button fill="clear" size="small" [attr.aria-label]="removeLabel(parentLabel())" (click)="clearParent()">
                      <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" aria-hidden="true" />
                    </ion-button>
                  </ion-chip>
                }
              </div>
              <div class="actions">
                <ion-button size="small" fill="outline" (click)="pick.emit('responsibility')">
                  <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" aria-hidden="true" />{{ t.select_responsibility() }}
                </ion-button>
                @if (!parentKey()) {
                  <ion-button size="small" fill="outline" (click)="pick.emit('parent')">
                    <ion-icon slot="start" src="{{ 'search' | svgIcon }}" aria-hidden="true" />{{ t.select_responsibility_parent() }}
                  </ion-button>
                }
              </div>
            }
          }
          @if (hiddenCount() > 0) {
            <div class="actions">
              <ion-note>{{ hiddenText() }}</ion-note>
              <ion-button size="small" fill="clear" (click)="showAll()">{{ t.people_editor_showAll() }}</ion-button>
            </div>
          }
          <okr-error-note [errors]="errorsFor('hiddenKeys')" />
          <okr-error-note [errors]="errorsFor('orderKeys')" />
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>{{ t.people_editor_look_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <okr-people-look-config [config]="config()" (configChange)="setConfig($event)" [readOnly]="false" [i18n]="t" [errors]="fieldErrors()" />
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header><ion-card-title>{{ t.people_editor_more_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <okr-text-input [i18n]="altTextI18n()" [value]="avatar().altText" (valueChange)="setAvatarText('altText', $event)" [readOnly]="false" [showHelper]="true" />
          <okr-error-note [errors]="avatarErrors('altText')" />
          <okr-text-input [i18n]="linkedSectionI18n()" [value]="avatar().linkedSection" (valueChange)="setAvatarText('linkedSection', $event)" [readOnly]="false" [showHelper]="true" />
          <okr-error-note [errors]="avatarErrors('linkedSection')" />
          @if (showListName()) {
            <okr-text-input [i18n]="listNameI18n()" [value]="avatar().title" (valueChange)="setAvatarText('title', $event)" [readOnly]="false" [showHelper]="true" />
            <okr-error-note [errors]="avatarErrors('title')" />
          }
        </ion-card-content>
      </ion-card>

      </okr-section-panel>
    }
  `,
})
export class PeoplePanel {
  private readonly responsibilityService = inject(ResponsibilityService);

  // inputs
  public readonly section = model.required<PeopleSection>();
  /** the person selected in the canvas; undefined: the section itself */
  public readonly selected = input<PeoplePanelPerson | undefined>();
  /** how many persons of the source this section hides */
  public readonly hiddenCount = input(0);
  /** the name of the chosen group, if known */
  public readonly groupName = input('');
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input('');
  public readonly i18n = input.required<ArticleEditorI18n>();
  /** every error of the section, as `peopleSectionValidations(...).getErrors()` gives them */
  public readonly errors = input<SectionErrors>({});

  // outputs
  public readonly pick = output<PeoplePanelPick>();
  public readonly deselect = output<void>();

  // the section
  protected readonly config = computed<PeopleConfig>(() => this.section().properties);
  protected readonly type = computed<PeopleSourceType>(() => this.config().type ?? 'persons');
  protected readonly isPersons = computed(() => this.type() === 'persons');
  protected readonly avatar = computed(() => normalizeAvatarConfig(this.config().avatar));
  protected readonly responsibilityIds = computed(() => getPeopleResponsibilityIds(this.config()));
  protected readonly parentKey = computed(() => getPeopleResponsibilityParentKey(this.config()));
  protected readonly parentLabel = computed(() => fill(this.i18n().select_responsibility_parent_chip(), {
    name: this.config().responsibilityParentName?.trim() || this.parentKey(),
  }));
  /** «Listenname» only for the legacy sections that have one: once seen it stays, so that emptying it does not hide the field */
  protected readonly showListName = signal(false);

  protected readonly sources = SOURCES;
  protected readonly sourceLabels = computed<Record<PeopleSourceType, string>>(() => ({
    persons: this.i18n().people_editor_source_persons(), group: this.i18n().people_editor_source_group(), responsibility: this.i18n().people_editor_source_responsibility(),
  }));
  protected readonly hiddenText = computed(() => fill(this.i18n().people_editor_hiddenCount(), { count: String(this.hiddenCount()) }));
  protected readonly regionLabel = computed(() => this.selected() ? this.i18n().people_editor_person_title() : this.i18n().people_editor_title_edit());

  /** responsibility okey → name, for the chips (only read while the source is responsibilities) */
  private readonly responsibilityNames = rxResource({
    params: () => ({ load: this.type() === 'responsibility' && !!this.currentUser() }),
    stream: ({ params }) => params.load
      ? this.responsibilityService.list().pipe(map((list) => Object.fromEntries(list.map((r) => [r.okey, r.name])) as Record<string, string>))
      : of({} as Record<string, string>),
  });

  // errors: every one stands in exactly one place
  private readonly shown = computed(() => [
    'name', 'title', 'subTitle', 'intro', 'introPosition', 'avatar.', 'hiddenKeys', 'orderKeys', 'persons[',
    ...(this.hasRole('privileged') ? ['tags'] : []), ...(this.hasRole('admin') ? ['notes'] : []),
  ]);
  protected readonly fieldErrors = computed(() => pickErrors(this.errors(), this.shown()));
  protected readonly rest = computed(() => restErrors(this.errors(), this.shown()));

  // field texts
  protected readonly functionI18n = computed(() => ({
    name: 'label', label: this.i18n().people_info_function(), placeholder: '', helper: '',
  } as TextInputI18n));
  protected readonly altTextI18n = computed(() => ({
    name: 'altText', label: this.i18n().people_altText_label(), placeholder: this.i18n().people_altText_placeholder(), helper: this.i18n().people_altText_helper(),
  } as TextInputI18n));
  protected readonly linkedSectionI18n = computed(() => ({
    name: 'linkedSection', label: this.i18n().people_linkedSection_label(), placeholder: this.i18n().people_linkedSection_placeholder(), helper: this.i18n().people_linkedSection_helper(),
  } as TextInputI18n));
  protected readonly listNameI18n = computed(() => ({
    name: 'title', label: this.i18n().people_editor_listName_label(), placeholder: this.i18n().people_title_placeholder(), helper: this.i18n().people_editor_listName_helper(),
  } as TextInputI18n));
  /** the toggle in the head of «Abschnitt»: type and key, tags and notes */
  protected readonly sectionDetails = signal(false);

  constructor() {
    effect(() => {
      if (this.config().avatar?.title?.trim()) untracked(() => this.showListName.set(true));
    });
  }

  /************************************** changes *********************************************** */
  protected set(section: SectionModel | PeopleSection): void {
    if (!isSameValue(section, this.section())) this.section.set(section as PeopleSection);
  }

  protected setConfig(properties: PeopleConfig): void {
    this.set({ ...this.section(), properties });
  }

  private change(go: (config: PeopleConfig) => PeopleConfig): void {
    this.setConfig(go(this.config()));
  }

  protected setSource(value: unknown): void {
    if (SOURCES.includes(value as PeopleSourceType) && value !== this.type()) this.change((c) => setPeopleSource(c, value as PeopleSourceType));
  }

  protected setAvatarText(field: MoreField, value: string): void {
    if ((this.avatar()[field] ?? '') === value) return;
    this.change((c) => ({ ...c, avatar: { ...c.avatar, [field]: value } as AvatarConfig }));
  }

  protected setLabel(key: string, label: string): void {
    const person = this.config().persons.find((p) => p.key === key);
    if (person && (person.label ?? '') !== label) this.change((c) => setPeoplePersonLabel(c, key, label));
  }

  protected hide(key: string): void { this.change((c) => hidePeoplePerson(c, key, this.selected()?.person)); }
  protected show(key: string): void { this.change((c) => showPeoplePerson(c, key)); }
  protected showAll(): void { this.change(showAllPeople); }
  protected removeResponsibility(id: string): void { this.change((c) => removePeopleResponsibility(c, id)); }
  protected clearParent(): void { this.change(clearPeopleResponsibilityParent); }

  /** The selected person is gone then: the panel shows the section. */
  protected remove(key: string): void {
    this.change((c) => removePeoplePerson(c, key));
    if (this.selected()?.person.key === key) this.deselect.emit();
  }

  /************************************** texts *********************************************** */
  protected personName(person: AvatarInfo): string {
    return getAvatarName(person);
  }

  protected responsibilityName(id: string): string {
    return this.responsibilityNames.value()?.[id] || id;
  }

  protected removeLabel(name: string): string {
    return `${this.i18n().people_editor_remove()}: ${name}`;
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.fieldErrors(), field);
  }

  protected avatarErrors(field: MoreField): string[] {
    return getFieldAndItemErrors(this.fieldErrors(), peopleField(field));
  }

  /** errors of the function of a hand-picked person, if the suite has any */
  protected labelErrors(key: string): string[] {
    const index = this.config().persons.findIndex((p) => p.key === key);
    return index < 0 ? [] : getFieldAndItemErrors(this.errors(), `persons[${index}]`);
  }
}
