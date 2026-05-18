import { Component, computed, effect, inject, input } from '@angular/core';
import { AlertController, IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, ColorIonic, PersonModelName, ResponsibilitySection } from '@bk2/shared-models';
import { Spinner } from '@bk2/shared-ui';
import { getAvatarName, getFullName } from '@bk2/shared-util-core';
import { AppStore } from '@bk2/shared-feature';

import { ResponsibilitySectionStore } from './responsibility-section.store';
import { AvatarLabel } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-responsibility-section',
  standalone: true,
  imports: [
    Spinner, AvatarLabel,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel,
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
  `],
  providers: [ResponsibilitySectionStore],
  template: `
    @if(isLoading()) {
      <bk-spinner />
    } @else {
      <ion-card>
        <ion-card-content>
          <ion-grid class="ion-no-padding">
            <ion-row>
              <ion-col size="12" size-md="3" (click)="showDescription()">
                <ion-item lines="none">
                  <ion-label>{{ label() }}</ion-label>
                </ion-item>
              </ion-col>
              @if(avatar(); as avatar) {
                <ion-col size="12" size-md="9" (click)="showPerson(avatar)">
                  <bk-avatar-label 
                    [key]="avatarKey()" 
                    [label]="name()" 
                    [color]="color()"
                    [alt]="altText()"
                  />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
    }
  `,
})
// this currently only supports single person as responsible (groups come later)
export class ResponsibilitySectionComponent {
  protected readonly store = inject(ResponsibilitySectionStore);
  private readonly alertController = inject(AlertController);
  private readonly appStore = inject(AppStore);
  private readonly modalController = inject(ModalController);

  public section = input<ResponsibilitySection>();
  public editMode = input(false);
  public color = input(ColorIonic.Light);

  protected readonly config = computed(() => this.section()?.properties ?? { bkey: '', showAvatar: true, showName: true, showDescription: true });
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly responsibility = computed(() => this.store.responsibility());
  protected readonly label = computed(() => this.responsibility()?.name ?? '');
  protected readonly avatar = computed(() => this.responsibility()?.responsibleAvatar);
  protected readonly modelType = computed(() => this.avatar()?.modelType ?? '');
  protected readonly key = computed(() => this.avatar()?.key ?? '');
  protected readonly avatarKey = computed(() => `${this.modelType()}.${this.key()}`);
  protected readonly name = computed(() => {
    const avatar = this.avatar();
    if (!avatar) return '';
    return getFullName(avatar.name1, avatar.name2) || getAvatarName(avatar);
  });
  protected altText = computed(() => `Avatar von ${this.name()}`);

  constructor() {
    effect(() => {
      const section = this.section();
      if (section) this.store.setConfig(section);
    });
  }

  protected async showDescription(): Promise<void> {
    if (this.editMode()) return;
    const r = this.store.responsibility();
    if (!r?.notes || !this.config().showDescription) return;
    const alert = await this.alertController.create({
      header: r.name,
      message: r.notes,
      buttons: ['OK'],
    });
    await alert.present();
  }

  // tbd: add a group and show all persons of this group
  public async showPerson(avatar: AvatarInfo): Promise<void> {
    if (this.editMode()) return;
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
}
