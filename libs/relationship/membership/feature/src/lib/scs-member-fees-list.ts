import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonMenuButton, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getAge, hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';

import { ScsMemberFeesStore } from './scs-member-fees.store';
import { ScsMemberFeeEditModal } from './scs-member-fee-edit.modal';

@Component({
  selector: 'bk-scs-member-fees',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe, TranslatePipe, AvatarPipe, SvgIconPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonItem, IonAvatar, IonImg, IonLabel, IonGrid, IonRow, IonCol, IonChip
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    .total { font-weight: bold; text-align: right; }
    .name { font-size: 0.8rem; }
    ion-chip { font-size: 0.8rem; padding-top: 0px; padding-bottom: 0px; height: 12px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>
          {{ filteredFees().length }}/{{ allFees().length }}
          {{ '@finance.scsMemberFee.list.title' | translate | async }}
        </ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="generateFees()" title="{{ '@finance.scsMemberFee.operation.generate.label' | translate | async }}">
            <ion-icon slot="icon-only" [src]="'reload' | svgIcon" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <bk-list-filter
        (searchTermChanged)="onSearchTermChange($event)"
        (categoryChanged)="onMcatSelected($event)"
        [categories]="mcatScsCategory()"
      />

      <!-- list header (desktop) -->
      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="6" size-md="2"><strong>Name</strong></ion-col>
            <ion-col class="ion-hide-md-down" size="1"><strong>JB</strong></ion-col>
            <ion-col class="ion-hide-md-down" size="1"><strong>SRV</strong></ion-col>
            <ion-col class="ion-hide-md-down" size="1"><strong>Entry</strong></ion-col>
            <ion-col class="ion-hide-md-down" size="1"><strong>Gard.</strong></ion-col>
            <ion-col class="ion-hide-md-down" size="1"><strong>Skiff</strong></ion-col>
            <ion-col class="ion-hide-md-down" size="1"><strong>Vers.</strong></ion-col>
            <ion-col class="ion-hide-md-down" size="1"><strong>Getr.</strong></ion-col>
            <ion-col class="ion-hide-md-down" size="1"><strong>Rabatt</strong></ion-col>
            <ion-col size="3" size-md="1"><strong>Total</strong></ion-col>
            <ion-col size="3" size-md="1"><strong>Status</strong></ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
      } @else {
        @if (filteredFees().length === 0) {
          <bk-empty-list message="@finance.scsMemberFee.list.empty" />
        } @else {
          <ion-grid>
            @for (fee of filteredFees(); track $index) {
              <ion-row (click)="showActions(fee)">
                <ion-col size="6" size-md="2">
                  <ion-item lines="none">
                  <ion-avatar slot="start">
                    <ion-img
                      src="{{ fee.member?.modelType + '.' + fee.member?.key | avatar:fee.member?.modelType }}"
                      alt="Avatar"
                    />
                  </ion-avatar>
                  <ion-label class="name">{{ fee.member?.name2 }} {{ fee.member?.name1 }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.jb}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.srv}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.entryFee}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.locker}}</ion-label>
                </ion-item>
              </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.skiff}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.skiffInsurance}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.bev}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.rebate}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="1">
                  <ion-item lines="none">
                    <ion-label class="total">{{ getTotal(fee) }}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="1">
                  <ion-chip [outline]="true" size="small" [color]="getStateColor(fee.state)">{{ fee.state }}</ion-chip>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        }
      }
    </ion-content>
  `
})
export class ScsMemberFees {
  protected readonly store = inject(ScsMemberFeesStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly cdr = inject(ChangeDetectorRef);

  protected isLoading = computed(() => this.store.isLoading());
  protected allFees = computed(() => this.store.feeModels());
  protected filteredFees = computed(() => this.store.filteredFees());
  protected mcatScsCategory = computed(() => this.store.mcatCategory());
  protected currentUser = computed(() => this.store.currentUser());

  /******************************* filters *************************************** */
  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onMcatSelected(mcat: string): void {
    this.store.setSelectedMcat(mcat);
  }

  /******************************* helpers *************************************** */
  protected getAge(dateOfBirth: string): number {
    return getAge(dateOfBirth);
  }

  protected getTotal(fee: ScsMemberFeesModel): number {
    return this.store.getTotal(fee);
  }

  protected stateClass(fee: ScsMemberFeesModel): string {
    if (fee.state === 'review') return 'state-review';
    if (fee.state === 'uploaded' || fee.state === 'sent') return 'state-uploaded';
    return '';
  }

  protected canChange(): boolean {
    return hasRole('treasurer', this.currentUser() as UserModel | undefined);
  }

  /******************************* actions *************************************** */
  protected async editFee(fee: ScsMemberFeesModel): Promise<void> {
    const mcat = this.store.mcatCategory();
    const currentUser = this.currentUser();
    if (!currentUser) return;
    const modal = await this.store['modalController'].create({
      component: ScsMemberFeeEditModal,
      componentProps: {
        fee: { ...fee },
        currentUser,
        mcat,
        readOnly: !this.canChange(),
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<ScsMemberFeesModel>();
    if (role === 'confirm' && data) {
      await this.store.saveFee(data);
    }
  }

  protected async generateFees(): Promise<void> {
    if (!this.canChange()) return;
    await this.store.generateFees();
    this.cdr.markForCheck();
  }

  protected async showActions(fee: ScsMemberFeesModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addButtons(actionSheetOptions, fee);
    await this.executeActions(actionSheetOptions, fee);
  }

  private addButtons(opts: ActionSheetOptions, fee: ScsMemberFeesModel): void {
    const imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

    if (this.canChange()) {
      opts.buttons.push(createActionSheetButton('invoice.edit', imgixBaseUrl, 'edit'));
      opts.buttons.push(createActionSheetButton('invoice.upload', imgixBaseUrl, 'upload'));
      opts.buttons.push(createActionSheetButton('invoice.download', imgixBaseUrl, 'download'));
      opts.buttons.push(createActionSheetDivider());
      if (fee.bkey) {
        opts.buttons.push(createActionSheetButton('invoice.delete', imgixBaseUrl, 'trash'));
        opts.buttons.push(createActionSheetDivider());
      }
      opts.buttons.push(createActionSheetButton('person.edit', imgixBaseUrl, 'edit'));
      opts.buttons.push(createActionSheetButton('member.edit', imgixBaseUrl, 'edit'));
    }
    opts.buttons.push(createActionSheetButton('cancel', imgixBaseUrl, 'cancel'));
  }

  private async executeActions(opts: ActionSheetOptions, fee: ScsMemberFeesModel): Promise<void> {
    if (opts.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(opts);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'invoice.edit':
        await this.editFee(fee);
        break;
      case 'invoice.upload':
        await this.store.uploadToBexio(fee);
        break;
      case 'invoice.download':
        await this.store.downloadPdf(fee);
        break;
      case 'invoice.delete':
        await this.store.deleteFee(fee);
        break;
      case 'person.edit':
        if (fee.member?.key) {
          // Navigate to person edit page
          window.location.href = `/person/${fee.member.key}`;
        }
        break;
      case 'member.edit':
        await this.store.editMembership(fee, !this.canChange());
        break;
      default:
        error(undefined, `ScsMemberFees.executeActions: unknown action ${data.action}`);
    }
    this.cdr.markForCheck();
  }

  protected getStateColor(state: string): string {
    switch(state) {
      case 'review': return 'danger';
      case 'uploaded': 
      case 'sent': return 'success';
    }
    return '';
  }
}
