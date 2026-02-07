import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs/internal/firstValueFrom';

import { PeopleSection, ViewPosition } from "@bk2/shared-models";
import { SpinnerComponent } from "@bk2/shared-ui";

import { PersonsWidgetComponent } from '@bk2/cms-section-ui';
import { SectionViewModal } from '@bk2/cms-section-feature';
import { SectionService } from '@bk2/cms-section-data-access';

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
                  <bk-persons-widget [section]="section" [editMode]="editMode()" />
                </ion-col>
              } @else {
              <ion-col size="12">
                <bk-persons-widget [section]="section" [editMode]="editMode()" />
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
  private readonly sectionService = inject(SectionService);

  // inputs
  public section = input<PeopleSection>();
  public editMode = input(false);

  // fields
  protected readonly sectionTitle = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected doShowTitle = computed(() => !!this.sectionTitle() || !!this.subTitle());

  protected readonly avatarConfig = computed(() => this.section()?.properties.avatar);
  protected readonly avatarTitle = computed(() => this.avatarConfig()?.title);
  protected readonly linkedSectionId = computed(() => this.section()?.properties.avatar?.linkedSection);

  // passing constants to template
  public VP = ViewPosition;

  protected async showLinkedSection(): Promise<void> {
    if (this.editMode()) return; // prevent showing linked section in edit mode
    const linkedSectionId = this.linkedSectionId();
    if (!linkedSectionId || linkedSectionId.length === 0) return;
    const linkedSection = await firstValueFrom(this.sectionService.read(linkedSectionId));
    if (!linkedSection) return;
    const _modal = await this.modalController.create({
      component: SectionViewModal,
      cssClass: 'wide-modal',
      componentProps: { 
        section: linkedSection,
        title: this.avatarTitle()
      }
    });
    _modal.present();
    await _modal.onDidDismiss();
  }
}
