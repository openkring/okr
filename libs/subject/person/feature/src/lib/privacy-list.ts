import { Component, computed, inject, signal } from '@angular/core';
import { IonBadge, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonMenuButton, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { NameDisplay, PersonModel, PrivacyUsage } from '@okr/shared-models';
import { FullNamePipe } from '@okr/shared-pipes';
import { EmptyList } from '@okr/shared-ui';
import { I18nService } from '@okr/shared-i18n';

import { getPrivacyUsage, hasPrivacyChanges, isPrivacyRestricted, PERSON_I18N_KEYS, PersonI18n, PRIVACY_USAGE_FIELDS, PrivacyUsageFields } from '@okr/subject-person-util';

/**
 * Read-only overview of the `usage*` privacy preferences (PENDING 2.83) — one row per person,
 * one badge column per setting, and one filter that pulls the work list the feature exists for:
 * who may not be photographed before an event.
 *
 * **Direction.** The filter is worded as an outcome ("Fotos" ⇒ the people who restricted their
 * picture) and never offers an operator on a number — see `isPrivacyRestricted`, where the
 * comparison and the reason for it live.
 *
 * **Read-only on purpose.** Bulk-editing other people's privacy preferences is the opposite of
 * what this page is for; changes stay in the person form, one at a time.
 *
 * **Source is `persons`**, not `users`: the `usage*` flags on the person are authoritative
 * (`person-privacy.util` mirrors the user's self-service edits onto it), persons are
 * tenant-readable and users are not, and persons without a login must appear here too.
 *
 * The route is gated on privileged ∨ memberAdmin: the list is a directory of who shields what
 * and is more sensitive as an aggregate than any single row. Unlike the birthday list, that gate
 * is the *only* protection — persons are tenant-readable, so no Firestore rule backs it up.
 * Do not relax it, and do not add an export here without the legal note the spec asks for
 * (handing the list to a photographer is a disclosure to a third party).
 */
@Component({
  selector: 'okr-privacy-list',
  standalone: true,
  imports: [
    FullNamePipe, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle,
    IonContent, IonList, IonItem, IonLabel, IonBadge, IonSelect, IonSelectOption,
  ],
  styles: [`
    ion-badge { min-width: 100%; text-align: center; font-weight: normal; }
    .col { flex: 1 1 0; }
  `],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ rows().length }} {{ i18n.privacy() }}</ion-title>
    </ion-toolbar>

    <ion-toolbar color="light">
      <ion-item lines="none">
        <ion-select [value]="filter()" (ionChange)="filter.set($event.detail.value)"
          [label]="i18n.privacy_hint()" labelPlacement="stacked" interface="popover">
          <ion-select-option [value]="''">{{ i18n.privacy_filter_all() }}</ion-select-option>
          <ion-select-option value="usageImages">{{ label('usageImages') }}</ion-select-option>
          <ion-select-option value="changed">{{ i18n.privacy_filter_changed() }}</ion-select-option>
        </ion-select>
      </ion-item>
    </ion-toolbar>

    <ion-toolbar color="light" class="ion-hide-sm-down">
      <ion-item lines="none">
        <ion-label class="col"><strong>{{ i18n.name() }}</strong></ion-label>
        @for (field of fields; track field) {
          <ion-label class="col"><strong>{{ label(field) }}</strong></ion-label>
        }
      </ion-item>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    @if (rows().length === 0) {
      <okr-empty-list [message]="i18n.privacy_empty()" />
    } @else {
      <ion-list lines="inset">
        @for (person of rows(); track person.okey) {
          <ion-item>
            <ion-label class="col">{{ person.firstName | fullName:person.lastName:nameDisplay() }}</ion-label>
            @for (field of fields; track field) {
              <ion-label class="col ion-hide-sm-down">
                <ion-badge [color]="color(person, field)">{{ tierLabel(person, field) }}</ion-badge>
              </ion-label>
            }
          </ion-item>
        }
      </ion-list>
    }
  </ion-content>
  `,
})
export class PrivacyList {
  private readonly appStore = inject(AppStore);

  protected readonly i18n = inject(I18nService).translateAll(PERSON_I18N_KEYS) as PersonI18n;
  protected readonly fields = PRIVACY_USAGE_FIELDS;
  /** '' = all persons · 'usageImages' = who restricted their picture · 'changed' = who set anything at all. */
  protected readonly filter = signal<'' | 'usageImages' | 'changed'>('');

  protected readonly nameDisplay = computed(() => this.appStore.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);

  protected readonly rows = computed<PersonModel[]>(() => {
    const filter = this.filter();
    return this.appStore.allPersons()
      .filter((person) => !filter || (filter === 'changed' ? hasPrivacyChanges(person) : isPrivacyRestricted(person, filter)))
      .sort((a, b) => (a.lastName ?? '').localeCompare(b.lastName ?? ''));
  });

  protected label(field: keyof PrivacyUsageFields): string {
    return this.i18n[`privacy_f_${field}` as keyof PersonI18n]();
  }

  /** Pictures get their own wording: usageImages is a declaration, not a visibility tier. */
  protected tierLabel(person: PersonModel, field: keyof PrivacyUsageFields): string {
    const tier = ['public', 'restricted', 'protected'][getPrivacyUsage(person, field)];
    const key = field === 'usageImages' ? `privacy_ti_${tier}` : `privacy_t_${tier}`;
    return this.i18n[key as keyof PersonI18n]();
  }

  protected color(person: PersonModel, field: keyof PrivacyUsageFields): string {
    const usage = getPrivacyUsage(person, field);
    return usage === PrivacyUsage.Public ? 'success' : usage === PrivacyUsage.Restricted ? 'warning' : 'danger';
  }
}
