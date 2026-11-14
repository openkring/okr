import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import {
  IonAvatar, IonCheckbox, IonContent, IonIcon, IonItem, IonItemDivider,
  IonLabel, IonList, IonSelect, IonSelectOption, ModalController
} from '@ionic/angular';

import { PersonModel, PersonModelName, UserModel } from '@okr/shared-models';
import { FullNamePipe, SvgIconPipe } from '@okr/shared-pipes';
import { ChangeConfirmation, ChangeConfirmationI18n, EmptyList, Header, Spinner, ImgDirective } from '@okr/shared-ui';

import { AvatarPipe } from '@okr/avatar-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

import { PersonSelectStore } from './person-select.store';

export type PersonSelectResult =
  | { kind: 'predefined'; person: PersonModel }
  | { kind: 'custom'; label: string }
  /** Only with `multiple`: the checked persons, in the order the picker lists them. */
  | { kind: 'multi'; persons: PersonModel[] };

@Component({
  selector: 'okr-person-select-modal',
  standalone: true,
  imports: [
    ImgDirective, Header, Spinner, NgTemplateOutlet,
    FullNamePipe, AvatarPipe, EmptyList, SvgIconPipe,
    IonContent, IonItem, IonItemDivider, IonLabel, IonAvatar, IonList, IonIcon,
    IonSelect, IonSelectOption, IonCheckbox, ChangeConfirmation,
  ],
  providers: [PersonSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
    ion-checkbox.row-check { margin-inline-end: 12px; }
  `],
  template: `
    <okr-header
      [searchTerm]="searchTerm()"
      (searchTermChange)="onSearchTermChange($event)"
      [isSearchable]="true"
      [i18n]="{ title: multiple() ? store.i18n.person_select_multi() : store.i18n.person_select() }"
      [isModal]="true"
    />
    @if(multiple() && checkedCount() > 0) {
      <!-- multi-select: the standard confirmation bar takes the checked persons; cancel clears the checks -->
      <okr-change-confirmation [i18n]="confirmationI18n()" (saveClicked)="confirmMulti()" (cancelClicked)="clearChecks()" />
    }
    <ion-content>
      @if(multiple()) {
        <ion-list lines="full">
          <ion-item class="item">
            <!-- select-all acts on the list as currently filtered (search term, tag, group) -->
            <ion-checkbox class="all-check" labelPlacement="end" justify="start"
              [checked]="isAllSelected()"
              [indeterminate]="isIndeterminate()"
              [disabled]="visiblePersons().length === 0"
              (ionChange)="toggleAll($any($event).detail.checked)">{{ store.i18n.person_select_all() }}</ion-checkbox>
          </ion-item>
        </ion-list>
      }
      @if(isGroupSelectVisible()) {
        <ion-list lines="full">
          <ion-item class="item">
            <ion-select [label]="store.i18n.person_group()" interface="popover"
              [value]="store.groupKey()"
              (ionChange)="onGroupChange($any($event).detail.value)">
              <ion-select-option value="">{{ store.i18n.person_group_all() }}</ion-select-option>
              @for(group of groups(); track group.okey) {
                <ion-select-option [value]="group.okey">{{ group.name }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
        </ion-list>
      }
      @if(isLoading()) {
        <okr-spinner />
      } @else {
        @if(store.showCustomEntry()) {
          <ion-list lines="none">
            <ion-item class="item" color="light" (click)="selectCustom()">
              <ion-icon src="{{ 'edit' | svgIcon }}" slot="start" />
              <ion-label>
                <h3>„{{ store.customLabel() }}"</h3>
                <p>{{ store.i18n.person_custom_use() }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        }
        @if(selectedPersonsCount() === 0 && !store.showCustomEntry()) {
          <okr-empty-list [message]="isGroupEmpty() ? store.i18n.person_group_empty() : store.i18n.person_empty()" />
        } @else {
          @for(person of memberSection(); track person.okey) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: person }" />
          }
          @if(store.showOtherDivider()) {
            <!-- the non-member remainder follows — say so, or these names look like members -->
            <ion-item-divider color="light">
              <ion-label>{{ store.accountsFirst() ? store.i18n.person_beyond_accounts() : store.i18n.person_beyond_members() }}</ion-label>
            </ion-item-divider>
          }
          @for(person of otherSection(); track person.okey) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: person }" />
          }
        }
      }
    </ion-content>

    <ng-template #row let-person>
      <ion-list lines="none">
        @if(multiple()) {
          <ion-item class="item">
            <ion-checkbox slot="start" class="row-check"
              [attr.aria-label]="person.firstName | fullName:person.lastName"
              [checked]="checkedKeys().has(person.okey)"
              (ionChange)="toggle(person.okey, $any($event).detail.checked)" />
            <ion-avatar slot="start">
              <img okrImg src="{{ 'person.' + person.okey | avatar:defaultIcon }}" alt="Avatar Logo" />
            </ion-avatar>
            <ion-label>{{person.firstName | fullName:person.lastName}}</ion-label>
          </ion-item>
        } @else {
          <ion-item class="item" (click)="select(person)">
            <ion-avatar slot="start">
              <img okrImg src="{{ 'person.' + person.okey | avatar:defaultIcon }}" alt="Avatar Logo" />
            </ion-avatar>
            <ion-label>{{person.firstName | fullName:person.lastName}}</ion-label>
          </ion-item>
        }
      </ion-list>
    </ng-template>
  `
})
export class PersonSelectModal {
  protected readonly store = inject(PersonSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public selectedTag = input.required<string>();
  public currentUser = input.required<UserModel>();
  public allowCustom = input<boolean>(false);
  /** Opt-in two-level lookup (members of the default org first). Off everywhere but trip/logbuch. */
  public membersFirst = input<boolean>(false);
  /** When set, persons holding an app account in THIS tenant come first — see PersonSelectStore. */
  public accountsFirst = input<string>('');
  /** okeys never offered, e.g. those already picked by the caller. */
  public excludeKeys = input<string[]>([]);
  /** Preselects a group: only its ACTIVE person members are listed. '' = all persons. */
  public groupKey = input<string>('');
  /** Multi-select with checkboxes, select-all and a confirm button; dismisses { kind: 'multi' }. */
  public multiple = input<boolean>(false);
  /**
   * Shows the group selector above the list. Unset: shown in multi-select or when a group is
   * preselected, hidden otherwise — so existing single-select callers look unchanged.
   */
  public showGroupSelect = input<boolean | undefined>(undefined);

  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected memberSection = computed(() => this.store.memberSection() ?? []);
  protected otherSection = computed(() => this.store.otherSection() ?? []);
  protected selectedPersonsCount = computed(() => this.store.matchCount());
  protected isLoading = computed(() => this.store.isLoading());

  protected groups = computed(() => this.store.appStore.allGroups() ?? []);
  protected isGroupSelectVisible = computed(() => this.showGroupSelect() ?? (this.multiple() || this.groupKey().length > 0));
  /** A group is chosen, but it has no active member (before search/tag narrowing). */
  protected isGroupEmpty = computed(() => this.store.groupKey().length > 0 && this.store.scopedPersons().length === 0);

  // multi-select: the checks survive a change of search term or group, so several groups can be combined
  protected checkedKeys = signal<Set<string>>(new Set());
  protected checkedCount = computed(() => this.checkedKeys().size);
  protected readonly confirmationI18n = computed(() => ({
    save: `${this.store.i18n.person_confirm()} (${this.checkedCount()})`,
    cancel: this.store.i18n.person_clear(),
  } as ChangeConfirmationI18n));
  protected visiblePersons = computed(() => [...this.memberSection(), ...this.otherSection()]);
  protected isAllSelected = computed(() => {
    const visible = this.visiblePersons();
    const keys = this.checkedKeys();
    return visible.length > 0 && visible.every(p => keys.has(p.okey));
  });
  protected isIndeterminate = computed(() => {
    const visible = this.visiblePersons();
    const keys = this.checkedKeys();
    const checked = visible.filter(p => keys.has(p.okey)).length;
    return checked > 0 && checked < visible.length;
  });

  protected defaultIcon = this.store.appStore.getCategoryIcon('model_type', PersonModelName);

  constructor() {
    effect(() => {
      this.store.setSelectedTag(this.selectedTag());
    });
    effect(() => {
      this.store.setCurrentUser(this.currentUser());
    });
    effect(() => {
      this.store.setAllowCustom(this.allowCustom());
    });
    effect(() => {
      this.store.setMembersFirst(this.membersFirst());
    });
    effect(() => {
      this.store.setAccountsFirst(this.accountsFirst());
    });
    effect(() => {
      this.store.setExcludeKeys(this.excludeKeys());
    });
    effect(() => {
      this.store.setGroupKey(this.groupKey());
    });
    effect(() => {
      this.store.setMultiple(this.multiple());
    });
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onGroupChange(groupKey: string | null | undefined): void {
    this.store.setGroupKey(groupKey ?? '');
  }

  protected toggle(okey: string, checked: boolean): void {
    this.checkedKeys.update(keys => {
      const updated = new Set(keys);
      if (checked) updated.add(okey); else updated.delete(okey);
      return updated;
    });
  }

  protected toggleAll(checked: boolean): void {
    // ionChange also fires when [checked] is re-bound; only act on a real change of the visible set
    if (checked === this.isAllSelected()) return;
    this.checkedKeys.update(keys => {
      const updated = new Set(keys);
      for (const person of this.visiblePersons()) {
        if (checked) updated.add(person.okey); else updated.delete(person.okey);
      }
      return updated;
    });
  }

  protected clearChecks(): void {
    this.checkedKeys.set(new Set());
  }

  public confirmMulti(): Promise<boolean> {
    const keys = this.checkedKeys();
    // every eligible person, not just the visible ones: a check made under another group or search counts too
    const persons = this.store.persons().filter(p => keys.has(p.okey));
    return dismissOverlay(this.modalController, { kind: 'multi', persons } satisfies PersonSelectResult, 'confirm');
  }

  public select(person: PersonModel): Promise<boolean> {
    return dismissOverlay(this.modalController, { kind: 'predefined', person } satisfies PersonSelectResult, 'confirm');
  }

  public selectCustom(): Promise<boolean> {
    return dismissOverlay(this.modalController, { kind: 'custom', label: this.store.customLabel() } satisfies PersonSelectResult, 'confirm');
  }
}
