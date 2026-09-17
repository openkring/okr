import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, input, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonAvatar, IonButton, IonButtons, IonChip, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonImg, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { INVOICE_STATE_VALUES, RoleName, MemberFeeModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';

import { getFeeTotal } from '@okr/relationship-membership-util';

import { MemberFeesStore } from './member-fee.store';
import { MemberFeeEditModal } from './member-fee-edit.modal';
import { Menu } from '@okr/cms-menu-feature';

@Component({
  selector: 'okr-member-fees',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvatarPipe, SvgIconPipe,
    Spinner, ListFilter, EmptyList, Menu,
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
          {{ store.i18n.memberFee_list_title() }}
        </ion-title>
        @if(hasRole('treasurer')) {
          <ion-buttons slot="end">
            <ion-button [id]="popupId">
              <ion-icon slot="icon-only" [src]="'ellipsis-vertical' | svgIcon" />
            </ion-button>
            <ion-popover [trigger]="popupId" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()"/>
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

      <okr-list-filter
        (searchTermChanged)="onSearchTermChange($event)"
        (categoryChanged)="onMcatSelected($event)" [categories]="mcatScsCategory()"
        selectedString="all" [strings]="states"  (stringsChanged)="onStateChange($event)" stringsName="state"
      />

      <!-- list header (desktop) -->
      <ion-toolbar color="primary" class="ion-hide-sm-down">
        <ion-grid>
          <ion-row>
            <ion-col size="6" size-md="2" class="sortable" (click)="sortBy('name')">
              <strong>Name</strong>
              @if (sortCol() === 'name') { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
            </ion-col>
            @for (col of columns(); track col.key) {
              <ion-col class="ion-hide-md-down sortable" size="1" (click)="sortBy(col.key)">
                <strong>{{ col.label }}</strong>
                @if (sortCol() === col.key) { <ion-icon [src]="sortDir() === 'asc' ? ('chevron-up' | svgIcon) : ('chevron-down' | svgIcon)" /> }
              </ion-col>
            }
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
        <okr-spinner />
      } @else {
        @if (sortedFees().length === 0) {
          <okr-empty-list [message]="store.i18n.memberFee_list_empty()" />
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
                @for (col of columns(); track col.key) {
                  <ion-col class="ion-hide-md-down" size="1">
                    <ion-item lines="none">
                      <ion-label class="ion-text-end">{{ getAmount(fee, col.key).toFixed(2) }}</ion-label>
                    </ion-item>
                  </ion-col>
                }
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
export class MemberFees {
  protected readonly store = inject(MemberFeesStore);
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

  /**
   * The grid columns are the position keys the fee schedule actually produced, in first-seen
   * order — no fixed set of eight any more. The label comes from the position itself.
   */
  protected columns = computed((): { key: string; label: string }[] => {
    const columns: { key: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const fee of this.allFees()) {
      for (const position of fee.positions ?? []) {
        const key = position.key || position.usage;
        if (seen.has(key)) continue;
        seen.add(key);
        columns.push({ key, label: position.label || key });
      }
    }
    return columns;
  });
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
        av = getFeeTotal(a.positions ?? []);
        bv = getFeeTotal(b.positions ?? []);
      } else if (col === 'state') {
        av = a.state;
        bv = b.state;
      } else {
        av = this.getAmount(a, col);
        bv = this.getAmount(b, col);
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
  protected getTotal(fee: MemberFeeModel): number {
    return this.store.getTotal(fee);
  }

  /** The amount of one position of this fee; a rebate counts negative, a missing position is 0. */
  protected getAmount(fee: MemberFeeModel, key: string): number {
    const position = (fee.positions ?? []).find(p => (p.key || p.usage) === key);
    if (!position) return 0;
    return position.type === 'rebate' ? -position.amount : position.amount;
  }

  protected stateClass(fee: MemberFeeModel): string {
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
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'reload': await this.store.generateFees(); break;
      case 'export': await this.store.export("raw"); break;
      case 'totals': await this.store.showTotals(); break;
      case 'archive': await this.store.archive(); break;
      default: error(undefined, `MemberFeesList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
    this.cdr.markForCheck();
  }

  protected async editFee(fee: MemberFeeModel): Promise<void> {
    const mcat = this.store.mcatCategory();
    const currentUser = this.currentUser();
    if (!currentUser) return;
    const modal = await this.store['modalController'].create({
      component: MemberFeeEditModal,
      componentProps: {
        fee: { ...fee },
        currentUser,
        mcat,
        readOnly: !this.canChange(),
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<MemberFeeModel>();
    if (role === 'confirm' && data) {
      await this.store.saveFee(data);
    }
  }

  protected async generateFees(): Promise<void> {
    if (!this.canChange()) return;
    await this.store.generateFees();
    this.cdr.markForCheck();
  }

  protected async showActions(fee: MemberFeeModel): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addButtons(actionSheetOptions, fee);
    await this.executeActions(actionSheetOptions, fee);
  }

  private addButtons(opts: ActionSheetOptions, fee: MemberFeeModel): void {
    const imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

    if (this.canChange()) {
      opts.buttons.push(createActionSheetButton('invoice.edit', imgixBaseUrl, 'edit', this.store.i18n.invoice_update()));
      // Bexio invoices the CLICKED fee; every other backend runs the bulk postMemberFees over
      // every 'ready' row of the tenant and ignores the clicked one. One label for both lied
      // about what the second one does, so the label follows the backend — and the bulk run
      // names its row count in its own confirmation (see MemberFeesStore.postMemberFees).
      const invoiceLabel = this.store.isBexioBackend()
        ? this.store.i18n.invoice_upload()
        : this.store.i18n.memberFee_invoiceAll_label();
      opts.buttons.push(createActionSheetButton('invoice.upload', imgixBaseUrl, 'upload', invoiceLabel));
      opts.buttons.push(createActionSheetButton('invoice.download', imgixBaseUrl, 'download', this.store.i18n.invoice_download()));
      opts.buttons.push(createActionSheetButton('invoice.paid', imgixBaseUrl, 'checkmark', this.store.i18n.invoice_paid()));
      opts.buttons.push(createActionSheetDivider());
      if (fee.okey) {
        opts.buttons.push(createActionSheetButton('invoice.delete', imgixBaseUrl, 'trash', this.store.i18n.invoice_delete()));
        opts.buttons.push(createActionSheetDivider());
      }
      opts.buttons.push(createActionSheetButton('person.edit', imgixBaseUrl, 'edit', this.store.i18n.person_update()));
      opts.buttons.push(createActionSheetButton('member.edit', imgixBaseUrl, 'edit', this.store.i18n.member_update()));
    }
    opts.buttons.push(createActionSheetButton('cancel', imgixBaseUrl, 'cancel', this.store.i18n.cancel()));
  }

  private async executeActions(opts: ActionSheetOptions, fee: MemberFeeModel): Promise<void> {
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
        await this.store.invoice(fee);
        break;
      case 'invoice.download':
        await this.store.downloadPdf(fee);
        break;
      case 'invoice.delete':
        await this.store.deleteFee(fee);
        break;
      case 'invoice.paid':
        await this.store.setStatus(fee, 'paid');
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
        error(undefined, `MemberFees.executeActions: unknown action ${data.action}`);
    }
    this.cdr.markForCheck();
  }

  // 'initial', 'review', 'ready', 'uploaded', 'invoiced', 'sent', 'paid', 'cancelled'
  protected getStateColor(state: string): string {
    switch(state) {
      case 'initial': return 'tertiary';
      case 'review': return 'danger';
      case 'uploaded':
      case 'invoiced':
      case 'sent': return 'warning';
      case 'paid': return 'success';
    }
    return '';
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
