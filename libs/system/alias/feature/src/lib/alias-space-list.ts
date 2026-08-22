import { Component, computed, inject } from '@angular/core';
import {
  ActionSheetController, IonBackButton, IonButtons, IonChip, IonContent, IonHeader, IonItem,
  IonLabel, IonList, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';
import type { ActionSheetOptions } from '@ionic/angular/standalone';

import { AliasSpaceModel } from '@okr/shared-models';
import { EmptyList, Spinner } from '@okr/shared-ui';
import {
  createActionSheetButton, createActionSheetDivider, createActionSheetOptions,
} from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';

import { AliasStore } from './alias.store';

/**
 * Die Space-Übersicht (`/alias/spaces`, admin).
 *
 * Ausdrücklich eine KURZE Liste — 3 bis 5 Zeilen pro Tenant. Wäre je ein Plakat oder eine
 * Kampagne ein eigener Space, würde sie zur zweiten Alias-Liste; genau deshalb tragen
 * Kampagnen eine Notiz und keinen eigenen Space.
 *
 * Sie zeigt pro Space, wie viele Aliase darin leben und wie oft sie insgesamt benutzt wurden —
 * dieselbe Zahl, die auch entscheidet, ob sich Name, Art und Charset noch ändern lassen.
 */
@Component({
  selector: 'okr-alias-space-list',
  standalone: true,
  imports: [
    Spinner, EmptyList,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonContent, IonList, IonItem, IonLabel, IonChip,
  ],
  providers: [AliasStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button defaultHref="/alias/all/alias-context" /></ion-buttons>
        <ion-title>{{ count() }} {{ store.i18n.space_plural() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (count() === 0) {
        <okr-empty-list [message]="store.i18n.space_list_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (space of spaces(); track space.okey) {
            <ion-item button [detail]="false" (click)="showActions(space)">
              <ion-label>
                <h2>{{ space.name }}</h2>
                <p>{{ space.kind }} · {{ space.length }} · {{ space.charset }}</p>
              </ion-label>
              <ion-chip slot="end" color="medium">
                {{ aliasCount(space) }} {{ store.i18n.space_aliascount() }}
              </ion-chip>
              <ion-chip slot="end" color="medium">
                {{ useCount(space) }} {{ store.i18n.space_usecount() }}
              </ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class AliasSpaceList {
  protected readonly store = inject(AliasStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected readonly spaces = computed(() => this.store.spaces());
  protected readonly count = computed(() => this.store.spacesCount());
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly currentUser = computed(() => this.store.currentUser());
  protected readonly readOnly = computed(() => !hasRole('admin', this.currentUser()));

  protected aliasCount(space: AliasSpaceModel): number {
    return this.store.spaceUsage().get(space.name)?.aliasCount ?? 0;
  }

  protected useCount(space: AliasSpaceModel): number {
    return this.store.spaceUsage().get(space.name)?.useCount ?? 0;
  }

  protected async showActions(space: AliasSpaceModel): Promise<void> {
    const options = createActionSheetOptions(space.name);
    this.addActionSheetButtons(options);
    await this.executeActions(options, space);
  }

  private addActionSheetButtons(options: ActionSheetOptions): void {
    if (this.readOnly()) {
      options.buttons.push(createActionSheetButton(
        'space.view', this.store.i18n.action_view(), this.imgixBaseUrl, 'eye-on'));
    } else {
      options.buttons.push(createActionSheetButton(
        'space.edit', this.store.i18n.action_update(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton(
        'space.add', this.store.i18n.action_create(), this.imgixBaseUrl, 'add'));
      // Archivieren, nicht löschen: ein gelöschter Space macht jeden seiner Aliase
      // unauflösbar, auch die bereits gedruckten. Die Regeln erzwingen das ebenfalls.
      options.buttons.push(createActionSheetButton(
        'space.archive', this.store.i18n.action_delete(), this.imgixBaseUrl, 'trash'));
    }
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton(
      'cancel', this.store.i18n.action_cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) options.buttons = [];
  }

  private async executeActions(options: ActionSheetOptions, space: AliasSpaceModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'space.view': await this.store.editSpace(space, true); break;
      case 'space.edit': await this.store.editSpace(space, this.readOnly()); break;
      case 'space.add': await this.store.addSpace(this.readOnly()); break;
      case 'space.archive': await this.store.archiveSpace(space); break;
    }
  }
}
