import { Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActionSheetController, ActionSheetOptions, IonBadge, IonButton, IonButtons,
  IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { OcrRuleModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';

import { AccountStore } from '@okr/finance-account-feature';
import { Menu } from '@okr/cms-menu-feature';

import { OcrRuleStore } from './ocr-rule.store';

@Component({
  selector: 'okr-ocr-rule-list',
  standalone: true,
  imports: [
    SvgIconPipe, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonIcon, IonPopover,
    IonContent, IonList, IonItem, IonLabel, IonBadge,
  ],
  providers: [OcrRuleStore, AccountStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ store.rules().length }} {{ store.i18n.list_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true"
            [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content>
                <okr-menu [menuName]="contextMenuName()" />
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <p>Loading...</p>
      } @else if (store.rules().length === 0) {
        <p>{{ store.i18n.empty() }}</p>
      } @else {
        <ion-list>
          @for (rule of store.rules(); track rule.okey) {
            <ion-item button [detail]="false" (click)="showActions(rule)">
              <ion-label>
                <h3>{{ rule.party }} → {{ rule.accountKey || '—' }}</h3>
                <p>{{ usageLabel(rule.ocrUsage) }} · Rang {{ rule.rank }}{{ (rule.aliases ?? []).length ? ' · ' + (rule.aliases ?? []).join(', ') : '' }}</p>
              </ion-label>
              @if (!rule.active) {
                <ion-badge slot="end" color="medium">{{ store.i18n.inactive() }}</ion-badge>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class OcrRuleList {
  protected readonly store = inject(OcrRuleStore);
  private readonly route = inject(ActivatedRoute);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /** Name of the DB menu document loaded into the header context menu (route `:contextMenuName`). */
  public readonly contextMenuName = input.required<string>();
  protected readonly popupId = computed(() => `c_ocrrules_${this.contextMenuName()}`);

  constructor() {
    // Standalone route (not under AccountingShell): seed the accounting tenant from the param
    // so the account/VAT pickers load. Mirrors AccountingShell's own param → setTenant wiring.
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setAccountingTenant(id);
    });
  }

  /** Translated label for an OcrUsage value (falls back to the raw enum). */
  protected usageLabel(usage: string): string {
    switch (usage) {
      case 'invoice': return this.store.i18n.usage_invoice();
      case 'expense': return this.store.i18n.usage_expense();
      case 'paper': return this.store.i18n.usage_paper();
      default: return usage;
    }
  }

  /** List-level context-menu actions (DB `okr-menu` call items whose `url` is the method name). */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add':    await this.store.openCreate(); break;
      case 'export': await this.store.export(); break;
      default: this.alertService.error(`OcrRuleList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(rule: OcrRuleModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options);
    await this.executeActions(options, rule);
  }

  private addActionSheetButtons(options: ActionSheetOptions): void {
    // Rules are local config → always editable (route is treasurer-guarded); external ledger
    // management does not gate them. "edit booking account" opens the account read-only when synced.
    options.buttons.push(createActionSheetButton('ocrRule.edit', this.store.i18n.action_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('ocrRule.account', this.store.i18n.action_account(), this.imgixBaseUrl, 'booking'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('ocrRule.delete', this.store.i18n.action_delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, rule: OcrRuleModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'ocrRule.view':    await this.store.openEdit(rule, true); break;
      case 'ocrRule.edit':    await this.store.openEdit(rule, false); break;
      case 'ocrRule.account': await this.store.editBookingAccount(rule); break;
      case 'ocrRule.delete':  await this.store.delete(rule); break;
    }
  }
}
