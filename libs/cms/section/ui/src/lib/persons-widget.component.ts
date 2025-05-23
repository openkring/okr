import { Component, computed, inject, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AvatarInfo, ColorIonic, ModelType, NameDisplay, SectionModel } from '@bk2/shared/models';
import { getFullPersonName, navigateByUrl } from '@bk2/shared/util';
import { TranslatePipe } from '@bk2/shared/i18n';
import { AvatarLabelComponent } from '@bk2/shared/ui';

import { newAvatar } from '@bk2/cms/section/util';

@Component({
  selector: 'bk-persons-widget',
  imports: [
    TranslatePipe, AsyncPipe,
    IonGrid,IonRow, IonCol,
    AvatarLabelComponent
  ],
  template: `
    @if(section(); as section) {
      <ion-grid>
        <ion-row>
          @if(persons().length === 0) {
            <ion-col>{{ '@content.section.error.noPeople' | translate | async }}</ion-col>
          } @else {
            @for(person of persons(); track person.key) {
              @if(cols() === 0) {
                <bk-avatar-label 
                  key="{{ person.modelType + '.' + person.key}}" 
                  [label]="getPersonLabel(person)" 
                  [color]="color()"
                  alt="{{altText()}}"
                />
              } @else {
                <ion-col size="12" [sizeMd]="12/cols()" (click)="showPerson(person)">
                <bk-avatar-label 
                  key="{{ person.modelType + '.' + person.key}}" 
                  [label]="getPersonLabel(person)" 
                  [color]="color()"
                  alt="{{altText()}}"
                />
              </ion-col>
              }
            }
          }
        </ion-row>
      </ion-grid>
    }
  `
})
export class PersonsWidgetComponent {
  private readonly router = inject(Router);
  
  public section = input<SectionModel>();
  protected persons = computed(() => this.section()?.properties.persons ?? []);
  protected avatar = computed(() => this.section()?.properties.avatar ?? newAvatar());
  protected cols = computed(() => this.avatar().cols ?? 2);
  protected showName = computed(() => this.avatar().showName ?? true);
  protected showLabel = computed(() => this.avatar().showLabel ?? true);
  protected nameDisplay = computed(() => this.avatar().nameDisplay ?? NameDisplay.FirstLast);
  protected color = computed(() => this.section()?.color ?? ColorIonic.Light);
  protected altText = computed(() => this.avatar().altText ?? 'avatar');

  protected MT = ModelType;

  protected getPersonLabel(person: AvatarInfo): string {
    if (!this.showName()) return '';
    const _name = getFullPersonName(person.name1 ?? '', person.name2 ?? '', '', this.nameDisplay());
    return (this.showLabel() && person.label && person.label.length > 0) ? `${_name} (${person.label})` : _name;
  }

  // tbd: add a group and show all persons of this group
  public showPerson(person: AvatarInfo): void {
    navigateByUrl(this.router, `/person/${person.key}`);
  }
}
