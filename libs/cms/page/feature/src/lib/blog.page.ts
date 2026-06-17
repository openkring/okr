import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ArticleSection, BlogLayoutType, ButtonSection, RoleName, SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, error } from '@bk2/shared-util-angular';
import { hasRole, replaceSubstring } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';
import { SectionStore } from '@bk2/cms-section-feature';

import { PageStore } from './page.store';
import { BlogMinimal } from './blog-minimal';
import { BlogGrid } from './blog-grid';
import { BlogClassic } from './blog-classic';
import { BlogMagazine } from './blog-magazine';
import { BlogBento } from './blog-bento';
import { BlogStream } from './blog-stream';

@Component({
  selector: 'bk-blog-page',
  standalone: true,
  imports: [
    SvgIconPipe,
    Menu,
    BlogMinimal, BlogGrid, BlogClassic, BlogMagazine, BlogBento, BlogStream,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonMenuButton, IonContent,
    IonItem, IonLabel, IonPopover
  ],
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; width: 100%; }

    @media print {
      @page { size: A4; margin: 15mm; }
      html, body, ion-app, ion-router-outlet { height: auto !important; overflow: visible !important; }
      ion-content {
        --offset-bottom: 0px !important; --overflow: visible !important;
        overflow: visible !important; contain: none !important;
      }
      .print-content {
        display: block !important; width: 210mm; min-height: 297mm;
        padding: 15mm; box-sizing: border-box;
        page-break-after: always; overflow: visible !important; position: relative !important;
      }
      .print-content > * { break-inside: avoid; page-break-inside: avoid; }
      ion-header, ion-footer, ion-toolbar, .print-btn, .no-print { display: none !important; }
    }
  `],
  template: `
    @if(showMenu()) {
      <ion-header>
        <ion-toolbar [color]="color()" id="bkheader">
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          <ion-title>{{ store.page()?.name }}</ion-title>
          @if (hasRole('contentAdmin')) {
            <ion-buttons slot="end">
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              @if (contextMenuName(); as contextMenuName) {
                <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
                  <ng-template>
                    <ion-content>
                      <bk-menu [menuName]="contextMenuName" />
                    </ion-content>
                  </ng-template>
                </ion-popover>
              }
            </ion-buttons>
          }
        </ion-toolbar>
      </ion-header>
    }

    <ion-content class="ion-no-padding">
      @if (isEmptyPage()) {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            {{ hasRole('contentAdmin') ? store.i18n.empty() : store.i18n.empty_readonly() }}
          </ion-label>
        </ion-item>
        @if (hasRole('contentAdmin')) {
          <ion-item lines="none">
            <ion-button (click)="addSection()">
              <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
              {{ store.i18n.add_label() }}
            </ion-button>
          </ion-item>
        }
      } @else {
        <div class="print-content" #printRoot>
          @switch (blogType()) {
            @case ('grid') {
              <bk-blog-grid [sections]="sections()" [currentUser]="store.currentUser()" [editMode]="editMode()" (sectionClick)="showActions($event)" />
            }
            @case ('classic') {
              <bk-blog-classic [sections]="sections()" [currentUser]="store.currentUser()" [editMode]="editMode()" (sectionClick)="showActions($event)" />
            }
            @case ('magazine') {
              <bk-blog-magazine [sections]="sections()" [currentUser]="store.currentUser()" [editMode]="editMode()" (sectionClick)="showActions($event)" />
            }
            @case ('bento') {
              <bk-blog-bento [sections]="sections()" [currentUser]="store.currentUser()" [editMode]="editMode()" (sectionClick)="showActions($event)" />
            }
            @case ('stream') {
              <bk-blog-stream [sections]="sections()" [currentUser]="store.currentUser()" [editMode]="editMode()" (sectionClick)="showActions($event)" />
            }
            @default {
              <bk-blog-minimal [sections]="sections()" [currentUser]="store.currentUser()" [editMode]="editMode()" (sectionClick)="showActions($event)" />
            }
          }
        </div>
      }
    </ion-content>
  `
})
export class BlogPage {
  protected store = inject(PageStore);
  private sectionStore = inject(SectionStore);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private actionSheetController = inject(ActionSheetController);
  private route = inject(ActivatedRoute);
  private ionContent = viewChild(IonContent);
  private printRoot = viewChild<ElementRef<HTMLElement>>('printRoot');
  private routeFragment = toSignal(this.route.fragment);

  public contextMenuName = input<string>();
  public color = input('secondary');
  public showMenu = input(true);

  protected tenantId = computed(() => this.store.tenantId());
  protected popupId = computed(() => 'c_blogpage_' + this.store.page()?.bkey);
  protected editMode = signal(false);
  protected sections = computed(() => this.store.pageSections().filter(s => s.state === 'published' || this.hasRole('contentAdmin')));
  protected isEmptyPage = computed(() => this.sections().length === 0);
  protected blogType = computed(() => (this.store.page()?.blogType ?? 'minimal') as BlogLayoutType);

  constructor() {
    effect(() => {
      const meta = this.store.meta();
      if (meta) this.meta.addTags(meta);
    });
    effect(() => {
      const title = this.store.page()?.title;
      if (title && title.length > 0) this.title.setTitle(title);
    });
    effect(() => {
      const fragment = this.routeFragment();
      const sections = this.sections();
      if (!fragment || sections.length === 0) return;
      setTimeout(async () => {
        const el = document.getElementById(fragment);
        const content = this.ionContent();
        if (!el || !content) return;
        const scrollEl = await content.getScrollElement();
        const filterBar = document.querySelector<HTMLElement>('.filter-bar');
        const stickyOffset = filterBar ? filterBar.offsetHeight + 70 : 0;
        const top = el.getBoundingClientRect().top + scrollEl.scrollTop - stickyOffset;
        content.scrollToPoint(0, top, 400);
      }, 100);
    });
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    switch ($event.detail.data) {
      case 'toggleEditMode':  this.editMode.update(v => !v); break;
      case 'editPage': {
        const page = this.store.page();
        if (page) await this.store.edit(page, false);
        break;
      }
      case 'sortSections':  await this.store.sortSections(); break;
      case 'selectSection': await this.store.selectSection(); break;
      case 'addSection':    await this.addSection(); break;
      case 'exportRaw':     await this.store.export('raw'); break;
      case 'print':         await this.store.print(this.printRoot()?.nativeElement, this.sections()); break;
      default: error(undefined, `BlogPage.onPopoverDismiss: unknown method ${$event.detail.data}`);
    }
  }

  protected async addSection(): Promise<void> {
    const sectionId = await this.sectionStore.add(false);
    if (sectionId) this.store.addSectionById(sectionId);
  }

  protected async showActions(sectionId: string): Promise<void> {
    if (!this.editMode()) return;
    const id = replaceSubstring(sectionId, '@TID@', this.tenantId());
    const section = this.sectionStore.sections()?.find(s => s.bkey === id);
    if (!section) return;
    this.sectionStore.setSectionId(id);

    const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    this.addActionSheetButtons(actionSheetOptions, section);
    await this.executeActions(actionSheetOptions, section);
  }

  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, section: SectionModel): void {
    if (hasRole('contentAdmin', this.store.appStore.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('section.edit', this.store.i18n.section_edit(), this.store.imgixBaseUrl(), 'edit'));
      if (section.type === 'article') {
        actionSheetOptions.buttons.push(createActionSheetButton('section.image.upload', this.store.i18n.upload_image(), this.store.imgixBaseUrl(), 'upload'));
        actionSheetOptions.buttons.push(createActionSheetButton('section.send', this.store.i18n.section_send(), this.store.imgixBaseUrl(), 'send'));
      }
      if (section.type === 'button') {
        actionSheetOptions.buttons.push(createActionSheetButton('section.file.upload', this.store.i18n.upload_file(), this.store.imgixBaseUrl(), 'upload'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('page.removesection', this.store.i18n.section_remove(), this.store.imgixBaseUrl(), 'trash'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.store.imgixBaseUrl(), 'cancel'));
    }
  }

  private async executeActions(actionSheetOptions: ActionSheetOptions, section: SectionModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'page.removesection': await this.store.removeSectionById(section.bkey); break;
        case 'section.edit':       await this.sectionStore.edit(this.sectionStore.section(), false); break;
        case 'section.send':       await this.sectionStore.send(section); break;
        case 'section.image.upload': await this.sectionStore.uploadImage(this.sectionStore.section() as ArticleSection); break;
        case 'section.file.upload':  await this.sectionStore.uploadFile(this.sectionStore.section() as ButtonSection); break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }
}
