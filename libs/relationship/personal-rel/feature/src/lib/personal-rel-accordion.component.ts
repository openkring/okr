import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAccordion, IonAvatar, IonButton, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonRow } from '@ionic/angular/standalone';

import { PersonalRelTypes } from '@bk2/shared-categories';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ModelType, PersonalRelModel, RoleName } from '@bk2/shared-models';
import { FullNamePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent } from '@bk2/shared-ui';
import { hasRole, isOngoing } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';
import { PersonalRelNamePipe } from '@bk2/relationship-personal-rel-util';
import { PersonalRelAccordionStore } from './personal-rel-accordion.store';

@Component({
  selector: 'bk-personal-rel-accordion',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe, PersonalRelNamePipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonIcon, IonList, IonButton,
    IonImg, IonItemSliding, IonItemOptions, IonItemOption, IonGrid, IonRow, IonCol, IonAvatar
  ],
  providers: [PersonalRelAccordionStore],
  styles: [`
    .list-avatar { margin-top: 0px; margin-bottom: 0px; width: 30px; height: 30px; }
  `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="personalRels">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
      @if(hasRole('resourceAdmin')) {
        <ion-button fill="clear" (click)="add()" size="default">
          <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
        </ion-button>
      }
    </ion-item>
    <div slot="content">
        @if(relsCount() === 0) {
        <bk-empty-list message="@personalRel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(personalRel of personalRels(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-grid (click)="edit(undefined, personalRel)">
                <ion-row>
                  <ion-col size="3" size-md="4">
                    <ion-item lines="none">
                      <ion-avatar slot="start" class="list-avatar">
                        <ion-img src="{{ modelType.Person + '.' + personalRel.subjectKey | avatar | async}}" alt="avatar of first person" />
                      </ion-avatar>
                      <ion-label class="ion-hide-md-down">{{personalRel.subjectFirstName | fullName:personalRel.subjectLastName}}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="6" size-md="4">
                    <ion-item lines="none">
                      <ion-label>{{ personalRel.type | personalRelName:personalRel.label }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="3" size-md="4">
                    <ion-item lines="none">
                      <ion-avatar slot="start" class="list-avatar">
                        <ion-img src="{{ modelType.Person + '.' + personalRel.objectKey | avatar | async}}" alt="avatar of second person" />
                      </ion-avatar>
                      <ion-label class="ion-hide-md-down">{{personalRel.objectFirstName | fullName:personalRel.objectLastName}}</ion-label>
                    </ion-item> 
                  </ion-col>
                </ion-row>
              </ion-grid>

              @if(hasRole('resourceAdmin')) {
                <ion-item-options side="end">
                  @if(hasRole('admin')) {
                    <ion-item-option color="danger" (click)="delete(slidingItem, personalRel)">
                      <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                    </ion-item-option>
                  }
                  @if(isOngoing(personalRel)) {
                  <ion-item-option color="warning" (click)="end(slidingItem, personalRel)">
                    <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                  </ion-item-option>
                } 
                  <ion-item-option color="primary" (click)="edit(slidingItem, personalRel)">
                    <ion-icon slot="icon-only" src="{{'create_edit' | svgIcon }}" />
                  </ion-item-option>
                </ion-item-options>
              }
            </ion-item-sliding> 
          }
        </ion-list>
      }
    </div>
  </ion-accordion>
  `,
})
export class PersonalRelAccordionComponent {
  protected readonly personalRelStore = inject(PersonalRelAccordionStore);

  public personKey = input.required<string>();
  public color = input('light');
  public title = input('@personalRel.plural');

  protected personalRels = computed(() => this.personalRelStore.allPersonalRels());  // tbd: better define: a) all, b) open c) current year ...
  protected relsCount = computed(() => this.personalRels().length);

  protected modelType = ModelType;
  protected personalRelTypes = PersonalRelTypes;

  constructor() {
    effect(() => {
      if (this.personKey() && this.personKey().length > 0) {
        this.personalRelStore.setPersonKey(this.personKey());
      }
    });
    effect(() => this.personalRelStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async add(): Promise<void> {
    await this.personalRelStore.add();
  }

  protected async edit(slidingItem?: IonItemSliding, personalRel?: PersonalRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (personalRel) await this.personalRelStore.edit(personalRel);
  }

  public async delete(slidingItem?: IonItemSliding, personalRel?: PersonalRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (personalRel) await this.personalRelStore.delete(personalRel);
  }

  public async end(slidingItem?: IonItemSliding, personalRel?: PersonalRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (personalRel) await this.personalRelStore.end(personalRel);
  }

  /******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.personalRelStore.currentUser());
  }

  protected isOngoing(personalRel: PersonalRelModel): boolean {
    return isOngoing(personalRel.validTo);
  }
}
