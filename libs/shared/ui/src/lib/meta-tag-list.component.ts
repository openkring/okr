
import { AsyncPipe } from '@angular/common';
import { Component, input, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, ItemReorderEventDetail } from '@ionic/angular/standalone';
import { MaskitoDirective } from '@maskito/angular';

import { LowercaseWordMask, MaskPredicate } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { MetaTag } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { getIndexOfMetaTag } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-meta-tag-list',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    MaskitoDirective,
    IonList, IonItem, IonButton,
    IonLabel, IonInput, IonIcon,
    IonReorderGroup, IonReorder,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ title() | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-item lines="none">
          <ion-input name="name" [value]="newMetaTag.name" (ionInput)="onNameChanged($event)"
            label="name"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="20"
            placeholder="ssssss"
            [maskito]="wordMask()"
            [maskitoElement]="maskPredicate" />
          <ion-input name="content" [value]="newMetaTag.content" (ionInput)="onContentChanged($event)"
            label="content"
            labelPlacement="floating"
            inputMode="text"
            type="text"
            [counter]="true"
            [maxlength]="50"
            placeholder="string"/>
          <ion-button [disabled]="isDisabled()" (click)="add()">Add</ion-button>
        </ion-item>

        @if(metaTagList(); as metaTagList) {
          @if(metaTagList.length === 0) {
            <ion-item lines="none">
              <ion-label>{{'@input.meta.empty' | translate | async}}</ion-label>
            </ion-item>
          } @else {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group  [disabled]="false" (ionItemReorder)="reorder($any($event))">
                @for(metaTag of metaTagList; track metaTag.name) {
                  <ion-item>
                    <ion-reorder slot="start" />
                    <ion-label>{{ metaTag.name }}</ion-label>
                    <ion-label>{{ metaTag.content }}</ion-label>
                    <ion-icon src="{{'close_cancel_circle' | svgIcon }}" (click)="remove(metaTag.name)" slot="end" />
                  </ion-item>
                }
              </ion-reorder-group>
            </ion-list>
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class MetaTagListComponent {
  public metaTagList = model.required<MetaTag[]>(); // the keys of the menu items
  public title = input('@input.meta.label');
  public wordMask = input(LowercaseWordMask);
  public changed = output<void>();
  
  protected maskPredicate = MaskPredicate;
  protected newMetaTag: MetaTag = { name: '', content: '' };

  protected onNameChanged(event: CustomEvent): void {
    this.newMetaTag.name = event.detail.value;
  }

  protected onContentChanged(event: CustomEvent): void {
    this.newMetaTag.content = event.detail.value;
  }
  
  protected isDisabled() {
    return this.newMetaTag['name'] === '' || this.newMetaTag['content'] === '';
  }

  protected add(): void {
    if (this.newMetaTag.name.length > 0 && this.metaTagList()) {
      this.metaTagList().push(this.newMetaTag);
      this.newMetaTag = { name: '', content: '' };
      this.changed.emit();
    }
  }

  protected remove(metaTagName: string): void {
    this.metaTagList().splice(getIndexOfMetaTag(this.metaTagList(), metaTagName), 1);
    this.changed.emit();
  }

/**
 * Finish the reorder and position the item in the DOM based on where the gesture ended.
 * @param ev the custom dom event with the reordered items
 */
  protected reorder(ev: CustomEvent<ItemReorderEventDetail>) {
    this.metaTagList.set(ev.detail.complete(this.metaTagList()));
    this.changed.emit();
  }
}

