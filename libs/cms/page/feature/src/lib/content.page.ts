import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonPopover, IonRow, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AccordionSection, ArticleSection, ButtonSection, RoleName, SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, error, getColSizes } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { Menu } from '@bk2/cms-menu-feature';
import { SectionDispatcher, SectionStore } from '@bk2/cms-section-feature';

import { PageStore } from './page.store';

@Component({
  selector: 'bk-content-page',
  standalone: true,
  imports: [
    SectionDispatcher, Menu,
    SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonMenuButton, IonContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonPopover
  ],
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
    }
  bk-section { width: 100%; display: block; }

  .section-wrapper.editable {
    border: 3px solid;
    border-radius: 8px;
    margin: 8px 0;
    padding: 4px;
    width: calc(100% - 16px);
    cursor: pointer;
  }

  .section-wrapper.state-draft {
    border-color: #3880ff; /* blue */
  }

  .section-wrapper.state-inReview {
    border-color: #ffc409; /* yellow */
  }

  .section-wrapper.state-published {
    border-color: #2dd36f; /* green */
  }

  .section-wrapper.state-cancelled,
  .section-wrapper.state-decommitted,
  .section-wrapper.state-archived {
    border-color: #eb445a; /* red */
  }

  ion-item.edit-mode {
    --padding-start: 0;
    --inner-padding-end: 0;
  }

@media (width <= 600px) {
    .section-item {
    --padding-start: 2px;
    --inner-padding-end: 2px;
  }
}

@media print {
  @page {
    size: A4;
    margin: 15mm;
  }

  /* FORCE FULL HEIGHT */
  html, body, ion-app, ion-router-outlet {
    height: auto !important;
    overflow: visible !important;
  }

  ion-content {
    --offset-bottom: 0px !important;
    --overflow: visible !important;
    overflow: visible !important;
    contain: none !important;
  }

  ion-grid, ion-row {
    height: 100%;
  }

  /* PRINT CONTAINER */
  .print-content {
    display: block !important;
    width: 210mm;
    min-height: 297mm;
    padding: 15mm;
    box-sizing: border-box;
    page-break-after: always;
    overflow: visible !important;
    position: relative !important;
  }

  /* ENSURE CHILDREN DON'T CLIP */
  .print-content > * {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* FORCE PAGE BREAKS */
  .page-break {
    page-break-before: always;
    height: 0;
  }

  /* HIDE UI */
  ion-header, ion-footer, ion-toolbar, .print-btn, .no-print {
    display: none !important;
  }
}
`],
  template: `
    @if(showMenu()) {
      <ion-header>
        <ion-toolbar [color]="color()" id="bkheader">
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          <ion-title>{{ store.page()?.name }}</ion-title>
          @if(isEditable()) {
            <ion-buttons slot="end">
              <ion-button id="{{ popupId() }}">
                <ion-icon slot="icon-only" src="{{'menu' | svgIcon }}" />
              </ion-button>
              @if(contextMenuName(); as contextMenuName) {
                <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true"  (ionPopoverDidDismiss)="onPopoverDismiss($event)" >
                  <ng-template>
                    <ion-content>
                      <bk-menu [menuName]="contextMenuName" [forceVisible]="groupAdmin()"/>
                    </ion-content>
                  </ng-template>
                </ion-popover>
              }
            </ion-buttons>
          }
        </ion-toolbar>
      </ion-header>
    }
    <ion-content class="ion-no-padding" #printRoot>
      @if(isEditable()) {
        @if(isEmptyPage()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ store.i18n.empty() }}</ion-label>
          </ion-item>
          <ion-item lines="none">
            <ion-button (click)="this.addSection()">
              <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
              {{ store.i18n.add_section() }}
            </ion-button>
          </ion-item>
        } @else {     <!-- page contains sections -->
          <ion-grid>
            <ion-row>
              @for(section of visibleSections(); track section.bkey) {
                @if(getColSizes(section.colSize); as colSizes) {
                  <ion-col size="{{colSizes.size}}" 
                    class="section-item" (click)="showActions(section)"
                    [class.edit-mode]="editMode()"
                    [attr.size-md]="colSizes.sizeMd" [attr.size-lg]="colSizes.sizeLg"
                  >
                    @if(editMode()) {
                      <div class="section-wrapper editable state-{{ section.state }}">
                        <bk-section-dispatcher [section]="section" [currentUser]="store.currentUser()" [editMode]="editMode()" />
                      </div>  
                    } @else {
                      <bk-section-dispatcher [section]="section" [currentUser]="store.currentUser()" [editMode]="editMode()" />
                    }
                  </ion-col>
                }
              }
            </ion-row>
          </ion-grid>
        }
      } @else { <!-- not contentAdmin; also: not logged-in for public content -->
        @if(isEmptyPage()) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ store.i18n.empty_readonly() }}</ion-label>
          </ion-item>
        } @else {
          <div class="print-content" #printContent>
            @for(section of visibleSections(); track section.bkey) {
              <div [id]="section.bkey">
                <bk-section-dispatcher [section]="section" [currentUser]="store.currentUser()" [editMode]="editMode()" />
              </div>
            }
          </div>
        }
      }
    </ion-content>
  `
})
export class ContentPage {
  protected store = inject(PageStore);
  private sectionStore = inject(SectionStore);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private actionSheetController = inject(ActionSheetController);
  private route = inject(ActivatedRoute);
  private ionContent = viewChild(IonContent);
  private printRoot = viewChild<ElementRef<HTMLElement>>('printRoot');
  private routeFragment = toSignal(this.route.fragment);

  // inputs
  public contextMenuName = input<string>();
  public color = input('secondary');
  public showMenu = input(true);
  public groupAdmin = input(false);

  protected isEditable = computed(() => this.hasRole('contentAdmin') || this.groupAdmin());

  // derived signals
  protected tenantId = computed(() => this.store.tenantId());
  protected showDebugInfo = computed(() => this.store.showDebugInfo());
  protected popupId = computed(() => 'c_contentpage_' + this.store.page()?.bkey);
  protected editMode = signal(false);
  protected page = computed(() => this.store.page());
  protected sections = computed(() => this.store.pageSections());
  protected isEmptyPage = computed(() => this.sections().length === 0);

  /**
   * Get all nested section IDs from accordion sections.
   * These sections are rendered inside accordions via content projection,
   * so they should be excluded from the top-level section list.
   */
  private nestedSectionIds = computed(() => {
    const nestedIds = new Set<string>();
    this.sections()
      .filter(s => s.type === 'accordion')
      .forEach(section => {
        const accordion = section as AccordionSection;
        accordion.properties.items.forEach(item => {
          if (item.key) nestedIds.add(item.key);
        });
      });
    return nestedIds;
  });

  /**
   * Get only top-level sections (exclude nested accordion sections).
   * Nested sections are rendered inside their parent accordions via content projection,
   * so they shouldn't appear at the top level to avoid duplication.
   * 
   * For regular users, only show published sections.
   * For contentAdmin users, show all sections regardless of state.
   */
  protected visibleSections = computed(() => {
    const nested = this.nestedSectionIds();
    
    return this.sections().filter(s => {
      // Exclude nested sections
      if (nested.has(s.bkey)) return false;
      
      // ContentAdmin and group admins see all sections
      if (this.isEditable()) return true;
      
      // Regular users only see published sections
      return s.state === 'published';
    });
  });

  constructor() {
    effect(() => {
      const meta = this.store.meta();
      if (meta) {
        this.meta.addTags(meta);
      }
    });
    effect(() => {
      const title = this.store.page()?.title;
      if (title && title.length > 0) {
        this.title.setTitle(title);
      }
    });
    effect(() => {
      const fragment = this.routeFragment();
      const sections = this.visibleSections();
      if (!fragment || sections.length === 0) return;
      setTimeout(async () => {
        const el = document.getElementById(fragment);
        const content = this.ionContent();
        if (!el || !content) return;
        const scrollEl = await content.getScrollElement();
        const top = el.getBoundingClientRect().top + scrollEl.scrollTop;
        content.scrollToPoint(0, top, 400);
      }, 100);
    });
  }

  /******************************* actions *************************************** */
  protected toggleEditMode(): void {
    this.editMode.update(value => !value);
  }

  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    switch(selectedMethod) {
      case 'toggleEditMode':  this.toggleEditMode(); break;
      case 'editPage': 
        const page = this.store.page();
        if (page) {
          await this.store.edit(page, false);
        }
        break;
      case 'sortSections':  await this.store.sortSections(); break;
      case 'selectSection': await this.store.selectSection(); break;
      case 'addSection':    await this.addSection(); break;
      case 'exportRaw': await this.store.export("raw"); break;
      case 'print': await this.store.print(this.printRoot()?.nativeElement, this.visibleSections()); break;
      default: error(undefined, `ContentPage.onPopoverDismiss: unknown method ${selectedMethod}`);
    }
  }

  protected async addSection(): Promise<void> {
    const sectionId = await this.sectionStore.add(false);
    if (sectionId) {
      this.store.addSectionById(sectionId);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a Page. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param sectionId 
   */
  protected async showActions(section: SectionModel): Promise<void> {
    if (this.editMode()) {
      const actionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
      this.addActionSheetButtons(actionSheetOptions, section.type);
      await this.executeActions(actionSheetOptions, section);
    }
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions, sectionType: string): void {
    if (this.isEditable()) {
      actionSheetOptions.buttons.push(createActionSheetButton('section.edit', this.store.i18n.section_edit(), this.store.imgixBaseUrl(), 'edit'));
      if (sectionType === 'article') {
        actionSheetOptions.buttons.push(createActionSheetButton('section.image.upload', this.store.i18n.upload_image(), this.store.imgixBaseUrl(), 'upload'));
        actionSheetOptions.buttons.push(createActionSheetButton('section.send', this.store.i18n.section_send(), this.store.imgixBaseUrl(), 'send'));
      }
      if (sectionType === 'button') {
        actionSheetOptions.buttons.push(createActionSheetButton('section.file.upload', this.store.i18n.upload_file(), this.store.imgixBaseUrl(), 'upload'));
      }
      actionSheetOptions.buttons.push(createActionSheetButton('page.removesection', this.store.i18n.section_remove(), this.store.imgixBaseUrl(), 'trash'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.store.imgixBaseUrl(), 'cancel'));
    }
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param sectionId 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, section: SectionModel): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'page.removesection':    await this.store.removeSectionById(section.bkey);             break;
        case 'section.edit':          await this.sectionStore.edit(section, false);                     break;
        case 'section.send':          await this.sectionStore.send(section);                            break;
        case 'section.image.upload':  await this.sectionStore.uploadImage(section as ArticleSection);   break;
        case 'section.file.upload':   await this.sectionStore.uploadFile(section as ButtonSection);     break;
      }
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.store.currentUser());
  }

  /**
   * Get nested sections for a given section (only relevant for accordion sections).
   * Returns an array of SectionModel objects that should be rendered inside accordion items.
   * Note: Uses item.key as the section reference (sectionId is optional and may not be populated).
   * 
   * For regular users, only show published sections.
   * For contentAdmin users, show all sections regardless of state.
   */
  protected getNestedSections(section: SectionModel): SectionModel[] {
    if (section.type !== 'accordion') return [];
    const accordion = section as AccordionSection;
    const sectionIds = accordion.properties.items
      .map(item => item.key)
      .filter(id => id !== undefined) as string[];
    
    const nestedSections = this.store.pageSections().filter(s => sectionIds.includes(s.bkey));
    
    // ContentAdmin and group admins see all nested sections
    if (this.isEditable()) return nestedSections;
    
    // Regular users only see published nested sections
    return nestedSections.filter(s => s.state === 'published');
  }

  /**
   * Get accordion items from an accordion section.
   * Each item contains a sectionId that references a section to be rendered inside that accordion item.
   */
  protected getAccordionItems(section: SectionModel) {
    if (section.type !== 'accordion') return [];
    return (section as AccordionSection).properties.items;
  }

  /**
   * Parses a col size config string (e.g. "6,4,3") and returns an object for attribute binding.
   * { size: 6, sizeMd: 4, sizeLg: 3 }
   */
  protected getColSizes(colSizeConfig: string): { size?: number, sizeMd?: number, sizeLg?: number } {
    return getColSizes(colSizeConfig);
  }
}