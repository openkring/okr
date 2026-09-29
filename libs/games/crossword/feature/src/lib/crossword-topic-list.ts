import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CrosswordTopicModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error } from '@okr/shared-util-angular';
import { hasRole, nameMatches } from '@okr/shared-util-core';

import { Menu } from '@okr/cms-menu-feature';

import { CrosswordTopicService } from '@okr/games-crossword-data-access';
import { CrosswordTopicEditModal } from '@okr/games-crossword-ui';
import { CROSSWORD_I18N_KEYS, CrosswordI18n } from '@okr/games-crossword-util';

/**
 * The crossword entry point: every registered user reaches it via the `game-crossword` menu item
 * to pick a topic to play. Only a `contentAdmin` sees the `…` menu (add / toggle edit mode) and,
 * once edit mode is on, the edit/delete actions on each row — the same two-gate shape as
 * `HearingQuizTreePage` (`hasRole('contentAdmin')` for the button, `editMode` for the actions).
 *
 * Non-admins, and admins outside edit mode, see only `published` topics — a draft has no
 * guaranteed grid yet and is not meant to be played. Edit mode additionally lists drafts so an
 * admin can find and finish them.
 */
@Component({
  selector: 'okr-crossword-topic-list',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, Menu, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel, IonChip, IonPopover,
  ],
  styles: [`.cw-stale { color: var(--ion-color-warning); }`],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ count() }} {{ i18n.list_title() }}</ion-title>
        @if (isContentAdmin()) {
          <ion-buttons slot="end">
            <ion-button id="{{ popupId() }}">
              <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
            </ion-button>
            <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"
              (ionPopoverDidDismiss)="onPopoverDismiss($event)">
              <ng-template>
                <ion-content>
                  <okr-menu [menuName]="contextMenuName()" [toggleStates]="{ toggleEditMode: editMode() }" />
                </ion-content>
              </ng-template>
            </ion-popover>
          </ion-buttons>
        }
      </ion-toolbar>
      <okr-list-filter (searchTermChanged)="searchTerm.set($event)" />
    </ion-header>

    <ion-content #content>
      @if (isLoading()) {
        <okr-spinner />
      } @else if (filteredCount() === 0) {
        <okr-empty-list [message]="i18n.list_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (topic of filtered(); track topic.okey) {
            <ion-item button [detail]="false" (click)="showActions(topic)">
              <ion-label>
                <h2>{{ topic.title }}</h2>
                @if (markerFor(topic); as marker) {
                  <p class="cw-stale">{{ marker }}</p>
                }
              </ion-label>
              @if (topic.state === 'published') {
                <ion-chip slot="end" color="success">{{ i18n.publish() }}</ion-chip>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class CrosswordTopicList {
  private readonly topicService = inject(CrosswordTopicService);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService).translateAll(CROSSWORD_I18N_KEYS) as CrosswordI18n;
  private readonly imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  // route inputs — `:listId` is unused (always 'all'), `:contextMenuName` names the context menu
  public readonly listId = input('all');
  public readonly contextMenuName = input('c-crossword');

  // filter + edit-mode state
  protected readonly searchTerm = signal('');
  protected readonly editMode = signal(false);

  private readonly topicsResource = rxResource({ stream: () => this.topicService.list() });

  protected readonly currentUser = computed(() => this.appStore.currentUser());
  protected readonly isContentAdmin = computed(() => hasRole('contentAdmin', this.currentUser()));
  protected readonly isLoading = computed(() => this.topicsResource.isLoading());
  protected readonly count = computed(() => this.topicsResource.value()?.length ?? 0);

  protected readonly filtered = computed(() => {
    const topics = this.topicsResource.value() ?? [];
    const admin = this.editMode();
    return topics.filter(topic =>
      (admin || topic.state === 'published') && nameMatches(topic.title, this.searchTerm()));
  });
  protected readonly filteredCount = computed(() => this.filtered().length);
  protected readonly popupId = computed(() => `c_crossword_${this.listId()}`);

  protected markerFor(topic: CrosswordTopicModel): string {
    if (!topic.grid) return this.i18n.no_grid();
    if (topic.gridStale) return this.i18n.grid_stale();
    return '';
  }

  /******************************* list-level actions *************************************** */
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item — not an error
    switch (selectedMethod) {
      case 'toggleEditMode': this.toggleEditMode(); break;
      case 'add': await this.add(); break;
      default: error(undefined, `CrosswordTopicList.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected toggleEditMode(): void {
    if (!this.isContentAdmin()) return;
    this.editMode.set(!this.editMode());
  }

  protected async add(): Promise<void> {
    if (!this.editMode()) return;
    await this.edit(new CrosswordTopicModel(this.appStore.tenantId()));
  }

  /******************************* per-item actions *************************************** */
  protected async showActions(topic: CrosswordTopicModel): Promise<void> {
    const options = createActionSheetOptions(this.i18n.as_title());
    this.addActionSheetButtons(options);
    await this.executeActions(options, topic);
  }

  private addActionSheetButtons(options: ActionSheetOptions): void {
    if (this.editMode()) {
      options.buttons.push(createActionSheetButton('crossword.edit', this.i18n.edit(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('crossword.delete', this.i18n.delete(), this.imgixBaseUrl, 'trash'));
      options.buttons.push(createActionSheetDivider());
    }
    options.buttons.push(createActionSheetButton('crossword.play', this.i18n.play(), this.imgixBaseUrl, 'play'));
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private async executeActions(options: ActionSheetOptions, topic: CrosswordTopicModel): Promise<void> {
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'crossword.play': await this.play(topic); break;
      case 'crossword.edit': await this.edit(topic); break;
      case 'crossword.delete': await this.delete(topic); break;
    }
  }

  protected async play(topic: CrosswordTopicModel): Promise<void> {
    await this.router.navigate(['/crossword', topic.okey]);
  }

  protected async edit(topic: CrosswordTopicModel): Promise<void> {
    if (!this.editMode()) return;
    const modal = await this.modalController.create({
      component: CrosswordTopicEditModal,
      componentProps: { topic, readOnly: false },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm' && data) {
      const updated = data as CrosswordTopicModel;
      if (updated.okey === '') {
        await this.topicService.create(updated, this.currentUser());
      } else {
        await this.topicService.update(updated, this.currentUser());
      }
    }
    this.topicsResource.reload();
  }

  protected async delete(topic: CrosswordTopicModel): Promise<void> {
    if (!this.editMode()) return;
    await this.topicService.delete(topic, this.currentUser());
    this.topicsResource.reload();
  }
}
