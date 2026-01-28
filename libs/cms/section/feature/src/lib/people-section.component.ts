import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';

import { PeopleSection, ViewPosition } from "@bk2/shared-models";
import { SpinnerComponent } from "@bk2/shared-ui";

import { PersonsWidgetComponent } from '@bk2/cms-section-ui';
import { PreviewSectionModal } from '@bk2/cms-section-feature';

@Component({
  selector: 'bk-people-section',
  standalone: true,
  imports: [
    SpinnerComponent, PersonsWidgetComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <ion-card-content>
          <ion-grid class="ion-no-padding">
            <ion-row>
              @if(avatarTitle(); as avatarTitle) {
                <ion-col size="12" size-md="3">
                  <ion-item lines="none" (click)="showLinkedSection()">
                    <ion-label>{{ avatarTitle }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="9">
                  <bk-persons-widget [section]="section" />
                </ion-col>
              } @else {
              <ion-col size="12">
                <bk-persons-widget [section]="section" />
              </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
    }
  `
})
export class PeopleSectionComponent {
  private readonly modalController = inject(ModalController);

  // inputs
  public section = input<PeopleSection>();

  // fields
  protected readonly sectionTitle = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected doShowTitle = computed(() => !!this.sectionTitle() || !!this.subTitle());

  protected readonly avatarConfig = computed(() => this.section()?.properties.avatar);
  protected readonly avatarTitle = computed(() => this.avatarConfig()?.title);
  protected readonly linkedSection = computed(() => this.section()?.properties.avatar?.linkedSection);

  // passing constants to template
  public VP = ViewPosition;

  protected async showLinkedSection(): Promise<void> {
    const linkedSection = this.linkedSection();
    if (!linkedSection || linkedSection.length === 0) return;
      const _modal = await this.modalController.create({
        component: PreviewSectionModal,
        cssClass: 'wide-modal',
        componentProps: { 
          id: linkedSection,
          title: this.avatarTitle()
        }
      });
      _modal.present();
      await _modal.onDidDismiss();  }
}
