import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { AvatarInfo, PeopleSection, PersonModelName } from "@bk2/shared-models";
import { SpinnerComponent } from "@bk2/shared-ui";
import { AppStore } from '@bk2/shared-feature';

import { PersonsWidgetComponent } from '@bk2/cms-section-ui';
import { SectionViewModal } from '@bk2/cms-section-feature';
import { SectionService } from '@bk2/cms-section-data-access';
import { PeopleSectionStore } from './people-section.store';

@Component({
  selector: 'bk-people-section',
  standalone: true,
  imports: [
    SpinnerComponent, PersonsWidgetComponent,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel
  ],
  providers: [PeopleSectionStore],
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
                  <bk-persons-widget [persons]="store.persons()" [avatarConfig]="store.avatarConfig()" [editMode]="editMode()" (personClicked)="showPerson($event)" />
                </ion-col>
              } @else {
                <ion-col size="12">
                  <bk-persons-widget [persons]="store.persons()" [avatarConfig]="store.avatarConfig()" [editMode]="editMode()" (personClicked)="showPerson($event)" />
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
  protected readonly store = inject(PeopleSectionStore);
  private readonly modalController = inject(ModalController);
  private readonly sectionService = inject(SectionService);
  private readonly appStore = inject(AppStore);

  public section = input<PeopleSection>();
  public editMode = input(false);

  protected readonly avatarTitle = computed(() => this.store.avatarConfig().title);
  private readonly linkedSectionId = computed(() => this.store.avatarConfig().linkedSection);

  constructor() {
    effect(() => this.store.setSection(this.section()));
  }

  protected async showPerson(avatar: AvatarInfo): Promise<void> {
    const person = this.appStore.getPerson(avatar.key);
    if (!person) return;
    const { PersonEditModal } = await import('@bk2/subject-person-feature');
    const modal = await this.modalController.create({
      component: PersonEditModal,
      componentProps: {
        person,
        currentUser: this.appStore.currentUser(),
        tags: this.appStore.getTags(PersonModelName),
        tenantId: this.appStore.tenantId(),
        genders: this.appStore.getCategory('gender'),
        readOnly: true,
      }
    });
    modal.present();
    await modal.onDidDismiss();
  }

  protected async showLinkedSection(): Promise<void> {
    if (this.editMode()) return;
    const linkedSectionId = this.linkedSectionId();
    if (!linkedSectionId || linkedSectionId.length === 0) return;
    const linkedSection = await firstValueFrom(this.sectionService.read(linkedSectionId));
    if (!linkedSection) return;
    const modal = await this.modalController.create({
      component: SectionViewModal,
      cssClass: 'wide-modal',
      componentProps: {
        section: linkedSection,
        title: this.avatarTitle()
      }
    });
    modal.present();
    await modal.onDidDismiss();
  }
}
