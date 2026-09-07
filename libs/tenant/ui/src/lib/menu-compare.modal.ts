import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonContent, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import type { MenuItemModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import type { FeaturePickerI18n, MenuSpec } from '@okr/tenant-util';
import { pinnedFieldsOf, STRUCTURAL_FIELDS } from '@okr/tenant-util';
import type { StructuralField } from '@okr/tenant-util';

/** Every field the compare table shows, in display order. */
const COMPARE_FIELDS = [
  'url', 'action', 'roleNeeded', 'label', 'icon', 'iconAlt', 'labelAlt', 'index',
  'description', 'tags', 'tenants', 'menuItems', 'isArchived', 'forkedFrom', 'ownedFields',
] as const satisfies readonly (keyof MenuItemModel)[];

type CompareField = (typeof COMPARE_FIELDS)[number];

type Owner = 'catalogue' | 'pinned' | 'tenant';

interface CompareRow {
  field: CompareField;
  labelKey: keyof FeaturePickerI18n;
  database: string;
  catalogue: string;
  owner: Owner;
}

/** Which `MenuSpec` fields the catalogue actually declares — the rest have no catalogue value. */
const SPEC_FIELDS: ReadonlySet<string> = new Set<keyof MenuSpec>(
  ['url', 'action', 'roleNeeded', 'icon', 'label', 'iconAlt', 'labelAlt']);

const FIELD_LABEL_KEYS: Record<CompareField, keyof FeaturePickerI18n> = {
  url: 'compare_field_url',
  action: 'compare_field_action',
  roleNeeded: 'compare_field_role_needed',
  label: 'compare_field_label',
  icon: 'compare_field_icon',
  iconAlt: 'compare_field_icon_alt',
  labelAlt: 'compare_field_label_alt',
  index: 'compare_field_index',
  description: 'compare_field_description',
  tags: 'compare_field_tags',
  tenants: 'compare_field_tenants',
  menuItems: 'compare_field_menu_items',
  isArchived: 'compare_field_is_archived',
  forkedFrom: 'compare_field_forked_from',
  ownedFields: 'compare_field_owned_fields',
};

/**
 * «(i) auf jeder Zeile» — every field of one menu document, database vs. catalogue, each
 * tagged by who owns it: `Katalog` for the three structural fields (`url`/`action`/
 * `roleNeeded`), `fixiert` when the tenant pinned that field (`ownedFields`), `Mandant`
 * for everything else (label, icon, description, … — D-BB-7 fields, written once on
 * create and never rewritten by the catalogue).
 *
 * NO shared-original column. A fork's original lives outside this tenant's
 * `MenuService.list()` scope (`MenuService.fork` removes the tenant from the original's
 * `tenants[]` on detach) — resolving it would need a new, unscoped server read that does
 * not exist yet. A column that always renders a dash promises a comparison this screen
 * can never make, which is worse than not offering it (task 11 review round 1) — so a
 * forked document instead gets one plain-text note (`compare_fork_note`) pointing at
 * `forkedFrom` as the identifier a developer would look the original up with, and stops
 * there.
 *
 * Read-only — a diagnostic view, not an editor. The three writing actions live on the
 * table row that opened this modal, not here.
 */
@Component({
  selector: 'okr-menu-compare-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonItem, IonLabel, IonList, ChangeConfirmation, Header],
  template: `
    <okr-header [i18n]="{ title: i18n().compare_title() }" [isModal]="true" />
    <okr-change-confirmation
      [i18n]="changeConfirmationI18n()" [showCancel]="false" (saveClicked)="close()" />
    <ion-content>
      @if (doc().forkedFrom) {
        <ion-item lines="full">
          <ion-label class="ion-text-wrap">{{ i18n().compare_fork_note() }}</ion-label>
        </ion-item>
      }
      <ion-list>
        <ion-item lines="full">
          <ion-label class="ion-text-wrap"><strong>{{ i18n().compare_col_field() }}</strong></ion-label>
          <ion-label class="ion-text-wrap" slot="end"><strong>{{ i18n().compare_col_database() }}</strong></ion-label>
        </ion-item>
        @for (row of rows(); track row.field) {
          <ion-item lines="full">
            <ion-label class="ion-text-wrap">
              {{ i18n()[row.labelKey]() }}
              <p>{{ i18n().compare_col_owner() }}: {{ ownerLabel(row.owner) }}</p>
            </ion-label>
            <ion-label class="ion-text-wrap" slot="end">
              {{ row.database }}
              <p>{{ i18n().compare_col_catalogue() }}: {{ row.catalogue }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class MenuCompareModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public doc = input.required<MenuItemModel>();
  public spec = input<MenuSpec | undefined>(undefined);
  public i18n = input.required<FeaturePickerI18n>();

  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: '', save: this.i18n().compare_close(),
  }));

  protected readonly rows = computed<CompareRow[]>(() => {
    const doc = this.doc();
    const spec = this.spec();
    const pinned = new Set(pinnedFieldsOf(doc));

    return COMPARE_FIELDS.map(field => ({
      field,
      labelKey: FIELD_LABEL_KEYS[field],
      database: this.format(doc[field]),
      catalogue: SPEC_FIELDS.has(field) ? this.format(spec?.[field as keyof MenuSpec]) : this.format(undefined),
      owner: this.ownerOf(field, pinned),
    }));
  });

  private ownerOf(field: CompareField, pinned: ReadonlySet<StructuralField>): Owner {
    if ((STRUCTURAL_FIELDS as readonly string[]).includes(field) && pinned.has(field as StructuralField)) {
      return 'pinned';
    }
    return (STRUCTURAL_FIELDS as readonly string[]).includes(field) ? 'catalogue' : 'tenant';
  }

  protected ownerLabel(owner: Owner): string {
    switch (owner) {
      case 'catalogue': return this.i18n().compare_owner_catalogue();
      case 'pinned': return this.i18n().compare_owner_pinned();
      case 'tenant': return this.i18n().compare_owner_tenant();
    }
  }

  private format(value: unknown): string {
    if (value === undefined || value === null || value === '') return '—';
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
    if (typeof value === 'boolean') return value ? this.i18n().compare_bool_true() : this.i18n().compare_bool_false();
    return String(value);
  }

  protected async close(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}
