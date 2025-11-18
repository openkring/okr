import { AsyncPipe } from '@angular/common';
import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { NameDisplays, ViewPositions } from '@bk2/shared-categories';
import { CaseInsensitiveWordMask } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AvatarInfo, NameDisplay, ViewPosition } from '@bk2/shared-models';
import { AvatarsComponent, CategoryComponent, CheckboxComponent, EditorComponent, NumberInputComponent, TextInputComponent } from '@bk2/shared-ui';

import { SectionFormModel } from '@bk2/cms-section-util';

@Component({
  selector: 'bk-people-list-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid,
    CategoryComponent, EditorComponent, AvatarsComponent,
    CheckboxComponent, TextInputComponent, NumberInputComponent
  ],
  template: `
    @if(vm(); as vm) {
      <bk-avatars (changed)="onPeopleListChange($event)" (selectClicked)="selectClicked.emit()"
            [avatars]="persons()"
            defaultIcon="person"
            [readOnly]="readOnly()"
            title="@content.type.peopleList.label"
            addLabel="@content.type.peopleList.addLabel" />

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@content.type.peopleList.editorLabel' | translate | async}}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <bk-cat name="imagePosition" [(value)]="position" [readOnly]="readOnly()" [categories]="viewPositions" />
          <bk-editor [content]="htmlContent()" [readOnly]="false" (contentChange)="onContentChange($event)" />                                             
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@content.type.peopleList.configLabel' | translate | async}}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                <bk-text-input name="title" [(value)]="title" [readOnly]="readOnly()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="altText" [(value)]="altText" [readOnly]="readOnly()" [showHelper]=true />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showName" [isChecked]="showName()" [readOnly]="readOnly()" />
              </ion-col>  
              <ion-col size="12" size-md="6">
                <bk-checkbox name="showLabel" [isChecked]="showLabel()" [readOnly]="readOnly()" />
              </ion-col>  
              <ion-col size="12" size-md="6">
                <bk-number-input name="cols" [(value)]="cols" [readOnly]="readOnly()" [showHelper]=true />
              </ion-col>  
              <ion-col size="12" size-md="6">
                <bk-cat name="nameDisplay" [(value)]="nameDisplay" [readOnly]="readOnly()" [categories]="nameDisplays" />                                               
              </ion-col>  
              <ion-col size="12" size-md="6">
                <bk-text-input name="linkedSection" [(value)]="linkedSection" [readOnly]="readOnly()" [showHelper]=true />                                               
              </ion-col> 
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    }
  `
})
export class PeopleListFormComponent {
  public vm = model.required<SectionFormModel>();
  public readonly readOnly = input(true);

  protected avatarConfig = computed(() => this.vm().properties?.avatar);

  protected position = linkedSignal(() => this.vm()?.properties?.content?.position ?? ViewPosition.Top);
  protected htmlContent = linkedSignal(() => this.vm()?.properties?.content?.htmlContent ?? '');
  protected title = linkedSignal(() => this.vm()?.properties?.avatar?.title ?? 'Avatar');
  protected altText = linkedSignal(() => this.vm()?.properties?.avatar?.altText ?? 'avatar');
  protected showName = linkedSignal(() => this.vm()?.properties?.avatar?.showName ?? true);
  protected showLabel = linkedSignal(() => this.vm()?.properties?.avatar?.showLabel ?? false);
  protected cols = linkedSignal(() => this.vm()?.properties?.avatar?.cols ?? 1);
  protected nameDisplay = linkedSignal(() => this.vm()?.properties?.avatar?.nameDisplay ?? NameDisplay.FirstLast);
  protected linkedSection = linkedSignal(() => this.vm()?.properties?.avatar?.linkedSection ?? '');
  protected persons = computed(() => this.vm()?.properties?.persons ?? []);

  public changed = output<void>();
  public selectClicked = output<void>();

  protected caseInsensitiveWordMask = CaseInsensitiveWordMask;
  protected viewPositions = ViewPositions;
  protected nameDisplays = NameDisplays;

  protected onContentChange(content: string): void {
    this.vm.update((vm) => ({ ...vm, content }));
    this.changed.emit();
  }

  protected onPeopleListChange(people: AvatarInfo[]): void {
    this.vm.update((vm) => ({ ...vm, properties: { ...vm.properties, persons: people } }));
    this.changed.emit();
  }
}
