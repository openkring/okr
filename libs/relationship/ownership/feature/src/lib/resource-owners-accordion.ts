import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAccordion, IonAvatar, IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular';

import { OwnershipModel, ResourceModel } from '@okr/shared-models';
import { DurationPipe, SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ImgDirective } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';
import { getOwnerName } from '@okr/relationship-ownership-util';

import { OwnershipStore } from './ownership.store';

/**
 * The users (Nutzer/innen) of one resource, shown in the resource detail view — current and past
 * ownerships, most recent first. A tap opens the ownership ActionSheet (Nutzer/in, Nutzung…);
 * the add button («Nutzung hinzufügen») is there when the accordion is not read-only.
 */
@Component({
  selector: 'okr-resource-owners-accordion',
  standalone: true,
  imports: [
    ImgDirective, DurationPipe, SvgIconPipe, AvatarPipe, EmptyList,
    IonAccordion, IonItem, IonLabel, IonList, IonButton, IonIcon, IonAvatar
  ],
  providers: [OwnershipStore],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
  `],
  template: `
    <ion-accordion toggle-icon-slot="start" value="owners">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ store.i18n.ownerships() }}</ion-label>
        @if(!isReadOnly()) {
          <ion-button fill="clear" (click)="add($event)" size="default">
            <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
          </ion-button>
        }
      </ion-item>
      <div slot="content">
        @if(ownerships().length === 0) {
          <okr-empty-list [message]="store.i18n.empty()" />
        } @else {
          <ion-list lines="inset">
            @for(ownership of ownerships(); track ownership.okey) {
              <ion-item (click)="showActions(ownership)">
                <ion-avatar slot="start">
                  <img okrImg src="{{ ownership.ownerModelType + '.' + ownership.ownerKey | avatar:(ownership.ownerModelType === 'org' ? 'org' : 'person') }}" alt="Avatar of the user" />
                </ion-avatar>
                <ion-label>{{ getOwnerName(ownership) }}</ion-label>
                <ion-label>{{ ownership.validFrom | duration:ownership.validTo }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      </div>
    </ion-accordion>
  `
})
export class ResourceOwnersAccordion {
  protected readonly store = inject(OwnershipStore);

  // inputs
  public resource = input.required<ResourceModel>();
  public readonly color = input('primary');
  public readonly readOnly = input(true);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived fields
  protected readonly ownerships = computed(() => this.store.resourceOwnerships());

  constructor() {
    effect(() => this.store.setResourceKey(this.resource().okey));
  }

  /******************************* actions *************************************** */
  protected async add($event: Event): Promise<void> {
    $event.stopPropagation();   // don't toggle the accordion
    await this.store.addOwnershipFor(this.resource(), this.isReadOnly());
  }

  protected async showActions(ownership: OwnershipModel): Promise<void> {
    await this.store.showResourceActions(this.resource(), ownership, false);
  }

  /******************************* helpers *************************************** */
  protected getOwnerName(ownership: OwnershipModel): string {
    return getOwnerName(ownership);
  }
}
