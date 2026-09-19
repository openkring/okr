import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, effect, inject, input } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { ResultLog } from '@okr/shared-ui';
import { AllocationDirection, AllocationSubjectType } from '@okr/shared-models';
import { AvatarDisplay } from '@okr/avatar-ui';
import { AllocationTile, TenantConfigMeta } from '@okr/aoc-util';

import { AocTenantAllocationStore } from './aoc-tenant-allocation.store';

/**
 * One allocation card: pick a record, then move it between tenants (spec 1.47, D-TA-7).
 *
 * The card is the per-model unit — persons, orgs and resources differ only in which select
 * modal opens, whether there are addresses at all, and whether a grant may also open a user
 * account. All three differences live in `ALLOCATION_SUBJECTS`; this component is the same
 * markup for all of them.
 *
 * It PROVIDES its own store, which is what keeps three cards on one page independent: three
 * selections, three result logs, no shared `selectedSubject` to clobber.
 *
 * Drag & drop is the shortcut, not the mechanism: every tile also carries a button, because a
 * drag gesture is reachable by neither keyboard nor screenreader. `add` grants (right column,
 * moves a tile into `current`); `remove` revokes (left column, moves a tile into `available`).
 *
 * A tile in the LEFT column carries a second `add` button: the top-up (D-TA-8). The record is
 * already with that tenant, but data collected since — or deliberately held back the first
 * time — never reaches it, and no drag gesture can express "grant to a tenant it already has".
 * That is why the top-up is button-only: a drop within the same column stays a no-op.
 */
@Component({
  selector: 'okr-allocation-card',
  standalone: true,
  imports: [
    SvgIconPipe, AvatarDisplay, ResultLog,
    CdkDropListGroup, CdkDropList, CdkDrag,
    IonCard, IonCardHeader, IonCardContent, IonCardTitle,
    IonGrid, IonRow, IonCol, IonLabel, IonButton, IonIcon, IonNote,
  ],
  providers: [AocTenantAllocationStore],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ cardTitle() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row><ion-col>{{ selectHint() }}</ion-col></ion-row>
          <ion-row>
            @if (store.subject(); as subject) {
              <ion-label>
                <okr-avatar-display [avatars]="[subject.avatar]" [showName]="true" />
                <ion-icon src="{{ 'cancel' | svgIcon }}" slot="end" (click)="store.clear()" />
              </ion-label>
            } @else {
              <ion-button (click)="store.select()">
                <ion-icon src="{{ 'personSearch' | svgIcon }}" slot="start" />
                {{ selectButton() }}
              </ion-button>
            }
          </ion-row>
        </ion-grid>

        @if (store.subject()) {
          <ion-grid cdkDropListGroup>
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-label>{{ store.i18n.allocation_column_current() }}</ion-label>
                <div class="tenant-column" cdkDropList [cdkDropListData]="'current'"
                     (cdkDropListDropped)="onDrop($event)">
                  @for (tile of store.lists().current; track tile.tenantId) {
                    <div class="tile" cdkDrag [cdkDragData]="tile" [cdkDragDisabled]="!tile.draggable">
                      <span>{{ tile.label }}</span>
                      @if (tile.draggable) {
                        <span class="tile-actions">
                          <ion-button fill="clear" size="small" [attr.aria-label]="store.i18n.allocation_topup_button() + ': ' + tile.label"
                                      [title]="store.i18n.allocation_topup_button()"
                                      (click)="store.move(tile, 'grant')">
                            <ion-icon src="{{ 'add' | svgIcon }}" slot="icon-only" />
                          </ion-button>
                          <ion-button fill="clear" size="small" [attr.aria-label]="store.i18n.allocation_revoke_title() + ': ' + tile.label"
                                      [title]="store.i18n.allocation_revoke_title()"
                                      (click)="store.move(tile, 'revoke')">
                            <ion-icon src="{{ 'remove' | svgIcon }}" slot="icon-only" />
                          </ion-button>
                        </span>
                      } @else {
                        <ion-note>{{ store.i18n.allocation_own_tenant_hint() }}</ion-note>
                      }
                    </div>
                  } @empty {
                    <ion-note>{{ store.i18n.allocation_column_empty() }}</ion-note>
                  }
                </div>
              </ion-col>

              <ion-col size="12" size-md="6">
                <ion-label>{{ store.i18n.allocation_column_available() }}</ion-label>
                <div class="tenant-column" cdkDropList [cdkDropListData]="'available'"
                     (cdkDropListDropped)="onDrop($event)">
                  @for (tile of store.lists().available; track tile.tenantId) {
                    <div class="tile" cdkDrag [cdkDragData]="tile">
                      <ion-button fill="clear" size="small" [attr.aria-label]="store.i18n.allocation_grant_title() + ': ' + tile.label"
                                  (click)="store.move(tile, 'grant')">
                        <ion-icon src="{{ 'add' | svgIcon }}" slot="icon-only" />
                      </ion-button>
                      <span>{{ tile.label }}</span>
                    </div>
                  } @empty {
                    <ion-note>{{ store.i18n.allocation_column_empty() }}</ion-note>
                  }
                </div>
              </ion-col>
            </ion-row>
          </ion-grid>

          <okr-result-log [title]="store.logTitle()" [cardTitle]="store.i18n.allocation_result()" [log]="store.log()" />
        }
      </ion-card-content>
    </ion-card>
  `,
  styles: [`
    .tenant-column { min-height: 120px; border: 1px dashed var(--ion-color-medium); border-radius: 8px; padding: 8px; }
    .tile { display: flex; align-items: center; justify-content: space-between; gap: 8px;
            padding: 8px; margin-bottom: 6px; border-radius: 6px; background: var(--ion-color-light); cursor: grab; }
    .tile[aria-disabled='true'] { cursor: default; opacity: .8; }
    .tile-actions { display: flex; align-items: center; }
  `],
})
export class AllocationCard {
  protected readonly store = inject(AocTenantAllocationStore);

  public modelType = input.required<AllocationSubjectType>();
  /** Loaded once by the page — every card draws its right-hand column from the same list. */
  public tenantConfigs = input.required<Record<string, TenantConfigMeta>>();
  public cardTitle = input.required<string>();
  public selectHint = input.required<string>();
  public selectButton = input.required<string>();

  constructor() {
    effect(() => this.store.init(this.modelType()));
    effect(() => this.store.setTenantConfigs(this.tenantConfigs()));
  }

  /**
   * A drop into the OPPOSITE column is a move; a drop into its own column is a no-op.
   *
   * `cdkDropListDropped` fires on the DESTINATION list, not the source — so the direction must
   * be derived from where the tile CAME FROM, never hard-coded per list. Out of the available
   * column means granting; out of the current column means revoking.
   */
  protected async onDrop(event: CdkDragDrop<string>): Promise<void> {
    if (event.previousContainer === event.container) return;
    const direction: AllocationDirection = event.previousContainer.data === 'available' ? 'grant' : 'revoke';
    const tile = event.item.data as AllocationTile;
    await this.store.move(tile, direction);
  }
}
