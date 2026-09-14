import { Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActionSheetController, ActionSheetOptions, IonBadge, IonButton, IonButtons, IonContent, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonPopover, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { BankRuleModel } from '@okr/shared-models';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';

import { Menu } from '@okr/cms-menu-feature';

import { BankRuleStore } from './bank-rule.store';

@Component({
  selector: 'okr-bank-rule-list',
  standalone: true,
  imports: [
    SvgIconPipe, Menu, Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonIcon, IonPopover,
    IonContent, IonList, IonItem, IonLabel, IonBadge,
  ],
  providers: [BankRuleStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ store.rules().length }} {{ store.i18n.plural() }}</ion-title>
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
        <okr-spinner />
      } @else if (store.rules().length === 0) {
        <okr-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (rule of store.rules(); track rule.okey) {
            <ion-item button [detail]="false" (click)="showActions(rule)">
              <ion-label>
                <h3>{{ rule.title }}</h3>
                <p>{{ conditionLabel(rule.condition) }} «{{ rule.term }}» → {{ accountLabel(rule.accountKey) }} · {{ store.i18n.priority_label() }} {{ rule.priority }}</p>
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
export class BankRuleList {
  protected readonly store = inject(BankRuleStore);
  private readonly route = inject(ActivatedRoute);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  /** Name of the DB menu document loaded into the header context menu (route `:contextMenuName`). */
  public readonly contextMenuName = input.required<string>();
  protected readonly popupId = computed(() => `c_bankrules_${this.contextMenuName()}`);

  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setAccountingTenant(id);
    });
  }

  /** Translated label for a BankRuleCondition value (falls back to the raw enum). */
  protected conditionLabel(condition: string): string {
    switch (condition) {
      case 'contains': return this.store.i18n.condition_contains();
      case 'startsWith': return this.store.i18n.condition_startsWith();
      case 'endsWith': return this.store.i18n.condition_endsWith();
      case 'regex': return this.store.i18n.condition_regex();
      default: return condition;
    }
  }

  /** `id — name` of the account matching `accountKey` in the loaded chart of accounts, or the raw key. */
  protected accountLabel(accountKey: string): string {
    const account = this.store.accounts().find(a => a.okey === accountKey);
    return account ? `${account.id} — ${account.name}` : accountKey;
  }

  /** List-level context-menu actions (DB `okr-menu` call items whose `url` is the method name). */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'add': await this.store.openCreate(); break;
      default: this.alertService.error(`BankRuleList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async showActions(rule: BankRuleModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(options);
    await this.executeActions(options, rule);
  }

  private addActionSheetButtons(options: ActionSheetOptions): void {
    options.buttons.push(createActionSheetButton('bankRule.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('bankRule.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];   // only cancel → show nothing
  }

  private async executeActions(options: ActionSheetOptions, rule: BankRuleModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'bankRule.edit':   await this.store.openEdit(rule, false); break;
      case 'bankRule.delete': await this.store.delete(rule); break;
    }
  }
}
