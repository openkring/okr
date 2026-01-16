import { Component, inject, input } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { SectionComponent } from "./section.component";
import { HeaderComponent } from '@bk2/shared-ui';

@Component( {
  selector: 'bk-preview-section-modal',
  standalone: true,
  imports: [
    IonContent,
    SectionComponent, HeaderComponent
],
  template: `
    <bk-header [title]="title()" [isModal]="true" />
    <ion-content>
      <bk-section [id]="id()" />
    </ion-content>
  `
} )
export class PreviewSectionModal {
  private modalController = inject(ModalController);

  // inputs
  public id = input.required<string>();
  public title = input('Preview');

  public close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
