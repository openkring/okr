import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { AVATAR_CONFIG_SHAPE, AvatarInfo, ColorIonic, NameDisplay, PeopleSection } from '@bk2/shared-models';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { getFullName } from '@bk2/shared-util-core';

import { AvatarLabelComponent } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-persons-widget',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonGrid,IonRow, IonCol,
    AvatarLabelComponent
  ],
  template: `
    @if(section(); as section) {
      <ion-grid>
        <ion-row>
          @if(count() === 0) {
            <ion-col>{{ '@content.section.error.noPeople' | translate | async }}</ion-col>
          } @else {
            @for(person of persons(); track person.key) {
              <ion-col size="12" [sizeMd]="cols()" (click)="showPerson(person)">
                <bk-avatar-label 
                  key="{{ person.modelType + '.' + person.key}}" 
                  [label]="getPersonLabel(person)" 
                  [color]="color()"
                  alt="{{altText()}}"
                />
              </ion-col>
            }
          }
        </ion-row>
      </ion-grid>
    }
  `
})
export class PersonsWidgetComponent {
  private readonly router = inject(Router);
  
  // inputs
  public section = input<PeopleSection>();

  // signals
  protected persons = computed(() => this.section()?.properties.persons ?? []);
  protected avatar = computed(() => this.section()?.properties.avatar ?? AVATAR_CONFIG_SHAPE);
  protected avatarTitle = computed(() => this.avatar().title);
  protected count = computed(() => this.persons().length);
  protected cols = computed(() => {
    const count = this.count();
    if (this.avatarTitle().length > 0) {  // distribute the avatars to max 9 columns if title is shown
      if (count === 1) return 9;
      if (count === 2) return 4;
      if (count === 3) return 3;
      return 2; // for 4 or more avatars
    } else {      // distribute the avatars to max 12 columns if no title is shown
      if (count > 4) return 2;
      return 12/count;
    }
  });
  protected showName = computed(() => this.avatar().showName ?? true);
  protected showLabel = computed(() => this.avatar().showLabel ?? true);
  protected nameDisplay = computed(() => this.avatar().nameDisplay ?? NameDisplay.FirstLast);
  protected color = computed(() => this.avatar()?.color ?? ColorIonic.Light);
  protected altText = computed(() => this.avatar().altText ?? 'avatar');

  protected getPersonLabel(person: AvatarInfo): string {
    if (!this.showName()) return '';
    const name = getFullName(person.name1, person.name2, this.nameDisplay());
    return (this.showLabel() && person.label && person.label.length > 0) ? `${name} (${person.label})` : name;
  }

  // tbd: add a group and show all persons of this group
  public showPerson(person: AvatarInfo): void {
    navigateByUrl(this.router, `/person/${person.key}`);
  }
}
