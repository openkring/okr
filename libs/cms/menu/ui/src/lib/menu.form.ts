import { Component, ComponentRef, computed, DestroyRef, effect, inject, input, model, output, signal, untracked, viewChild, ViewContainerRef } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular';

import { DEFAULT_MENU_ACTION, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ROLE, DEFAULT_SUBMENU_OFFSET, DEFAULT_TAGS, DEFAULT_URL, DESCRIPTION_LENGTH, LONG_NAME_LENGTH, MAX_STATIC_BULLET_SIZE, MAX_SUBMENU_OFFSET, MIN_STATIC_BULLET_SIZE, NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { BaseProperty, CategoryListModel, MenuItemModel, RoleName, StaticMenuConfig, UserModel } from '@okr/shared-models';
import { CategorySelect, Chips, ErrorNote, Color, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringList, StringSelect, StringSelectI18n, TextInput, TextInputI18n, UrlInput, UrlInputI18n, IconInput } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { MenuI18n, menuItemValidations, normalizeMenuInfo, resolveStaticMenu, STATIC_MENU_COLORS, staticBulletColorCss } from '@okr/cms-menu-util';
import type { OkrEditor } from '@okr/shared-ui-editor';

@Component({
  selector: 'okr-menu-item-form',
  standalone: true,
  imports: [
    TextInput, UrlInput, CategorySelect, Chips, NotesInput, NumberInput, StringList, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel,
    IconInput, StringSelect, Color
],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .static-preview { display: flex; flex-direction: column; gap: 8px; padding: 0 16px 8px; }
    .strip { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; padding: 12px 16px; border: 1px solid #ccc; border-radius: 4px; background: #fff; color: #222; }
    .strip.dark { background: #222; color: #fff; border-color: #222; }
    .entry { display: inline-flex; align-items: center; gap: 8px; }
    .entry.bold { font-weight: 700; }
    .entry.underline { text-decoration: underline; }
    .bullet { display: inline-block; flex: none; }
    .bullet.round { border-radius: 50%; }
    .bullet.none { display: none; }
  `],
  template: `
  @if (showForm()) {
    <!-- ngx-editor's toolbar buttons carry no type="button", so Enter in any input (e.g. «Untermenü
         hinzufügen») natively submits this form and reloads the page. Saving runs via change-confirmation. -->
    <form novalidate (submit)="$event.preventDefault()">

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [autofocus]="true" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" [showHelper]=true />
                <okr-error-note [errors]="nameErrors()" />
              </ion-col>

              <ion-col size="12" size-md="6">
                <okr-cat-select [category]="types()!" [selectedItemName]="menuAction()" (selectedItemNameChange)="onFieldChange('action', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="actionErrors()" />
              </ion-col>
            </ion-row>

            @if(menuAction() === 'navigate' || menuAction() === 'browse' || menuAction() === 'call' || menuAction() === 'toggle' || menuAction() === 'workflow') {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-icon-input [i18n]="iconI18n()" [icon]="icon()" (iconChange)="onFieldChange('icon', $event)" (selectClicked)="iconSelectClicked.emit('icon')" [readOnly]="isReadOnly()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [showHelper]=true [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="labelErrors()" />
                </ion-col>

                <!-- toggle: alternate icon/label shown while the toggled state is active -->
                @if(menuAction() === 'toggle') {
                  <ion-col size="12" size-md="6">
                    <okr-icon-input [i18n]="iconAltI18n()" [icon]="iconAlt()" (iconChange)="onFieldChange('iconAlt', $event)" (selectClicked)="iconSelectClicked.emit('iconAlt')" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="labelAltI18n()" [value]="labelAlt()" (valueChange)="onFieldChange('labelAlt', $event)" [showHelper]=true [readOnly]="isReadOnly()" />
                  </ion-col>
                }

                <ion-col size="12">
                  <okr-url [i18n]="urlI18n()"
                    [value]="url()" (valueChange)="onFieldChange('url', $event)"
                    [readOnly]="isReadOnly()"
                  [maxLength]="longNameLength" />
                  <okr-error-note [errors]="urlErrors()" />
                </ion-col>

                <!-- optional: shown via an info-circle on the right of the menu row -->
                <ion-col size="12">
                  <ion-item lines="none" class="info-label">
                    <ion-label>{{ i18n().info_label() }}<p>{{ i18n().info_helper() }}</p></ion-label>
                  </ion-item>
                  <div #infoEditorHost></div>
                  <okr-error-note [errors]="infoErrors()" />
                </ion-col>
              </ion-row>
            }

            @if(menuAction() === 'sub') {
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [showHelper]=true [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="labelErrors()" />
                </ion-col>

                <!-- optional: shown via an info-circle on the right of the sub-menu header -->
                <ion-col size="12">
                  <ion-item lines="none" class="info-label">
                    <ion-label>{{ i18n().info_label() }}<p>{{ i18n().info_helper() }}</p></ion-label>
                  </ion-item>
                  <div #infoEditorHost></div>
                  <okr-error-note [errors]="infoErrors()" />
                </ion-col>
              </ion-row>
            }

            <!-- main menu only: layout, and the indent of its submenu rows -->
            @if(menuAction() === 'main') {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="menuTypes()" [selectedItemName]="menuType()" (selectedItemNameChange)="onFieldChange('menuType', $event)" [withAll]="false" [fieldStyle]="true" [label]="i18n().menu_type_label()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="menuTypeErrors()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="submenuOffsetI18n()" [value]="submenuOffset()" (valueChange)="onFieldChange('submenuOffset', $event)" [integer]="true" [min]="0" [max]="submenuOffsetMax" [clearInput]="false" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="submenuOffsetErrors()" />
                </ion-col>
              </ion-row>
            }

            @if(menuAction() === 'main' && menuType() === 'static') {
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none"><ion-label><strong>{{ i18n().static_group() }}</strong></ion-label></ion-item>
                </ion-col>

                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="bulletColorI18n()" [stringList]="bulletColorChoices" [labels]="bulletColorLabels()" [selectedString]="bulletColorChoice()" (selectedStringChange)="onBulletColorChoice($event)" [readOnly]="isReadOnly()" [showHelper]="false" />
                  @if(bulletColorChoice() === 'custom') {
                    <okr-color [label]="i18n().static_bullet_color_custom()" [hexColor]="staticMenu().bulletColor" (hexColorChange)="onStaticChange('bulletColor', $event)" [readOnly]="isReadOnly()" />
                  }
                  <okr-error-note [errors]="staticBulletColorErrors()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="bulletShapeI18n()" [stringList]="bulletShapes" [labels]="bulletShapeLabels()" [selectedString]="staticMenu().bulletShape" (selectedStringChange)="onStaticChange('bulletShape', $event)" [readOnly]="isReadOnly()" [showHelper]="false" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="bulletSizeI18n()" [value]="staticMenu().bulletSize" (valueChange)="onStaticChange('bulletSize', $event)" [integer]="true" [min]="bulletSizeMin" [max]="bulletSizeMax" [clearInput]="false" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="staticBulletSizeErrors()" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="activeStyleI18n()" [stringList]="activeStyles" [labels]="activeStyleLabels()" [selectedString]="staticMenu().activeStyle" (selectedStringChange)="onStaticChange('activeStyle', $event)" [readOnly]="isReadOnly()" [showHelper]="false" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="childrenVisibilityI18n()" [stringList]="childrenVisibilities" [labels]="childrenVisibilityLabels()" [selectedString]="staticMenu().childrenVisibility" (selectedStringChange)="onStaticChange('childrenVisibility', $event)" [readOnly]="isReadOnly()" [showHelper]="false" />
                </ion-col>

                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="childrenDirectionI18n()" [stringList]="childrenDirections" [labels]="childrenDirectionLabels()" [selectedString]="staticMenu().childrenDirection" (selectedStringChange)="onStaticChange('childrenDirection', $event)" [readOnly]="isReadOnly()" [showHelper]="false" />
                </ion-col>

                <!-- preview: one bullet, a page and the active page, on a light and a dark strip -->
                <ion-col size="12">
                  <ion-item lines="none"><ion-label>{{ i18n().static_preview_label() }}</ion-label></ion-item>
                  <div class="static-preview">
                    @for(strip of ['light', 'dark']; track strip) {
                      <div class="strip" [class.dark]="strip === 'dark'">
                        <span class="entry"><span class="bullet" [class]="'bullet ' + staticMenu().bulletShape" [style.background]="bulletCss()" [style.width.px]="staticMenu().bulletSize" [style.height.px]="staticMenu().bulletSize"></span>{{ i18n().static_preview_page() }}</span>
                        <span class="entry active" [class.bold]="staticMenu().activeStyle === 'bold'" [class.underline]="staticMenu().activeStyle === 'underline'" [style.color]="staticMenu().activeStyle === 'color' ? bulletCss() : null"><span class="bullet" [class]="'bullet ' + staticMenu().bulletShape" [style.background]="bulletCss()" [style.width.px]="staticMenu().bulletSize" [style.height.px]="staticMenu().bulletSize"></span>{{ i18n().static_preview_active() }}</span>
                      </div>
                    }
                  </div>
                </ion-col>
              </ion-row>
            }

            @if(menuAction() !== 'main') {
              <ion-row>
                <ion-col size="12">
                  <okr-cat-select [category]="roles()!" [selectedItemName]="roleNeeded()" (selectedItemNameChange)="onFieldChange('roleNeeded', $event)" [withAll]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="roleNeededErrors()" />
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

<!--
      currently not needed
      @if(menuAction() === 'navigate' || menuAction() === 'browse' || menuAction() === 'call') {
        <okr-property-list [properties]="data()" (propertiesChange)="onFieldChange('data', $event)" />
      } -->

      <!-- sub-/context-menus -->
      @if(menuAction() === 'main' || menuAction() === 'context' || menuAction() === 'sub') {
        <okr-strings
          [strings]="menuItems()" (stringsChange)="onFieldChange('menuItems', $event)"
          [title]="i18n().submenus()"
          [add]="i18n().add_submenu()"
          [readOnly]="isReadOnly()"
        />
        <okr-error-note [errors]="menuItemsErrors()" />
      }

      @if(hasRole('contentAdmin')) {
        <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('contentAdmin')) {
        <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="descriptionErrors()" />
      }
    </form>
  }
`
})
export class MenuForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly longNameLength = LONG_NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  // inputs
  public readonly formData = model.required<MenuItemModel>();
  public readonly types = input.required<CategoryListModel>();
  public readonly roles = input.required<CategoryListModel>();
  /** the layouts a main menu can have (category `menu_type`) */
  public readonly menuTypes = input.required<CategoryListModel>();
  /**
   * `name` -> `action` of the menu documents the children can be. The suite cannot look the
   * documents up, so it reads this to refuse a `sub` child in a segmented menu.
   */
  public readonly childActions = input<Record<string, string>>({});
  /**
   * `name` -> `menuItems` of the menu documents the children can be. The static menu reads this to
   * look one level below a child (a submenu's own children), which the root's names cannot show.
   */
  public readonly childMenus = input<Record<string, string[]>>({});
  public readonly currentUser = input.required<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // i18n
  public readonly i18n = input.required<MenuI18n>();

  protected nameI18n = computed(() => ({
    name: 'name', label: this.i18n().name_label(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected labelI18n = computed(() => ({
    name: 'label', label: this.i18n().label_label(), placeholder: this.i18n().label_placeholder(), helper: this.i18n().label_helper()
  } as TextInputI18n));

  protected iconI18n = computed(() => ({
    name: 'icon', label: this.i18n().icon_label(), placeholder: this.i18n().icon_placeholder(), helper: this.i18n().icon_helper()
  } as TextInputI18n));

  protected submenuOffsetI18n = computed(() => ({
    name: 'submenuOffset', label: this.i18n().submenu_offset_label(), placeholder: this.i18n().submenu_offset_placeholder(), helper: this.i18n().submenu_offset_helper()
  } as NumberInputI18n));

  protected iconAltI18n = computed(() => ({
    name: 'iconAlt', label: this.i18n().icon_alt_label(), placeholder: this.i18n().icon_alt_placeholder(), helper: this.i18n().icon_alt_helper()
  } as TextInputI18n));

  protected labelAltI18n = computed(() => ({
    name: 'labelAlt', label: this.i18n().label_alt_label(), placeholder: this.i18n().label_alt_placeholder(), helper: this.i18n().label_alt_helper()
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description', label: this.i18n().description_label(), placeholder: this.i18n().description_placeholder()
  } as NotesInputI18n));

  protected urlI18n = computed(() => ({
    name: 'url',
    label: this.i18n().url_label(),
    placeholder: this.i18n().url_placeholder(),
    helper: this.i18n().url_helper(),
  } as UrlInputI18n));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public iconSelectClicked = output<'icon' | 'iconAlt'>();

  // The suite needs tenants and tags, which validateVestTree does not pass — so the bridge
  // calls it through a closure that adds them.
  private readonly suiteWithContext = (model: MenuItemModel) =>
    menuItemValidations(model, this.tenantId(), this.allTags(), this.childActions(), this.childMenus());
  protected readonly menuForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  // per-field errors for the notes under each field
  private readonly validationResult = vestErrors(this.menuForm);
  protected actionErrors = computed(() => this.validationResult().getErrors('action'));
  protected roleNeededErrors = computed(() => this.validationResult().getErrors('roleNeeded'));
  protected descriptionErrors = computed(() => this.validationResult().getErrors('description'));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected iconErrors = computed(() => this.validationResult().getErrors('icon'));
  protected labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected urlErrors = computed(() => this.validationResult().getErrors('url'));
  protected infoErrors = computed(() => this.validationResult().getErrors('info'));
  protected menuTypeErrors = computed(() => this.validationResult().getErrors('menuType'));
  protected submenuOffsetErrors = computed(() => this.validationResult().getErrors('submenuOffset'));
  protected menuItemsErrors = computed(() => this.validationResult().getErrors('menuItems'));
  // The suite keys these by their dotted path; vestErrors() regroups by that very key whether the
  // bridge found a FieldTree node or parked the error on the root, so the notes read the dotted key.
  protected staticBulletColorErrors = computed(() => this.validationResult().getErrors('staticMenu.bulletColor'));
  protected staticBulletSizeErrors = computed(() => this.validationResult().getErrors('staticMenu.bulletSize'));

  // Lazy: a static import of @okr/shared-ui-editor drags ngx-editor/ProseMirror into the dashboard's
  // eager bundle (this form is reachable from the menu) — same pattern as editor-configuration.ts.
  // The host sits in the 'navigate…' or the 'sub' block; only one exists at a time.
  private readonly destroyRef = inject(DestroyRef);
  private readonly infoEditorHost = viewChild('infoEditorHost', { read: ViewContainerRef });
  protected readonly infoEditorRef = signal<ComponentRef<OkrEditor> | undefined>(undefined);
  /** Guards against a second mount while the chunk is still in flight. */
  private creatingInfoEditor = false;

  constructor() {
    effect(() => this.valid.emit(this.menuForm().valid()));
    // Pattern A (lazy-loading skill): synchronous effect body, async work started inside it.
    effect(() => {
      const host = this.infoEditorHost();
      // Switching between the two blocks destroys the host (and the editor in it) — drop the stale
      // ref so the next host gets a fresh editor instead of staying empty.
      if (!host) {
        if (untracked(() => this.infoEditorRef())) this.infoEditorRef.set(undefined);
        return;
      }
      if (untracked(() => this.infoEditorRef()) || this.creatingInfoEditor) return;
      this.creatingInfoEditor = true;
      void (async () => {
        try {
          const { OkrEditor } = await import('@okr/shared-ui-editor');
          const componentRef = host.createComponent(OkrEditor);
          // required inputs before its first check; the effect below keeps them in step
          componentRef.setInput('content', untracked(() => this.info()));
          componentRef.setInput('readOnly', untracked(() => this.isReadOnly()));
          componentRef.setInput('copyable', false);
          componentRef.setInput('buttonCopyI18n', {});
          // `content` is a model() — it doubles as the OkrEditor -> here change channel.
          componentRef.instance.content.subscribe((html: string) => this.onInfoChange(html));
          this.infoEditorRef.set(componentRef);
        } finally {
          this.creatingInfoEditor = false;
        }
      })();
    });
    effect(() => {
      const componentRef = this.infoEditorRef();
      const info = this.info();
      const readOnly = this.isReadOnly();
      if (!componentRef) return;
      componentRef.setInput('content', info);
      componentRef.setInput('readOnly', readOnly);
    });
    this.destroyRef.onDestroy(() => this.infoEditorRef()?.destroy());
  }

  // fields
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected icon = computed(() => this.formData().icon ?? '');
  protected iconAlt = computed(() => this.formData().iconAlt ?? '');
  protected label = computed(() => this.formData().label ?? '');
  protected labelAlt = computed(() => this.formData().labelAlt ?? '');
  protected info = computed(() => this.formData().info ?? '');
  protected url = computed(() => this.formData().url ?? DEFAULT_URL);
  protected data = computed(() => this.formData().data ?? []);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected description = computed(() => this.formData().description ?? DEFAULT_NOTES);
  protected roleNeeded = computed(() => this.formData().roleNeeded ?? DEFAULT_ROLE);
  protected menuAction = computed(() => this.formData().action ?? DEFAULT_MENU_ACTION);
  protected menuItems = computed(() => this.formData().menuItems ?? []);
  // Firestore reads skip model defaults, so both are absent on every existing main menu
  protected menuType = computed(() => this.formData().menuType ?? 'left');
  protected submenuOffset = computed(() => this.formData().submenuOffset ?? DEFAULT_SUBMENU_OFFSET);

  // static menu: the stored look with every field filled (an absent config shows the defaults)
  protected readonly staticMenu = computed(() => resolveStaticMenu(this.formData()));
  protected readonly bulletCss = computed(() => staticBulletColorCss(this.staticMenu().bulletColor));
  /** the colour select offers the Ionic names and «custom»; a stored hex shows as «custom» */
  protected readonly bulletColorChoice = computed(() => {
    const color = this.staticMenu().bulletColor;
    return STATIC_MENU_COLORS.includes(color) ? color : 'custom';
  });
  protected readonly bulletColorChoices: string[] = [...STATIC_MENU_COLORS, 'custom'];
  protected readonly bulletShapes = ['square', 'round', 'none'];
  protected readonly activeStyles = ['bold', 'color', 'underline'];
  protected readonly childrenVisibilities = ['always', 'active'];
  protected readonly childrenDirections = ['horizontal', 'vertical'];
  protected readonly bulletSizeMin = MIN_STATIC_BULLET_SIZE;
  protected readonly bulletSizeMax = MAX_STATIC_BULLET_SIZE;

  protected readonly bulletColorLabels = computed(() => {
    const i = this.i18n();
    return [i.static_color_primary(), i.static_color_secondary(), i.static_color_tertiary(), i.static_color_success(), i.static_color_warning(),
      i.static_color_danger(), i.static_color_light(), i.static_color_medium(), i.static_color_dark(), i.static_bullet_color_custom()];
  });
  protected readonly bulletShapeLabels = computed(() => [this.i18n().static_bullet_shape_square(), this.i18n().static_bullet_shape_round(), this.i18n().static_bullet_shape_none()]);
  protected readonly activeStyleLabels = computed(() => [this.i18n().static_active_style_bold(), this.i18n().static_active_style_color(), this.i18n().static_active_style_underline()]);
  protected readonly childrenVisibilityLabels = computed(() => [this.i18n().static_children_visibility_always(), this.i18n().static_children_visibility_active()]);
  protected readonly childrenDirectionLabels = computed(() => [this.i18n().static_children_direction_horizontal(), this.i18n().static_children_direction_vertical()]);

  protected readonly bulletColorI18n = computed(() => ({ name: 'staticBulletColor', label: this.i18n().static_bullet_color_label() } as StringSelectI18n));
  protected readonly bulletShapeI18n = computed(() => ({ name: 'staticBulletShape', label: this.i18n().static_bullet_shape_label() } as StringSelectI18n));
  protected readonly activeStyleI18n = computed(() => ({ name: 'staticActiveStyle', label: this.i18n().static_active_style_label() } as StringSelectI18n));
  protected readonly childrenVisibilityI18n = computed(() => ({ name: 'staticChildrenVisibility', label: this.i18n().static_children_visibility_label() } as StringSelectI18n));
  protected readonly childrenDirectionI18n = computed(() => ({ name: 'staticChildrenDirection', label: this.i18n().static_children_direction_label() } as StringSelectI18n));
  protected readonly bulletSizeI18n = computed(() => ({
    name: 'staticBulletSize', label: this.i18n().static_bullet_size_label(), placeholder: this.i18n().static_bullet_size_placeholder(), helper: this.i18n().static_bullet_size_helper()
  } as NumberInputI18n));

  // passing constants to template
  /** kept in step with the upper bound the Vest suite enforces on submenuOffset */
  protected readonly submenuOffsetMax = MAX_SUBMENU_OFFSET;
  protected nameLength = NAME_LENGTH;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | BaseProperty[] | StaticMenuConfig): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** Writes one field of the static config; the rest of the stored config stays as it is. */
  protected onStaticChange(field: keyof StaticMenuConfig, value: string | number): void {
    const current = this.formData().staticMenu ?? {};
    if (current[field] === value) return;
    this.onFieldChange('staticMenu', { ...current, [field]: value } as StaticMenuConfig);
  }

  /** A name is stored as it is; «custom» keeps a stored hex, or seeds a valid one so the value never goes stale. */
  protected onBulletColorChoice(choice: string): void {
    if (choice === this.bulletColorChoice()) return;
    this.onStaticChange('bulletColor', choice === 'custom' ? '#000000' : choice);
  }

  /**
   * The editor normalises its content on load ('' → '<p></p>') and reports that as a change;
   * only a real edit may mark the form dirty, or the save bar would show on every open.
   */
  protected onInfoChange(html: string): void {
    if (normalizeMenuInfo(html) === normalizeMenuInfo(this.info())) return;
    this.onFieldChange('info', html);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
