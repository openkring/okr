import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ActionSheetOptions, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, IonSearchbar, IonToolbar } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AocTagStore, TagItem } from './aoc-tag.store';

@Component({
  selector: 'bk-aoc-tag',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe, FormsModule,
    HeaderComponent,
    IonContent, IonToolbar, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonNote, IonBadge,
  ],
  providers: [AocTagStore],
  template: `
    <bk-header title="@aoc.tag.title" />
    <ion-content>

      <!-- Filter toolbar -->
      <ion-toolbar>
        <ion-searchbar
          [value]="searchTerm()"
          [placeholder]="('@aoc.tag.search.placeholder' | translate | async) ?? ''"
          (ionInput)="onSearch($event)"
          debounce="300" />
        <ion-buttons slot="end">
          <ion-button (click)="createTagDocument()">
            <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <!-- Two-column layout -->
      <ion-grid>
        <ion-row>

          <!-- Left column: tag documents -->
          <ion-col size="6">
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ '@aoc.tag.list.title' | translate | async }}
                  <ion-badge color="medium">{{ filteredTags().length }}</ion-badge>
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                @if(isLoading()) {
                  <ion-item lines="none">
                    <ion-label>{{ '@general.operation.loading' | translate | async }}</ion-label>
                  </ion-item>
                }
                <ion-list lines="inset">
                  @for(tag of filteredTags(); track tag.bkey) {
                    <ion-item
                      [color]="selectedTagKey() === tag.bkey ? 'light' : ''"
                      (click)="showTagActions(tag)"
                      button>
                      <ion-icon slot="start" src="{{ 'tags' | svgIcon }}" />
                      <ion-label>
                        <h3>{{ tag.tagModel }}</h3>
                        <p>bkey: {{ tag.bkey }}</p>
                      </ion-label>
                      <ion-note slot="end">{{ tagCount(tag) }}</ion-note>
                    </ion-item>
                  }
                </ion-list>
              </ion-card-content>
            </ion-card>
          </ion-col>

          <!-- Right column: tag strings of selected document -->
          <ion-col size="6">
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  @if(selectedTag()) {
                    {{ selectedTag()!.tagModel }}
                    <ion-badge color="medium">{{ tagStrings().length }}</ion-badge>
                  } @else {
                    {{ '@aoc.tag.strings.title' | translate | async }}
                  }
                </ion-card-title>
              </ion-card-header>
              <ion-card-content>
                @if(selectedTag()) {
                  <ion-list lines="inset">
                    <ion-item lines="none" (click)="addTagString(selectedTag()!)" button>
                      <ion-icon slot="start" src="{{ 'add' | svgIcon }}" color="primary" />
                      <ion-label color="primary">{{ '@aoc.tag.string.add.button' | translate | async }}</ion-label>
                    </ion-item>
                    @for(tagStr of tagStrings(); track tagStr) {
                      <ion-item (click)="showTagStringActions(selectedTag()!, tagStr)" button>
                        <ion-icon slot="start" src="{{ 'tag' | svgIcon }}" />
                        <ion-label>
                          <h3>{{ tagStr }}</h3>
                          <p>{{ tagStr | translate | async}}</p>
                        </ion-label>
                      </ion-item>
                    }
                  </ion-list>
                } @else {
                  <ion-item lines="none">
                    <ion-label color="medium">{{ '@aoc.tag.strings.empty' | translate | async }}</ion-label>
                  </ion-item>
                }
              </ion-card-content>
            </ion-card>
          </ion-col>

        </ion-row>
      </ion-grid>
    </ion-content>
  `,
})
export class AocTagComponent {
  protected readonly aocTagStore = inject(AocTagStore);
  private readonly actionSheetController = inject(ActionSheetController);

  protected readonly isLoading = computed(() => this.aocTagStore.isLoading());
  protected readonly searchTerm = computed(() => this.aocTagStore.searchTerm());
  protected readonly filteredTags = computed(() => this.aocTagStore.filteredTags());
  protected readonly selectedTag = computed(() => this.aocTagStore.selectedTag());
  protected readonly selectedTagKey = computed(() => this.aocTagStore.selectedTagKey());
  protected readonly tagStrings = computed(() => this.aocTagStore.tagStrings());

  protected tagCount(tag: TagItem): string {
    if (!tag.tags) return '0';
    const count = tag.tags.split(',').filter(Boolean).length;
    return String(count);
  }

  protected onSearch(event: Event): void {
    const value = (event as CustomEvent).detail.value ?? '';
    this.aocTagStore.setSearchTerm(value);
  }

  protected createTagDocument(): void {
    this.aocTagStore.createTagDocument();
  }

  protected async addTagString(tag: TagItem): Promise<void> {
    await this.aocTagStore.addTagString(tag);
  }

  protected async showTagActions(tag: TagItem): Promise<void> {
    const base = this.aocTagStore.appStore.env.services.imgixBaseUrl;
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('tag.edit', base, 'edit'));
    options.buttons.push(createActionSheetButton('tag.delete', base,'trash'));
    options.buttons.push(createActionSheetButton('cancel', base,'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'tag.edit':
        this.aocTagStore.selectTag(tag);
        break;
      case 'tag.delete':
        await this.aocTagStore.archiveTagDocument(tag);
        break;
    }
  }

  protected async showTagStringActions(tag: TagItem, tagStr: string): Promise<void> {
    const base = this.aocTagStore.appStore.env.services.imgixBaseUrl;
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('tag.string.edit', base, 'edit'));
    options.buttons.push(createActionSheetButton('tag.string.remove', base, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'tag.string.edit':
        await this.aocTagStore.editTagString(tag, tagStr);
        break;
      case 'tag.string.remove':
        await this.aocTagStore.removeTagString(tag, tagStr);
        break;
    }
  }
}
