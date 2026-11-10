import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { AvatarInfo, PeopleSection, PersonModelName } from "@okr/shared-models";
import { OptionalCardHeader, Spinner } from "@okr/shared-ui";
import { AppStore } from '@okr/shared-feature';

import { PersonsWidget } from '@okr/cms-section-ui';
import { SectionViewModal } from '@okr/cms-section-feature';
import { SectionService } from '@okr/cms-section-data-access';

import { PeopleSectionStore } from './people-section.store';

@Component({
  selector: 'okr-people-section',
  standalone: true,
  imports: [
    Spinner, PersonsWidget, OptionalCardHeader,
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
        <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <ion-grid class="ion-no-padding">
            <ion-row>
              @if(listName(); as listName) {
                <ion-col size="12" [sizeMd]="nameBeside() ? 3 : 12">
                  <ion-item lines="none" [button]="hasLinkedSection() && !editMode()" (click)="showLinkedSection()">
                    <ion-label>{{ listName }}</ion-label>
                  </ion-item>
                </ion-col>
              }
              <ion-col size="12" [sizeMd]="listName() && nameBeside() ? 9 : 12">
                <okr-persons-widget
                  [persons]="store.persons()"
                  [avatarConfig]="store.avatarConfig()"
                  [emails]="store.emails()"
                  [editMode]="editMode()"
                  [i18n]="store.i18n"
                  (personClicked)="showPerson($event)"
                />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
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

  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  /** name of the person list (Personen-Liste), shown only when set */
  protected readonly listName = computed(() => this.store.avatarConfig().title?.trim());
  /** a slider needs the full width, so the list name goes above it */
  protected readonly nameBeside = computed(() => this.store.avatarConfig().view !== 'slider');
  private readonly linkedSectionId = computed(() => this.store.avatarConfig().linkedSection);
  protected readonly hasLinkedSection = computed(() => !!this.linkedSectionId()?.trim());

  constructor() {
    effect(() => this.store.setSection(this.section()));
  }

  protected async showPerson(avatar: AvatarInfo): Promise<void> {
    const person = this.appStore.getPerson(avatar.key);
    if (!person) return;
    const { PersonEditModal } = await import('@okr/subject-person-feature');
    const modal = await this.modalController.create({
      component: PersonEditModal,
      componentProps: {
        person,
        currentUser: this.appStore.currentUser(),
        tagModel: PersonModelName,
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
        title: this.listName()
      }
    });
    modal.present();
    await modal.onDidDismiss();
  }
}
