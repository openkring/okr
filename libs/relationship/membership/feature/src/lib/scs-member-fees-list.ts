import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { INVOICE_STATE_VALUES, RoleName, ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { getAge, hasRole } from '@bk2/shared-util-core';

import { AvatarPipe } from '@bk2/avatar-ui';

import { getFeeTotal } from '@bk2/relationship-membership-data-access';

import { ScsMemberFeesStore } from './scs-member-fees.store';
import { ScsMemberFeeEditModal } from './scs-member-fee-edit.modal';
import { MenuComponent } from '@bk2/cms-menu-feature';

@Component({
  selector: 'bk-scs-member-fees',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe, TranslatePipe, AvatarPipe, SvgIconPipe,
    SpinnerComponent, ListFilterComponent, EmptyListComponent, MenuComponent,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon, IonPopover,
    IonContent, IonItem, IonAvatar, IonImg, IonLabel, IonGrid, IonRow, IonCol, IonChip
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    .total { font-weight: bold; text-align: right; }
    .name { font-size: 0.8rem; }
    ion-chip { font-size: 0.8rem; padding-top: 0px; padding-bottom: 0px; height: 12px; }
    .sortable { cursor: pointer; user-select: none; }
    .sortable ion-icon { vertical-align: middle; font-size: 0.8rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>
          {{ sortedFees().length }}/{{ allFees().length }}
          {{ '@finance.scsMemberFee.list.title' | translate | async }}
        </ion-title>
        @if(hasRole('treasurer')) {
          <ion-buttons slot="end">
            <ion-button [id]="popupId">
              <ion-icon slot="icon-only" [src]="'menu' | svgIcon" />
            </ion-button>
            <ion-popover [trigger]="popupId" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <bk-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

      <bk-list-filter
        (searchTermChanged)="onSearchTermChange($event)"
        (categoryChanged)="onMcatSelected($event)" [categories]="mcatScsCategory()"
        selectedString="all" [strings]="states"  (stringsChanged)="onStateChange($event)" stringsName="state"
      />

      <!-- list header (desktop) -->
      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="6" size-md="2" class="sortable" (click)="sortBy('name')">
              <strong>Name</strong>
              @if (sortCol() === 'name') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy('jb')">
              <strong>JB</strong>
              @if (sortCol() === 'jb') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy('srv')">
              <strong>SRV</strong>
              @if (sortCol() === 'srv') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy('entryFee')">
              <strong>Entry</strong>
              @if (sortCol() === 'entryFee') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy('locker')">
              <strong>Gard.</strong>
              @if (sortCol() === 'locker') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy('skiff')">
              <strong>Skiff</strong>
              @if (sortCol() === 'skiff') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy('skiffInsurance')">
              <strong>Vers.</strong>
              @if (sortCol() === 'skiffInsurance') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy('bev')">
              <strong>Getr.</strong>
              @if (sortCol() === 'bev') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy('rebate')">
              <strong>Rabatt</strong>
              @if (sortCol() === 'rebate') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col size="3" size-md="1" class="sortable" (click)="sortBy('total')">
              <strong>Total</strong>
              @if (sortCol() === 'total') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            <ion-col size="3" size-md="1" class="sortable" (click)="sortBy('state')">
              <strong>Status</strong>
              @if (sortCol() === 'state') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <bk-spinner />
      } @else {
        @if (sortedFees().length === 0) {
          <bk-empty-list message="@finance.scsMemberFee.list.empty" />
        } @else {
          <ion-grid>
            @for (fee of sortedFees(); track $index) {
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
                    <ion-label class="ion-text-end">{{(fee.bev).toFixed(2)}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col class="ion-hide-md-down" size="1">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{fee.rebate}}</ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="3" size-md="1">
                  <ion-item lines="none">
                    <ion-label class="total">{{ getTotal(fee).toFixed(2) }}</ion-label>
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

  // inputs
  public contextMenuName = input.required<string>();

  // filters
  protected mcatScsCategory = computed(() => this.store.mcatCategory());

  // sort state
  protected sortCol = signal<string>('');
  protected sortDir = signal<'asc' | 'desc'>('asc');

  // computed
  protected isLoading = computed(() => this.store.isLoading());
  protected allFees = computed(() => this.store.allFees());
  protected currentUser = computed(() => this.store.currentUser());
  protected sortedFees = computed(() => {
    const fees = [...this.store.filteredFees()];
    const col = this.sortCol();
    if (!col) return fees;
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return fees.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (col === 'name') {
        av = `${a.member?.name2 ?? ''}${a.member?.name1 ?? ''}`;
        bv = `${b.member?.name2 ?? ''}${b.member?.name1 ?? ''}`;
      } else if (col === 'total') {
        av = getFeeTotal(a);
        bv = getFeeTotal(b);
      } else {
        av = (a as unknown as Record<string, number>)[col] ?? 0;
        bv = (b as unknown as Record<string, number>)[col] ?? 0;
      }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  });
  protected readonly popupId = crypto.randomUUID();

  // constants for the view template
  protected states = [...INVOICE_STATE_VALUES, 'all' ];

  /******************************* sorting *************************************** */
  protected sortBy(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  /******************************* filters *************************************** */
  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onMcatSelected(mcat: string): void {
    this.store.setSelectedMcat(mcat);
  }

  protected onStateChange(selectedState: string): void {
    this.store.setSelectedState(selectedState);
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
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch (selectedMethod) {
      case 'reload': await this.store.generateFees(); break;
      case 'export': await this.store.export("raw"); break;
      case 'totals': await this.store.showTotals(); break;
      case 'archive': await this.store.archive(); break;
      default: error(undefined, `ScsMemberFeesList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
    this.cdr.markForCheck();
  }

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

  // 'initial', 'review', 'ready', 'uploaded', 'sent', 'paid', 'cancelled'
  protected getStateColor(state: string): string {
    switch(state) {
      case 'initial': return 'tertiary';
      case 'review': return 'danger';
      case 'uploaded': 
      case 'sent': return 'warning';
      case 'paid': return 'success';
    }
    return '';
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
