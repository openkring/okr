import { Component, computed, effect, inject, input } from '@angular/core';
import { IonAccordion, IonAvatar, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonRow } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared/i18n';
import { AvatarPipe, CategoryNamePipe, FullNamePipe, SvgIconPipe } from '@bk2/shared/pipes';
import { ModelType, WorkingRelModel } from '@bk2/shared/models';
import { RoleName } from '@bk2/shared/config';
import { hasRole, isOngoing } from '@bk2/shared/util';
import { EmptyListComponent } from '@bk2/shared/ui';
import { WorkingRelAccordionStore } from './working-rel-accordion.store';
import { WorkingRelTypes } from '@bk2/shared/categories';

@Component({
  selector: 'bk-working-rel-accordion',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe, CategoryNamePipe,
    EmptyListComponent,
    IonAccordion, IonItem, IonLabel, IonIcon, IonList, IonGrid, IonRow, IonCol, IonAvatar,
    IonImg, IonItemSliding, IonItemOptions, IonItemOption
  ],
  providers: [WorkingRelAccordionStore],
  styles: [`
    .list-avatar { margin-top: 0px; margin-bottom: 0px; width: 30px; height: 30px; }
    `],
  template: `
  <ion-accordion toggle-icon-slot="start" value="workingRels">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ title() | translate | async }}</ion-label>
    </ion-item>
    <div slot="content">
        @if(workingRels().length === 0) {
        <bk-empty-list message="@workingRel.field.empty" />
      } @else {
        <ion-list lines="inset">
          @for(workingRel of workingRels(); track $index) {
            <ion-item-sliding #slidingItem>
              <ion-grid (click)="edit(undefined, workingRel)">
                <ion-row>
                  <ion-col size="4">
                    <ion-item lines="none">
                      <ion-avatar slot="start" class="list-avatar">
                        <ion-img src="{{ modelType.Person + '.' + workingRel.subjectKey | avatar | async}}" alt="avatar of person" />
                      </ion-avatar>
                      <ion-label>{{workingRel.subjectName1 | fullName:workingRel.subjectName2}}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="4">
                    <ion-item lines="none">
                      <ion-label>{{ workingRel.type | categoryName:workingRelTypes }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="4">
                    <ion-item lines="none">
                      <ion-avatar slot="start" class="list-avatar">
                        <ion-img src="{{ modelType.Org + '.' + workingRel.objectKey | avatar | async}}" alt="logo of organization" />
                      </ion-avatar>
                      <ion-label>{{workingRel.objectName }}</ion-label>
                    </ion-item> 
                  </ion-col>
                </ion-row>
              </ion-grid>

              @if(hasRole('resourceAdmin')) {
                <ion-item-options side="end">
                  @if(hasRole('admin')) {
                    <ion-item-option color="danger" (click)="delete(slidingItem, workingRel)">
                      <ion-icon slot="icon-only" src="{{'trash_delete' | svgIcon }}" />
                    </ion-item-option>
                  }
                  @if(isOngoing(workingRel)) {
                  <ion-item-option color="warning" (click)="end(slidingItem, workingRel)">
                    <ion-icon slot="icon-only" src="{{'stop-circle' | svgIcon }}" />
                  </ion-item-option>
                } 
                  <ion-item-option color="primary" (click)="edit(slidingItem, workingRel)">
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
export class WorkingRelAccordionComponent {
  protected readonly workingRelStore = inject(WorkingRelAccordionStore);
  
  public personKey = input<string>();
  public color = input('light');
  public title = input('@workingRel.plural');

  protected workingRels = computed(() => this.workingRelStore.allWorkingRels());  // tbd: better define: a) all, b) open c) current year ...

  protected modelType = ModelType;
  protected workingRelTypes = WorkingRelTypes;

  constructor() {
    effect(() => {
      if (this.personKey()) {
        this.workingRelStore.setPersonKey(this.personKey() ?? '');
      }
    });
    effect(() => this.workingRelStore.setShowMode(hasRole('admin')));
  }

  /******************************* actions *************************************** */
  protected async edit(slidingItem?: IonItemSliding, workingRel?: WorkingRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (workingRel) await this.workingRelStore.edit(workingRel);
  }

  public async delete(slidingItem?: IonItemSliding, workingRel?: WorkingRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (workingRel) await this.workingRelStore.delete(workingRel);
  }

  public async end(slidingItem?: IonItemSliding, workingRel?: WorkingRelModel): Promise<void> {
    if (slidingItem) slidingItem.close();
    if (workingRel) await this.workingRelStore.end(workingRel);
  }
    
/******************************* helpers *************************************** */
  protected hasRole(role?: RoleName): boolean {
    return hasRole(role, this.workingRelStore.currentUser());
  }

  protected isOngoing(workingRel: WorkingRelModel): boolean {
    return isOngoing(workingRel.validTo);
  }
}
