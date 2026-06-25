import { Component, computed, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonContent, IonItem, IonLabel, IonToggle, IonButton, IonFooter, IonToolbar } from '@ionic/angular/standalone';

import { ContextDiagramConfig, UserModel } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { ContextDiagramStore } from './context-diagram-section.store';

@Component({
  selector: 'bk-context-diagram-config-modal',
  standalone: true,
  imports: [
    FormsModule,
    Header,
    IonContent, IonItem, IonLabel, IonToggle, IonButton, IonFooter, IonToolbar,
  ],
  providers: [ContextDiagramStore],
  template: `
    <bk-header [i18n]="{ title: store.i18n.context_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showAvatar">
          <ion-label>{{ store.i18n.context_show_avatar() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showName">
          <ion-label>{{ store.i18n.context_show_name() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showMembers">
          <ion-label>{{ store.i18n.context_show_member() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showMemberships">
          <ion-label>{{ store.i18n.context_show_membership() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showResponsibilities">
          <ion-label>{{ store.i18n.context_show_responsibility() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showPersonalRels">
          <ion-label>{{ store.i18n.context_show_personal() }}</ion-label>
        </ion-toggle>
      </ion-item>
      @if (isMemberAdmin()) {
        <ion-item>
          <ion-toggle [(ngModel)]="cfg.showWorkRels">
            <ion-label>{{ store.i18n.context_show_workrel() }}</ion-label>
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-toggle [(ngModel)]="saveChanges">
            <ion-label>{{ store.i18n.save() }}</ion-label>
          </ion-toggle>
        </ion-item>
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button slot="start" fill="clear" (click)="cancel()">
          {{ store.i18n.cancel() }}
        </ion-button>
        <ion-button slot="end" (click)="confirm()">
          {{ store.i18n.ok() }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class ContextDiagramConfigModal {
  protected readonly store = inject(ContextDiagramStore);
  @Input() config!: ContextDiagramConfig;
  @Input() currentUser: UserModel | undefined;

  // mutable copy — edits stay local until confirmed
  protected cfg: ContextDiagramConfig = {
    startElement: '',
    showAvatar: true,
    showName: true,
    showMembers: false,
    showMemberships: false,
    showResponsibilities: true,
    showPersonalRels: false,
    showWorkRels: false,
    connectionNames: true,
    depth: 1,
  };

  protected saveChanges = false;

  protected readonly isMemberAdmin = computed(() => hasRole('memberAdmin', this.currentUser));

  private readonly modalController = inject(ModalController);

  ngOnInit(): void {
    if (this.config) {
      this.cfg = { ...this.config };
    }
  }

  protected confirm(): Promise<boolean> {
    return this.modalController.dismiss({ ...this.cfg, _saveChanges: this.saveChanges }, 'confirm');
  }

  protected cancel(): Promise<boolean> {
    return this.modalController.dismiss(null, 'cancel');
  }
}
