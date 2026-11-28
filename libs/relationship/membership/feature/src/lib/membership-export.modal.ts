// libs/relationship/membership/feature/src/lib/membership-export.modal.ts
import { Component, computed, inject, input } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import type { MembershipI18n } from '@okr/relationship-membership-util';

/** The kinds `MembershipStore.export` writes. */
export type MembershipExportKind = 'raw' | 'member' | 'address' | 'srv' | 'clubdesk';

/**
 * «Export …» of the member list: one tap picks a kind, the modal is dismissed with it (role `confirm`); closing it exports nothing.
 * Each kind says what is in the file, so nobody has to try them out. It changes nothing itself: the store writes the file.
 */
@Component({
  selector: 'okr-membership-export-modal',
  standalone: true,
  imports: [Header, SvgIconPipe, IonContent, IonList, IonItem, IonLabel, IonIcon, IonNote],
  styles: [`
    .intro { display: block; padding: 16px 16px 4px; }
    ion-label p { white-space: normal; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().export_title() }" [isModal]="true" />
    <ion-content>
      <ion-note class="intro">{{ i18n().export_intro() }}</ion-note>
      <ion-list lines="inset">
        @for (choice of choices(); track choice.kind) {
          <ion-item button [detail]="false" (click)="pick(choice.kind)">
            <ion-icon slot="start" src="{{ 'download' | svgIcon }}" aria-hidden="true" />
            <ion-label>
              <h3>{{ choice.label }}</h3>
              <p>{{ choice.desc }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class MembershipExportModal {
  private readonly modalController = inject(ModalController);

  public readonly i18n = input.required<MembershipI18n>();
  /** the kinds offered here, in this order */
  public readonly kinds = input.required<MembershipExportKind[]>();

  protected readonly choices = computed(() => {
    const t = this.i18n();
    const texts: Record<MembershipExportKind, { label: string; desc: string }> = {
      member: { label: t.export_member_label(), desc: t.export_member_desc() },
      address: { label: t.export_address_label(), desc: t.export_address_desc() },
      raw: { label: t.export_raw_label(), desc: t.export_raw_desc() },
      srv: { label: t.export_srv_label(), desc: t.export_srv_desc() },
      clubdesk: { label: t.export_clubdesk_label(), desc: t.export_clubdesk_desc() },
    };
    return this.kinds().map((kind) => ({ kind, ...texts[kind] }));
  });

  protected async pick(kind: MembershipExportKind): Promise<void> {
    await this.modalController.dismiss(kind, 'confirm');
  }
}
