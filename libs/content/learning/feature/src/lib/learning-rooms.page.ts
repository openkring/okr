import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  ActionSheetController, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
  IonMenuButton, IonTitle, IonToolbar,
} from '@ionic/angular';
import type { ActionSheetOptions } from '@ionic/angular';
import { map } from 'rxjs';

import { LEARNING_ROOM_SUFFIX, isLearningPage, learningRoomUrl } from '@okr/content-learning-util';
import { PageModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';

import { LearningStore } from './learning.store';

/**
 * «Lernräume» — `/private/learning-rooms` (spec 1.115 §6, contentAdmin/admin): every learning page
 * of the tenant with how it is reached (menu or group) and whether it is public. Header: «Neuer
 * Lernraum». Per row: open, settings (rename, topics, curators, start tab), copy the link for a
 * menu entry (menu entries are made in the menu editor), publish/unpublish, archive.
 */
@Component({
  selector: 'okr-learning-rooms-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonChip,
  ],
  providers: [LearningStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filtered().length }}/{{ rooms().length }} {{ store.i18n.rooms_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="store.addRoom(rooms())" [attr.aria-label]="store.i18n.rooms_add()">
            <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="searchTerm.set($event)" />
    </ion-header>

    <ion-content>
      @if (roomsResource.isLoading() && rooms().length === 0) {
        <okr-spinner />
      } @else if (filtered().length === 0) {
        <okr-empty-list [message]="store.i18n.rooms_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (room of filtered(); track room.okey) {
            <ion-item button [detail]="false" (click)="showActions(room)">
              <ion-label class="ion-text-wrap">
                <h2>{{ room.title || room.name }}</h2>
                <p>{{ reach(room) }} · {{ url(room) }}</p>
              </ion-label>
              <ion-chip slot="end" [color]="room.isPrivate === false ? 'warning' : 'medium'">
                {{ room.isPrivate === false ? store.i18n.rooms_public() : store.i18n.rooms_private() }}
              </ion-chip>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class LearningRoomsPage {
  protected readonly store = inject(LearningStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected readonly searchTerm = signal('');

  protected readonly roomsResource = rxResource({
    stream: () => this.store.pageService.list().pipe(
      map(pages => pages.filter(p => isLearningPage(p, this.store.tenantId()))),
    ),
  });
  protected readonly rooms = computed<PageModel[]>(() => this.roomsResource.value() ?? []);
  protected readonly filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.rooms();
    return this.rooms().filter(r => [r.title, r.name, r.okey, this.reach(r)].some(f => (f ?? '').toLowerCase().includes(term)));
  });

  protected reach(room: PageModel): string {
    const groupKey = this.groupKeyOf(room);
    return groupKey ? fill(this.store.i18n.rooms_group(), { name: this.store.groupName(groupKey) || groupKey }) : this.store.i18n.rooms_menu();
  }

  protected url(room: PageModel): string {
    return learningRoomUrl(room.okey);
  }

  private groupKeyOf(room: PageModel): string {
    return room.okey.endsWith(LEARNING_ROOM_SUFFIX) ? room.okey.slice(0, -LEARNING_ROOM_SUFFIX.length) : '';
  }

  /*-------------------------- actions --------------------------------*/
  protected async showActions(room: PageModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.rooms_actions());
    this.addActionSheetButtons(options, room);
    await this.executeActions(options, room);
  }

  private addActionSheetButtons(options: ActionSheetOptions, room: PageModel): void {
    options.buttons.push(createActionSheetButton('learning.open', this.store.i18n.rooms_open(), this.imgixBaseUrl, 'eye-on'));
    options.buttons.push(createActionSheetButton('learning.edit', this.store.i18n.rooms_edit(), this.imgixBaseUrl, 'edit'));
    options.buttons.push(createActionSheetButton('learning.copyUrl', this.store.i18n.rooms_copyUrl(), this.imgixBaseUrl, 'copy'));
    if (room.isPrivate === false) {
      options.buttons.push(createActionSheetButton('learning.unpublish', this.store.i18n.rooms_unpublish(), this.imgixBaseUrl, 'lock-closed'));
    } else {
      options.buttons.push(createActionSheetButton('learning.publish', this.store.i18n.rooms_publish(), this.imgixBaseUrl, 'globe'));
    }
    options.buttons.push(createActionSheetButton('learning.archive', this.store.i18n.rooms_archive(), this.imgixBaseUrl, 'archive'));
    options.buttons.push(createActionSheetDivider());
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.rooms_cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, room: PageModel): Promise<void> {
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'learning.open': await this.store.openRoom(room); break;
      case 'learning.edit': await this.store.editRoom(room); break;
      case 'learning.copyUrl': await this.store.copyUrl(room); break;
      case 'learning.publish': await this.store.publish(room); break;
      case 'learning.unpublish': await this.store.unpublish(room); break;
      case 'learning.archive': await this.store.archiveRoom(room); break;
    }
  }
}
