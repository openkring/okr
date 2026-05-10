import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AVATAR_CONFIG_SHAPE, AvatarConfig, AvatarInfo, ColorIonic, NameDisplay } from '@bk2/shared-models';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { getFullName } from '@bk2/shared-util-core';

import { AvatarLabelComponent } from '@bk2/avatar-ui';
import { calculateCols } from '@bk2/cms-section-util';

@Component({
  selector: 'bk-persons-widget',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    IonGrid, IonRow, IonCol,
    AvatarLabelComponent
  ],
  template: `
    <ion-grid>
      <ion-row>
        @if(count() === 0) {
          <ion-col>{{ '@content.section.error.noPeople' | translate | async }}</ion-col>
        } @else {
          @for(person of persons(); track person.key) {
            <ion-col size="12" [sizeMd]="cols()" (click)="showPerson(person)">
              <bk-avatar-label
                [key]="person.modelType + '.' + person.key"
                [label]="getPersonLabel(person)"
                [color]="color()"
                [alt]="altText()"
              />
            </ion-col>
          }
        }
      </ion-row>
    </ion-grid>
  `
})
export class PersonsWidgetComponent {
  private readonly router = inject(Router);

  public persons = input.required<AvatarInfo[]>();
  public avatarConfig = input<AvatarConfig>(AVATAR_CONFIG_SHAPE);
  public editMode = input(false);

  protected count = computed(() => this.persons().length);
  protected cols = computed(() => calculateCols(this.count(), this.avatarConfig().title));
  protected showName = computed(() => this.avatarConfig().showName ?? true);
  protected showLabel = computed(() => this.avatarConfig().showLabel ?? true);
  protected nameDisplay = computed(() => this.avatarConfig().nameDisplay ?? NameDisplay.FirstLast);
  protected color = computed(() => this.avatarConfig().color ?? ColorIonic.Light);
  protected altText = computed(() => this.avatarConfig().altText ?? 'avatar');

  protected getPersonLabel(person: AvatarInfo): string {
    if (!this.showName()) return '';
    const name = getFullName(person.name1, person.name2, this.nameDisplay());
    return (this.showLabel() && person.label && person.label.length > 0) ? `${name} (${person.label})` : name;
  }

  public showPerson(person: AvatarInfo): void {
    if (this.editMode()) return;
    navigateByUrl(this.router, `/person/${person.key}`);
  }
}
