import { Component, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonNote, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { CostCenterModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';

import { COST_CENTER_I18N_KEYS, costCenterLabel, costCenterPath, leafCostCenters } from '@okr/finance-cost-center-util';

export interface CostCenterSelectI18n {
  name: string;
  label: string;
  helper?: string;
}

/**
 * Picks a Kostenstelle for a booking line, an expense or a bill. The value is the cost centre's
 * `okey` ('' = ohne Kostenstelle, or what `emptyLabel` says). Only ACTIVE LEAVES are offered — groups and roots cannot be
 * booked on, and an archived cost centre takes no new costs. A key that is already selected is
 * still displayed even when it is archived (a historic line must keep showing what it was booked
 * on), it is just not offered again.
 *
 * Same modal + searchbar layout as `okr-account-select`: the search matches the number as a
 * prefix and the name as a substring; each entry shows its path in the tree as a note.
 */
@Component({
  selector: 'okr-cost-center-select',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonItem, IonInput, IonNote, IonIcon, IonModal, IonToolbar,
    IonTitle, IonButtons, IonButton, IonSearchbar, IonList, IonLabel
  ],
  styles: [`
    ion-item.helper { --min-height: 0; }
    ion-label.compact ion-note { font-size: 0.75rem; }
    ion-modal.cost-center {
      --width: 92%;
      --max-width: 520px;
      --height: 80%;
      --border-radius: 8px;
      --border-width: 1px;
      --border-style: solid;
      --border-color: var(--ion-color-medium, #92949c);
      --box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      --background: var(--ion-background-color, #fff);
    }
    /* own flex layout instead of ion-header/ion-content: an inline modal nested in
       another modal does not reliably get Ionic's .ion-page sizing (see okr-account-select) */
    .cost-center-picker {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ion-background-color, #fff);
    }
    .cost-center-results { flex: 1 1 auto; overflow-y: auto; }
  `],
  template: `
    <ion-item lines="none" [button]="!isReadOnly()" [detail]="false" (click)="open()">
      @if (isCompact()) {
        <ion-label class="compact">
          <div>{{ selectedCenter()?.id || '—' }}</div>
          <ion-note>{{ selectedCenter()?.name || emptyText() || i18n().label }}</ion-note>
        </ion-label>
      } @else {
        <ion-input
          [name]="i18n().name"
          type="text"
          label="{{ i18n().label }}"
          labelPlacement="floating"
          [value]="displayValue()"
          [readonly]="true"
          [clearInput]="false"
        />
      }
      @if (!isReadOnly()) {
        <ion-icon slot="end" src="{{ 'chevron-expand' | svgIcon }}" aria-hidden="true" />
      }
    </ion-item>
    @if (i18n().helper && !isCompact()) {
      <ion-item lines="none" class="helper" [button]="false">
        <ion-note style="white-space: pre-line">{{ i18n().helper }}</ion-note>
      </ion-item>
    }

    <ion-modal class="cost-center" [isOpen]="isOpen()" (ionModalDidDismiss)="close()" (ionModalDidPresent)="focusSearch()">
      <ng-template>
        <div class="cost-center-picker">
          <ion-toolbar color="primary">
            <ion-title>{{ i18n().label }}</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="close()">
                <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
          <ion-searchbar #costCenterSearch
            type="search" inputmode="search" show-clear-button="always"
            [debounce]="0" [placeholder]="ownI18n.search()"
            (ionInput)="onSearchtermChange($event)"
            (keyup.enter)="selectFirstMatch()"
          />
          <div class="cost-center-results">
            <ion-list>
              @if (isAllowEmpty()) {
                <ion-item button="true" detail="false" (click)="select('')">
                  <ion-label>{{ emptyText() }}</ion-label>
                </ion-item>
              }
              @for (center of filteredCenters(); track center.okey) {
                <ion-item button="true" detail="false" (click)="select(center.okey)">
                  <ion-label>
                    {{ center.id }} — {{ center.name }}
                    <p>{{ pathOf(center.okey) }}</p>
                  </ion-label>
                </ion-item>
              } @empty {
                <ion-item lines="none"><ion-label>{{ ownI18n.notFound() }}</ion-label></ion-item>
              }
            </ion-list>
          </div>
        </div>
      </ng-template>
    </ion-modal>
  `
})
export class CostCenterSelect {
  private readonly i18nService = inject(I18nService);

  /** the full list of the accounting tenant (archived included); only active leaves are offered */
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly selectedKey = model('');
  public readonly allowEmpty = input(true);
  /**
   * What choosing '' means, when it is not «ohne Kostenstelle» — e.g. «Standard des Kontos» on a
   * booking line, where writeBooking fills the account's default into an empty line.
   */
  public readonly emptyLabel = input('');
  public readonly readOnly = input(false);
  /** number + name-note instead of a labelled input; for table-like rows whose header names the column */
  public readonly compact = input(false);
  public readonly i18n = input.required<CostCenterSelectI18n>();

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCompact = computed(() => coerceBoolean(this.compact()));
  protected isAllowEmpty = computed(() => coerceBoolean(this.allowEmpty()));

  protected isOpen = signal(false);
  protected searchTerm = signal('');
  protected costCenterSearch = viewChild<IonSearchbar>('costCenterSearch');

  protected readonly ownI18n = this.i18nService.translateAll({
    search: COST_CENTER_I18N_KEYS.select_search,
    notFound: COST_CENTER_I18N_KEYS.select_notFound,
    none: COST_CENTER_I18N_KEYS.none,
    archived: COST_CENTER_I18N_KEYS.archived,
  });

  /** active leaves, sorted by number so a number search reads naturally */
  protected selectableCenters = computed(() =>
    [...leafCostCenters(this.costCenters())].sort((a, b) => a.id.localeCompare(b.id, 'de', { numeric: true })));

  /** looked up in the FULL list: an archived cost centre on a historic line is still shown */
  protected readonly selectedCenter = computed(() => this.costCenters().find(c => c.okey === this.selectedKey()));
  /** what '' means: the `emptyLabel` or «ohne Kostenstelle»; nothing when '' cannot be chosen */
  protected readonly emptyText = computed(() => this.isAllowEmpty() ? (this.emptyLabel() || this.ownI18n.none()) : '');
  /**
   * An empty selection shows what it means as the value: a blank field would show only its
   * floating label, which reads like a chosen value.
   */
  protected readonly displayValue = computed(() => {
    const _center = this.selectedCenter();
    if (!_center) return this.selectedKey() ? this.selectedKey() : this.emptyText();
    return _center.isArchived ? `${costCenterLabel(_center)} (${this.ownI18n.archived()})` : costCenterLabel(_center);
  });

  /** the number matches as a prefix (typing 3 narrows to the 3xx range), the name as a substring */
  protected readonly filteredCenters = computed(() => {
    const _term = this.searchTerm().trim().toLowerCase();
    if (_term.length === 0) return this.selectableCenters();
    return this.selectableCenters().filter(c =>
      c.id.toLowerCase().startsWith(_term) || c.name.toLowerCase().includes(_term));
  });

  protected pathOf(key: string): string {
    return costCenterPath(this.costCenters(), key);
  }

  protected open(): void {
    if (this.isReadOnly()) return;
    this.searchTerm.set('');
    this.isOpen.set(true);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected focusSearch(): void {
    setTimeout(() => this.costCenterSearch()?.setFocus(), 100);
  }

  protected onSearchtermChange($event: Event): void {
    this.searchTerm.set(($event.target as HTMLInputElement).value ?? '');
  }

  /** Enter on the searchbar takes the first remaining match — the fast path for typing a number */
  protected selectFirstMatch(): void {
    const _matches = this.filteredCenters();
    if (_matches.length > 0) this.select(_matches[0].okey);
  }

  protected select(key: string): void {
    this.selectedKey.set(key);
    this.close();
  }
}
