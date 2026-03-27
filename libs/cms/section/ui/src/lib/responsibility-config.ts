import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ResponsibilityConfig, UserModel } from '@bk2/shared-models';
import { CheckboxComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-responsibility-config',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe,
    CheckboxComponent, TextInputComponent,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@content.section.type.responsibility.edit' | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12">
              <bk-text-input name="bkey" [value]="bkey()" (valueChange)="onFieldChange('bkey', $event)" [readOnly]="isReadOnly()" [showHelper]="true" />
            </ion-col>
            <ion-col size="12" size-md="4">
              <bk-checkbox name="showAvatar" [checked]="showAvatar()" (checkedChange)="onFieldChange('showAvatar', $event)" [readOnly]="isReadOnly()" />
            </ion-col>
            <ion-col size="12" size-md="4">
              <bk-checkbox name="showName" [checked]="showName()" (checkedChange)="onFieldChange('showName', $event)" [readOnly]="isReadOnly()" />
            </ion-col>
            <ion-col size="12" size-md="4">
              <bk-checkbox name="showDescription" [checked]="showDescription()" (checkedChange)="onFieldChange('showDescription', $event)" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `,
})
export class ResponsibilityConfigComponent {
  public formData = model.required<ResponsibilityConfig>();
  public currentUser = input.required<UserModel | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected bkey = computed(() => this.formData().bkey ?? '');
  protected showAvatar = computed(() => this.formData().showAvatar ?? true);
  protected showName = computed(() => this.formData().showName ?? true);
  protected showDescription = computed(() => this.formData().showDescription ?? true);

  protected onFieldChange(fieldName: string, fieldValue: string | boolean): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
