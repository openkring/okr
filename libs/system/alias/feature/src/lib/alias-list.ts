import { Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';
import type { ActionSheetOptions } from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AliasModel } from '@okr/shared-models';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import {
  AlertService, createActionSheetButton, createActionSheetDivider, createActionSheetOptions,
} from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';
import { getAliasUsability } from '@okr/system-alias-util';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { AliasStore } from './alias.store';

/**
 * Die Alias-Liste (`/alias/:listId/:contextMenuName`).
 *
 * Sie zeigt den Zustand jedes Alias als Chip — genau die Unterscheidung, die der Resolver
 * trifft: ein grüner Alias liefert 302, ein grauer 410. Wer wissen will, warum ein gedruckter
 * QR-Code nicht mehr funktioniert, sieht es hier, ohne den Link aufrufen zu müssen.
 */
@Component({
  selector: 'okr-alias-list',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter, Menu,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonPopover, IonChip,
  ],
  providers: [AliasStore],
  styles: [`
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ store.i18n.alias_plural() }}</ion-title>
        @if (!readOnly()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true"
              [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content><okr-menu [menuName]="contextMenuName()" /></ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>

      <okr-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        (typeChanged)="store.setSelectedSpace($event)"
        [types]="spaceCategory()"
      />

      <ion-toolbar color="light" class="ion-hide-sm-down">
        <ion-list lines="none">
          <ion-item lines="none" color="light">
            <ion-label><strong>{{ store.i18n.field_alias_label() }}</strong></ion-label>
            <ion-label class="ion-hide-md-down"><strong>{{ store.i18n.detail_target() }}</strong></ion-label>
            <ion-label slot="end"><strong>{{ store.i18n.detail_stats_usecount() }}</strong></ion-label>
          </ion-item>
        </ion-list>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (alias of filtered(); track alias.okey) {
            <ion-item button [detail]="false" (click)="showActions(alias)">
              <ion-label>
                <h2 class="mono">{{ alias.space }}/{{ alias.alias }}</h2>
                <p>{{ alias.notes || alias.original }}</p>
              </ion-label>
              <ion-label class="ion-hide-md-down">
                <p>{{ alias.targetUrl || alias.targetKey }}</p>
              </ion-label>
              @if (stateLabel(alias); as state) {
                <ion-chip slot="end" color="medium">{{ state }}</ion-chip>
              }
              <ion-label slot="end" class="ion-text-end">{{ alias.useCount }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class AliasList {
  protected readonly store = inject(AliasStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  public readonly listId = input('all');
  public readonly contextMenuName = input.required<string>();

  constructor() {
    // 'all' ist der Default; ein listId, das einem Space-Namen entspricht, filtert direkt.
    effect(() => this.store.setSelectedSpace(this.listId() === 'all' ? '' : this.listId()));
  }

  protected readonly count = computed(() => this.store.aliasesCount());
  protected readonly filtered = computed(() => this.store.filteredAliases());
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly spaceCategory = computed(() => this.store.spaceCategory());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => !hasRole('privileged', this.currentUser()));
  protected readonly popupId = computed(() => `c_aliases_${this.listId()}`);

  /** Leer, wenn der Alias benutzbar ist — ein Chip nur dort, wo etwas NICHT stimmt. */
  protected stateLabel(alias: AliasModel): string {
    const usability = getAliasUsability(alias, getTodayStr(DateFormat.StoreDate));
    switch (usability) {
      case 'disabled': return this.store.i18n.state_disabled();
      case 'archived': return this.store.i18n.state_archived();
      case 'notYetValid': return this.store.i18n.state_notyetvalid();
      case 'expired': return this.store.i18n.state_expired();
      case 'exhausted': return this.store.i18n.state_exhausted();
      default: return '';
    }
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    switch ($event.detail.data) {
      case 'add': await this.store.add(this.readOnly()); break;
      case 'spaces': await this.router.navigateByUrl('/alias/spaces'); break;
      case 'exportraw': this.store.exportRaw(); break;
      default:
        if ($event.detail.data) {
          this.alertService.error(`AliasList.onPopoverDismiss: unknown method ${$event.detail.data}`);
        }
    }
  }

  protected async showActions(alias: AliasModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.alias_singular());
    this.addActionSheetButtons(options);
    await this.executeActions(options, alias);
  }

  private addActionSheetButtons(options: ActionSheetOptions): void {
    options.buttons.push(createActionSheetButton(
      'alias.view', this.store.i18n.action_view(), this.imgixBaseUrl, 'eye-on'));
    options.buttons.push(createActionSheetButton(
      'alias.detail', this.store.i18n.detail_title(), this.imgixBaseUrl, 'link'));
    options.buttons.push(createActionSheetButton(
      'alias.qr', this.store.i18n.context_qrdownload(), this.imgixBaseUrl, 'download'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton(
      'cancel', this.store.i18n.action_cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];
  }

  private async executeActions(options: ActionSheetOptions, alias: AliasModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'alias.view': await this.store.view(alias); break;
      case 'alias.detail': await this.router.navigateByUrl(`/alias/${alias.okey}`); break;
      // Der QR-Download braucht die Detailseite nicht: der Encoder ist Angular-frei und der
      // Kurzlink lässt sich aus Space und Alias bilden.
      case 'alias.qr': await this.router.navigateByUrl(`/alias/${alias.okey}`); break;
    }
  }
}
