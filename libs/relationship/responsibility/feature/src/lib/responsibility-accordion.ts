import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { ActionSheetOptions, ActionSheetController, IonAccordion, IonAccordionGroup, IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { ResponsibilityModel, RoleName } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';
import { ResponsibilityStore } from './responsibility.store';

@Component({
  selector: 'bk-responsibilities-accordion',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonAccordion, IonAccordionGroup, IonList, IonItem, IonLabel, IonButton, IonIcon,
  ],
  providers: [ResponsibilityStore],
  template: `
    <ion-accordion-group>
      <ion-accordion value="responsibilities">
        <ion-item slot="header" [color]="color()">
          <ion-label>{{ title() }}</ion-label>
          @if(canAdd()) {
            <ion-button slot="end" fill="clear" (click)="onAdd($event)">
              <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
            </ion-button>
          }
        </ion-item>
        <ion-list slot="content">
          @for(r of store.filteredResponsibilities(); track r.bkey) {
            <ion-item (click)="onRowClick(r)">
              <ion-label>
                <h3>{{ r.bkey }}</h3>
                <p>{{ r.name }}</p>
              </ion-label>
            </ion-item>
          }
          @empty {
            <ion-item><ion-label color="medium">Keine Einträge</ion-label></ion-item>
          }
        </ion-list>
      </ion-accordion>
    </ion-accordion-group>
  `,
})
// shows the responsibilities of a person r_responsibleKey
export class ResponsibilityAccordion {
  protected readonly store = inject(ResponsibilityStore);
  private readonly actionSheetController = inject(ActionSheetController);

  public key = input.required<string>();
  public color = input('');
  public title = input('Verantwortlichkeiten');
  public readOnly = input(true);

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected canAdd = computed(() => !this.readOnly() && hasRole('privileged', this.store.currentUser()));

  constructor() {
    effect(() => {
      untracked(() => this.store.setListId(`r_${this.key()}`));
    });
  }

  protected async onAdd(event: Event): Promise<void> {
    event.stopPropagation();
    await this.store.add(!this.readOnly() ? false : true);
  }

  protected async onRowClick(r: ResponsibilityModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions, r);
    await this.executeActions(actionSheetOptions, r);
  }

  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, r: ResponsibilityModel): void {
    actionSheetOptions.buttons.push(createActionSheetButton('view', this.imgixBaseUrl, 'eye-on'));
    if (!this.readOnly()) {
      actionSheetOptions.buttons.push(createActionSheetButton('edit', this.imgixBaseUrl, 'edit'));
    }
    if (hasRole('admin', this.store.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('delete', this.imgixBaseUrl, 'trash'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(actionSheetOptions: ActionSheetOptions, r: ResponsibilityModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'view':
          await this.store.edit(r, true);
          break;
        case 'edit':
          await this.store.edit(r, false);
          break;
        case 'delete':
          await this.store.delete(r, false);
          break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
