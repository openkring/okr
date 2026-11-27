import { Component, computed, effect, inject, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';

import { PersonsWidget } from '@okr/cms-section-ui';
import { ARTICLE_PROFILE, hidePeoplePerson, movePeoplePerson, removePeoplePerson, showPeoplePerson, type ArticleEditorI18n, type ArticlePreviewDevice } from '@okr/cms-section-util';
import type { AvatarInfo, PeopleConfig, PeopleSection } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { OptionalCardHeader } from '@okr/shared-ui';
import { fill, getAvatarName } from '@okr/shared-util-core';

import { PeopleSectionStore } from './people-section.store';

/**
 * The canvas of the people block editor (spec 1.181 §7.3): the section drawn by the reader's own `okr-persons-widget`, from the edited
 * (unsaved) section, with every person a block that can be selected. The selected one gets a frame: ↑ ↓, «Ausblenden» / «Wieder zeigen»
 * and, for hand-picked people, «Entfernen». Hidden people stay in place, faded. Alt+↑/↓ moves the selected person, Esc deselects.
 * Moving is by the arrows only: the widget draws the persons itself, so a cdk drag handle in the frame would find no cdkDrag to belong to.
 *
 * It holds its own `PeopleSectionStore`; what the editor needs of it is public below. Only reachable through the lazily loaded editor.
 */
@Component({
  selector: 'okr-people-editor-canvas',
  standalone: true,
  imports: [OptionalCardHeader, PersonsWidget, SvgIconPipe, IonButton, IonIcon],
  providers: [PeopleSectionStore],
  host: { '(keydown)': 'onKeydown($event)' },
  styles: [`
    :host { display: block; overflow: auto; overscroll-behavior: contain; background: var(--ion-color-light, #f4f5f8); }
    .stage { margin: 16px auto; padding: 8px 0 16px; background: var(--ion-background-color, #fff); color: var(--ion-text-color, #000); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12); }
    .stage.auto { margin: 0; box-shadow: none; }
    .list-name { padding: 8px 16px 0; font-weight: 600; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px 16px; color: var(--ion-color-medium); }
    .add { display: flex; padding: 0 8px; }
    /* the frame of the selected person sits on top of its picture */
    .frame { position: absolute; top: 4px; left: 4px; right: 4px; z-index: 2; display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; }
    .frame ion-button { margin: 0; --padding-start: 6px; --padding-end: 6px; --background: var(--ion-background-color, #fff); --color: var(--ion-text-color, #000); --box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }
  `],
  template: `
    @let t = i18n();
    @let s = section();
    <div class="stage" [class.auto]="device() === 'auto'" [style.max-width.px]="width()">
      <okr-optional-card-header [intro]="s.intro" [introPosition]="s.introPosition" [title]="s.title" [subTitle]="s.subTitle" />
      @if (listName(); as name) { <div class="list-name">{{ name }}</div> }
      @if (persons().length === 0 && !loading()) {
        <div class="empty">
          <span>{{ t.people_editor_empty() }}</span>
          @if (isPersons()) {
            <ion-button size="small" fill="outline" (click)="add.emit()">
              <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" aria-hidden="true" />{{ t.people_editor_add() }}
            </ion-button>
          }
        </div>
      } @else {
        <okr-persons-widget
          [persons]="persons()" [avatarConfig]="store.avatarConfig()" [emails]="store.emails()" [functions]="store.functions()" [imageKeys]="store.imageKeys()"
          [editMode]="true" [selectable]="true" [selectedKey]="selectedKey()" [hiddenKeys]="store.hiddenKeys()" [frame]="frame" [i18n]="store.i18n"
          (personSelected)="selectPerson.emit($event)" />
        @if (isPersons()) {
          <div class="add">
            <ion-button fill="clear" [title]="t.people_editor_add()" [attr.aria-label]="t.people_editor_add()" (click)="add.emit()">
              <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" aria-hidden="true" />
            </ion-button>
          </div>
        }
      }
    </div>

    <!-- inside the selected person: its own clicks and keys never reach the widget, which would select again -->
    <ng-template #frame let-person>
      @let index = indexOf(person.key);
      <div class="frame" role="toolbar" [attr.aria-label]="frameLabel(person)"
        (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()" (keydown.space)="$event.stopPropagation()">
        <ion-button size="small" [disabled]="index <= 0" [title]="t.people_editor_up()" [attr.aria-label]="t.people_editor_up()" (click)="move(person.key, -1, $event)">
          <ion-icon slot="icon-only" src="{{ 'arrow-up' | svgIcon }}" aria-hidden="true" />
        </ion-button>
        <ion-button size="small" [disabled]="index < 0 || index >= persons().length - 1" [title]="t.people_editor_down()" [attr.aria-label]="t.people_editor_down()" (click)="move(person.key, 1, $event)">
          <ion-icon slot="icon-only" src="{{ 'arrow-down' | svgIcon }}" aria-hidden="true" />
        </ion-button>
        @if (isHidden(person.key)) {
          <ion-button size="small" [title]="t.people_editor_show()" [attr.aria-label]="t.people_editor_show()" (click)="show(person.key, $event)">
            <ion-icon slot="icon-only" src="{{ 'eye-on' | svgIcon }}" aria-hidden="true" />
          </ion-button>
        } @else {
          <ion-button size="small" [title]="t.people_editor_hide()" [attr.aria-label]="t.people_editor_hide()" (click)="hide(person.key, $event)">
            <ion-icon slot="icon-only" src="{{ 'eye-off' | svgIcon }}" aria-hidden="true" />
          </ion-button>
        }
        @if (isPersons()) {
          <ion-button size="small" color="danger" [title]="t.people_editor_remove()" [attr.aria-label]="t.people_editor_remove()" (click)="remove(person.key, $event)">
            <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" aria-hidden="true" />
          </ion-button>
        }
      </div>
    </ng-template>
  `,
})
export class PeopleEditorCanvas {
  protected readonly store = inject(PeopleSectionStore);

  // inputs
  /** the edited section, not saved yet */
  public readonly section = input.required<PeopleSection>();
  public readonly selectedKey = input<string | undefined>();
  /** 'auto' on a phone: the whole width */
  public readonly device = input<ArticlePreviewDevice>('desktop');
  public readonly i18n = input.required<ArticleEditorI18n>();

  // outputs
  /** a person was selected, or nothing (Esc) */
  public readonly selectPerson = output<string | undefined>();
  /** a change made in the canvas (move, hide, show, remove) */
  public readonly configChange = output<PeopleConfig>();
  /** «+»: add a hand-picked person */
  public readonly add = output<void>();

  // for the editor
  /** every person of the source in the drawn order, the hidden ones included */
  public readonly persons = computed<AvatarInfo[]>(() => this.store.allPersons());
  public readonly personKeys = computed(() => this.persons().map((person) => person.key));
  /** the source's own order, before any override: a move back to it stores no `orderKeys` */
  public readonly naturalKeys = computed(() => this.store.sourcePersons().map((person) => person.key));
  /** person key → function shown with the person (responsibilities) */
  public readonly functions = computed(() => this.store.functions());
  /** while the source is read: before, `personKeys` is not complete */
  public readonly loading = computed(() => this.store.isLoading());

  protected readonly width = computed(() => this.device() === 'auto' ? null : ARTICLE_PROFILE.width[this.device()] ?? null);
  protected readonly isPersons = computed(() => (this.section().properties.type ?? 'persons') === 'persons');
  protected readonly listName = computed(() => this.store.avatarConfig().title?.trim());
  private readonly config = computed(() => this.section().properties);

  constructor() {
    effect(() => this.store.setSection(this.section()));
  }

  protected indexOf(key: string): number {
    return this.personKeys().indexOf(key);
  }

  protected isHidden(key: string): boolean {
    return this.store.hiddenKeys().includes(key);
  }

  protected frameLabel(person: AvatarInfo): string {
    return fill(this.i18n().people_editor_frame(), { name: getAvatarName(person) });
  }

  // ------------------------------------------------------- changes -------------------------------------------------------

  protected move(key: string, delta: -1 | 1, event?: Event): void {
    event?.stopPropagation();
    const next = movePeoplePerson(this.config(), this.personKeys(), key, delta, this.naturalKeys());
    if (next.persons !== this.config().persons || next.orderKeys !== this.config().orderKeys) this.configChange.emit(next);
  }

  protected hide(key: string, event: Event): void {
    event.stopPropagation();
    this.configChange.emit(hidePeoplePerson(this.config(), key, this.persons().find((p) => p.key === key)));
  }

  protected show(key: string, event: Event): void {
    event.stopPropagation();
    this.configChange.emit(showPeoplePerson(this.config(), key));
  }

  protected remove(key: string, event: Event): void {
    event.stopPropagation();
    this.configChange.emit(removePeoplePerson(this.config(), key));
    this.selectPerson.emit(undefined);
  }

  /** Alt+↑/↓ moves the selected person; Esc deselects it (the widget tells that) and does not close the editor. */
  protected onKeydown(event: KeyboardEvent): void {
    const key = this.selectedKey();
    // a key that undo or another source left behind selects nobody: Esc closes as usual
    if (key === undefined || !this.personKeys().includes(key)) return;
    if (event.key === 'Escape') {
      // the widget deselects too when the focus is in it; a second «nothing» changes nothing
      event.stopPropagation();
      this.selectPerson.emit(undefined);
      return;
    }
    if (!event.altKey || event.metaKey || event.ctrlKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    this.move(key, event.key === 'ArrowUp' ? -1 : 1);
  }
}
