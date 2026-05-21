import { Component, computed, inject, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonContent, IonItem, IonLabel, IonToggle, IonButton, IonFooter, IonToolbar } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { ContextDiagramConfig, UserModel } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

const ContextDiagramStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll({
      show_avatar:        '@cms.contextDiagram.config.showAvatar',
      show_name:          '@cms.contextDiagram.config.showName',
      show_members:       '@cms.contextDiagram.config.showMembers',
      show_memberships:   '@cms.contextDiagram.config.showMemberships',
      show_resp:          '@cms.contextDiagram.config.showResponsibilities',
      show_personal_rels: '@cms.contextDiagram.config.showPersonalRels',
      show_work_rels:     '@cms.contextDiagram.config.showWorkRels',
      save_changes:       '@cms.contextDiagram.config.saveChanges',
      cancel:             '@general.operation.change.cancel',
      ok:                 '@general.operation.change.ok',
    }),
  })),
);

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
    <bk-header [i18n]="{ title: '@cms.contextDiagram.config.title' }" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showAvatar">
          <ion-label>{{ store.i18n.show_avatar() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showName">
          <ion-label>{{ store.i18n.show_name() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showMembers">
          <ion-label>{{ store.i18n.show_members() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showMemberships">
          <ion-label>{{ store.i18n.show_memberships() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showResponsibilities">
          <ion-label>{{ store.i18n.show_resp() }}</ion-label>
        </ion-toggle>
      </ion-item>
      <ion-item>
        <ion-toggle [(ngModel)]="cfg.showPersonalRels">
          <ion-label>{{ store.i18n.show_personal_rels() }}</ion-label>
        </ion-toggle>
      </ion-item>
      @if (isMemberAdmin()) {
        <ion-item>
          <ion-toggle [(ngModel)]="cfg.showWorkRels">
            <ion-label>{{ store.i18n.show_work_rels() }}</ion-label>
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-toggle [(ngModel)]="saveChanges">
            <ion-label>{{ store.i18n.save_changes() }}</ion-label>
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
