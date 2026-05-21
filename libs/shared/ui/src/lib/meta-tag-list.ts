import { Component, input, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonReorder, IonReorderGroup, ItemReorderEventDetail } from '@ionic/angular/standalone';

import { MaskitoDirective } from '@maskito/angular';
import { MaskitoElementPredicate } from '@maskito/core';

import { LowercaseWordMask } from '@bk2/shared-config';
import { MetaTag } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { getIndexOfMetaTag } from '@bk2/shared-util-core';

export interface MetaTagListI18n {
  title: string;
  empty: string;
}

@Component({
  selector: 'bk-meta-tag-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    MaskitoDirective,
    IonList, IonItem, IonButton,
    IonLabel, IonInput, IonIcon,
    IonReorderGroup, IonReorder,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().title }}</ion-card-title>
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
              <ion-label>{{ i18n().empty }}</ion-label>
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
                    <ion-icon src="{{'cancel' | svgIcon }}" (click)="remove(metaTag.name)" slot="end" />
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
export class MetaTagList {
  // inputs
  public metaTagList = model.required<MetaTag[]>(); // the keys of the menu items
  public i18n = input<MetaTagListI18n>({ title: 'Meta-Tags', empty: 'Keine Meta-Tags' });
  public wordMask = input(LowercaseWordMask);

  // outputs
  public changed = output<void>();
  
  // passing constants to template
  readonly maskPredicate: MaskitoElementPredicate = async (el) => (el as HTMLIonInputElement).getInputElement();
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

