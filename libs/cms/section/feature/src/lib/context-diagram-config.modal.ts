import { Component, computed, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonContent, IonItem, IonLabel, IonToggle, IonButton, IonFooter, IonToolbar } from '@ionic/angular/standalone';

import { ContextDiagramConfig, UserModel } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'bk-context-diagram-config-modal',
  standalone: true,
  imports: [
    FormsModule, TranslatePipe, AsyncPipe,
    HeaderComponent,
    IonContent, IonItem, IonLabel, IonToggle, IonButton, IonFooter, IonToolbar,
  ],
  template: `
    <bk-header title="@cms.contextDiagram.config.title" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showAvatar">
          <ion-label>{{ '@cms.contextDiagram.config.showAvatar' | translate | async }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showName">
          <ion-label>{{ '@cms.contextDiagram.config.showName' | translate | async }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showMembers">
          <ion-label>{{ '@cms.contextDiagram.config.showMembers' | translate | async }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showMemberships">
          <ion-label>{{ '@cms.contextDiagram.config.showMemberships' | translate | async }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showResponsibilities">
          <ion-label>{{ '@cms.contextDiagram.config.showResponsibilities' | translate | async }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showPersonalRels">
          <ion-label>{{ '@cms.contextDiagram.config.showPersonalRels' | translate | async }}</ion-label>
        </ion-toggle>
      </ion-item>
      @if (isMemberAdmin()) {
        <ion-item>
          <ion-toggle [(ngModel)]="cfg.showWorkRels">
            <ion-label>{{ '@cms.contextDiagram.config.showWorkRels' | translate | async }}</ion-label>
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-toggle [(ngModel)]="saveChanges">
            <ion-label>{{ '@cms.contextDiagram.config.saveChanges' | translate | async }}</ion-label>
          </ion-toggle>
        </ion-item>
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button slot="start" fill="clear" (click)="cancel()">
          {{ '@general.operation.change.cancel' | translate | async }}
        </ion-button>
        <ion-button slot="end" (click)="confirm()">
          {{ '@general.operation.change.ok' | translate | async }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class ContextDiagramConfigModal {
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
