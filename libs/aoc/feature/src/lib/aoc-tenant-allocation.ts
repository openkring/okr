import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, inject } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Header, ResultLog } from '@okr/shared-ui';
import { AvatarInfo } from '@okr/shared-models';
import { AvatarDisplay } from '@okr/avatar-ui';
import { AllocationTile } from '@okr/aoc-util';

import { AocTenantAllocationStore } from './aoc-tenant-allocation.store';

/**
 * Move a person between tenants (spec 1.47).
 *
 * One card per model — today only `Person`, but the structure is the point: adding orgs,
 * resources, locations, pages or sections is another card plus another branch in the
 * callable, not another screen (D-TA-7).
 *
 * Drag & drop is the shortcut, not the mechanism: every tile also carries a button, because a
 * drag gesture is reachable by neither keyboard nor screenreader. `add` grants (right column,
 * moves a tile into `current`); `remove` revokes (left column, moves a tile into `available`).
 */
@Component({
  selector: 'okr-aoc-tenant-allocation',
  standalone: true,
  imports: [
    SvgIconPipe, Header, AvatarDisplay, ResultLog,
    CdkDropListGroup, CdkDropList, CdkDrag,
    IonContent, IonCard, IonCardHeader, IonCardContent, IonCardTitle,
    IonGrid, IonRow, IonCol, IonLabel, IonButton, IonIcon, IonNote,
  ],
  providers: [AocTenantAllocationStore],
  template: `
    <okr-header [i18n]="{ title: store.i18n.allocation_title() }" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.allocation_person_select_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row><ion-col>{{ store.i18n.allocation_person_select_content() }}</ion-col></ion-row>
            <ion-row>
              @if (avatar(); as avatar) {
                <ion-label>
                  <okr-avatar-display [avatars]="[avatar]" [showName]="true" />
                  <ion-icon src="{{ 'cancel' | svgIcon }}" slot="end" (click)="store.clearPerson()" />
                </ion-label>
              } @else {
                <ion-button (click)="store.selectPerson()">
                  <ion-icon src="{{ 'personSearch' | svgIcon }}" slot="start" />
                  {{ store.i18n.allocation_person_select_button() }}
                </ion-button>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if (store.selectedPerson()) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ store.i18n.allocation_card_person() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid cdkDropListGroup>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-label>{{ store.i18n.allocation_column_current() }}</ion-label>
                  <div class="tenant-column" cdkDropList [cdkDropListData]="'current'"
                       (cdkDropListDropped)="onDrop($event, 'revoke')">
                    @for (tile of store.lists().current; track tile.tenantId) {
                      <div class="tile" cdkDrag [cdkDragData]="tile" [cdkDragDisabled]="!tile.draggable">
                        <span>{{ tile.label }}</span>
                        @if (tile.draggable) {
                          <ion-button fill="clear" size="small" [attr.aria-label]="store.i18n.allocation_revoke_title() + ': ' + tile.label"
                                      (click)="store.move(tile, 'revoke')">
                            <ion-icon src="{{ 'remove' | svgIcon }}" slot="icon-only" />
                          </ion-button>
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
                       (cdkDropListDropped)="onDrop($event, 'grant')">
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
          </ion-card-content>
        </ion-card>
      }

      <okr-result-log [title]="store.logTitle()" [cardTitle]="store.i18n.allocation_result()" [log]="store.log()" />
    </ion-content>
  `,
  styles: [`
    .tenant-column { min-height: 120px; border: 1px dashed var(--ion-color-medium); border-radius: 8px; padding: 8px; }
    .tile { display: flex; align-items: center; justify-content: space-between; gap: 8px;
            padding: 8px; margin-bottom: 6px; border-radius: 6px; background: var(--ion-color-light); cursor: grab; }
    .tile[aria-disabled='true'] { cursor: default; opacity: .8; }
  `],
})
export class AocTenantAllocation {
  protected readonly store = inject(AocTenantAllocationStore);

  constructor() {
    void this.store.loadTenantConfigs();
  }

  protected readonly avatar = computed(() => {
    const person = this.store.selectedPerson();
    if (!person) return undefined;
    return {
      key: person.okey,
      name1: person.firstName,
      name2: person.lastName,
      label: '',
      modelType: 'person',
      type: '',
      subType: '',
    } as AvatarInfo;
  });

  /** A drop into the OPPOSITE column is a move; a drop into its own column is a no-op. */
  protected async onDrop(event: CdkDragDrop<string>, direction: 'grant' | 'revoke'): Promise<void> {
    if (event.previousContainer === event.container) return;
    const tile = event.item.data as AllocationTile;
    await this.store.move(tile, direction);
  }
}
