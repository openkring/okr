import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular';

import { combineLatest, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { UploadService } from '@okr/avatar-data-access';
import { MenuService } from '@okr/cms-menu-data-access';
import { expandMenuTokens, resolveMenuLabelKey } from '@okr/cms-menu-util';
import { PageService } from '@okr/cms-page-data-access';
import { LocationService } from '@okr/location-data-access';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { DateFormat, getCountryName, getTodayStr, resolveMimeType } from '@okr/shared-util-core';
import { SettingsCards, SettingsEditModal } from '@okr/tenant-ui';
import {
  FEATURE_BLOCKS, SETTINGS_I18N_KEYS, SETTINGS_IMAGE_MIMETYPES, TENANT_FORM_GROUPS, settingsCards, settingsImageExtension, settingsImagePath, settingsImageTooBig,
  settingsPageName, settingsPageOptions, startOptions, startTargets,
} from '@okr/tenant-util';
import type { SettingsChoice, SettingsDisplayContext, SettingsGroupId, TenantSettings } from '@okr/tenant-util';

import { FeatureStore } from './feature.store';
import { TenantSettingsStore } from './tenant-settings.store';

/**
 * Settings that have their own editor elsewhere: linked here, not rebuilt. Shown while every named block is on. Without
 * a url the row only says where the editor is.
 */
const OTHER_EDITORS: readonly { id: string; url?: string; icon: string; blocks: readonly string[] }[] = [
  // the cookie notice is an operation of the AOC area «Zugang & Datenschutz»
  { id: 'cookie', url: '/aoc/access', icon: 'shield', blocks: ['aoc', 'consent'] },
  // the context menu of the task list, entry «Einstellungen»
  { id: 'task_archive', url: '/task/all/c-tasks', icon: 'todo', blocks: ['task'] },
  { id: 'file_transfer', url: '/private/file-transfer-monitor', icon: 'send', blocks: ['file-transfer'] },
  // «Als Vorgabe speichern» in the communication dialog of the person list; there is no screen of its own
  { id: 'post', icon: 'mail', blocks: ['subject'] },
  // the feature picker, segment «Menüzeilen»; it belongs to no block
  { id: 'menu_rows', url: '/tenant/features', icon: 'menu', blocks: [] },
];

/** The cards of `/tenant/settings`: one per settings group, and one with links to the other editors. */
@Component({
  selector: 'okr-tenant-settings-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SettingsCards, Spinner, SvgIconPipe,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonIcon, IonItem, IonLabel, IonList,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    ion-card-header { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; }
  `],
  template: `
    @if (store.isLoaded()) {
      <okr-settings-cards [cards]="cards()" [i18n]="i18n" (edit)="onEdit($event)">
        <ion-col size="12" size-md="6">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ text('more_title') }}</ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-list lines="none">
                @for (link of links(); track link.id) {
                  <ion-item [button]="!!link.url" [detail]="!!link.url" (click)="onNavigate(link.url)">
                    <ion-icon slot="start" src="{{ link.icon | svgIcon }}" aria-hidden="true" />
                    <ion-label class="ion-text-wrap">
                      <h3>{{ link.label }}</h3>
                      <p>{{ link.helper }}</p>
                    </ion-label>
                  </ion-item>
                }
              </ion-list>
            </ion-card-content>
          </ion-card>
        </ion-col>
      </okr-settings-cards>
    } @else if (isMissing()) {
      <ion-item lines="none">
        <ion-label class="ion-text-wrap">{{ text('missing') }}</ion-label>
      </ion-item>
    } @else {
      <okr-spinner />
    }
  `,
})
export class TenantSettingsContent {
  protected readonly store = inject(TenantSettingsStore);
  private readonly appStore = inject(AppStore);
  private readonly featureStore = inject(FeatureStore);
  private readonly i18nService = inject(I18nService);
  private readonly pageService = inject(PageService);
  private readonly locationService = inject(LocationService);
  private readonly menuService = inject(MenuService);
  private readonly modalController = inject(ModalController);
  private readonly modelSelect = inject(ModelSelectService);
  private readonly router = inject(Router);
  private readonly uploadService = inject(UploadService);
  private readonly alertService = inject(AlertService);

  protected readonly i18n = this.i18nService.translateAll(SETTINGS_I18N_KEYS);

  /** The config answered, but not with a document: a failed read or no document at all. */
  protected readonly isMissing = computed(() => this.appStore.isAppConfigSettled() && !this.store.isLoaded());

  private readonly pagesResource = rxResource({
    params: resourceParams(() => ({ tenantId: this.appStore.tenantId() })),
    stream: ({ params }) => (params.tenantId ? this.pageService.list().pipe(catchError(() => of([]))) : of([])),
  });
  private readonly pages = computed(() => (this.pagesResource.hasValue() ? this.pagesResource.value() : []));

  /** the query the menu already listens to; FirestoreService shares it */
  private readonly menuDocs = toSignal(this.menuService.list().pipe(catchError(() => of([]))), { initialValue: [] });

  /** nothing from the menus until it is known which blocks are on */
  private readonly rawStartTargets = computed(() => startTargets({
    menuDocs: this.featureStore.settled() ? this.menuDocs() : [],
    pages: this.pages(),
    blocks: FEATURE_BLOCKS,
    isEnabled: this.featureStore.isEnabled(),
    hiddenKeys: this.featureStore.hiddenMenuKeys(),
    tenantId: this.appStore.tenantId(),
  }));

  /** The same with the labels the menu shows, once all of them are there (`translate` answers '' for a scope that fails). */
  private readonly startTargets = toSignal(toObservable(this.rawStartTargets).pipe(
    switchMap((targets) => (targets.length === 0 ? of([]) : combineLatest(targets.map(({ url, label }) => {
      const tokens = { version: '', tenantId: this.appStore.tenantId(), appDomain: this.appStore.appConfig().appDomain ?? '' };
      return this.i18nService.translate(resolveMenuLabelKey(label ?? '', tokens)).pipe(
        map((text) => ({ url, label: expandMenuTokens(text, tokens).trim() })),
      );
    })))),
  ), { initialValue: [] });

  private readonly locationId = computed(() => (this.store.isLoaded() ? String(this.store.settings('defaults').ownerLocationId ?? '') : ''));
  private readonly location = toSignal(toObservable(this.locationId).pipe(
    switchMap((key) => (key ? this.locationService.read(key).pipe(catchError(() => of(undefined))) : of(undefined))),
  ));

  private readonly display = computed((): SettingsDisplayContext => {
    const pages = this.pages();
    const location = this.location();
    const starts = this.startTargets();
    return {
      text: (name) => this.text(name),
      countryName: (code) => getCountryName(code, this.i18nService.getActiveLang()), // not a signal: read on every call, after a language switch
      pageName: (key) => settingsPageName(key, pages, this.appStore.tenantId()),
      locationName: (key) => (location?.okey === key ? location.name : ''),
      resourceName: (key) => this.appStore.getResource(key)?.name ?? '',
      startName: (url) => starts.find((target) => target.url === url)?.label ?? '',
      orgName: (key) => this.appStore.getOrg(key)?.name ?? '',
    };
  });

  protected readonly cards = computed(() => settingsCards(
    (group) => this.store.settings(group), this.display(), (group) => this.canEdit(group),
    (group) => (group === 'platform' ? this.text('operator_only') : ''),
  ));

  protected readonly links = computed(() => {
    const isEnabled = this.featureStore.settled() ? this.featureStore.isEnabled() : () => false;
    return OTHER_EDITORS.filter((editor) => editor.blocks.every((block) => isEnabled(block))).map((editor) => ({
      ...editor, label: this.text(`more_${editor.id}`), helper: this.text(`more_${editor.id}_helper`),
    }));
  });

  /** One editor at a time: a double tap must not open two. */
  private isOpening = false;

  protected text(name: string): string {
    return this.i18n[name]?.() ?? '';
  }

  private canEdit(group: SettingsGroupId): boolean {
    return this.store.isLoaded() && this.store.isAdmin() && TENANT_FORM_GROUPS.includes(group);
  }

  protected async onEdit(group: SettingsGroupId): Promise<void> {
    if (this.isOpening || !this.canEdit(group)) return;
    this.isOpening = true;
    try {
      // the snapshot the save compares with; the modal gets its own copy
      const before = this.store.settings(group);
      const platform = this.store.settings('platform');
      const storedPage = String(this.store.settings('privacy').privacyPolicyPageKey ?? '');
      const storedStart = String(this.store.settings('start').rootUrl ?? '');
      const modal = await this.modalController.create({
        component: SettingsEditModal,
        componentProps: {
          group,
          i18n: this.i18n,
          before: structuredClone(before),
          emailDomain: platform.emailDomain ?? '',
          appDomain: platform.appDomain ?? '',
          pageOptions: computed(() => settingsPageOptions(this.pages(), this.appStore.tenantId(), storedPage)),
          startOptions: computed(() => startOptions(this.startTargets(), storedStart)),
          onUpload: (field: string) => this.uploadImage(field),
          onPickLocation: () => this.pickLocation(),
          onPickResource: () => this.pickResource(),
          nameOf: (field: string, id: string) => this.choiceName(field, id),
          onSave: (after: TenantSettings) => this.save(group, before, after),
        },
      });
      await modal.present();
    } finally {
      this.isOpening = false;
    }
  }

  /**
   * Picks a JPG or PNG, uploads it under a new name (the imgix cache survives a re-upload of the same one) and answers its
   * storage path; undefined when the picker was cancelled, the file is no JPG or PNG, or the upload failed.
   * Nothing is saved here: the path becomes the form value, and the change confirmation saves it. Leaving without saving
   * leaves the uploaded file unused in storage.
   * `pickFile` stays the first call: Safari opens the file dialog only inside the tap that asked for it.
   * An old Safari never reports a cancelled dialog: the promise then stays pending, and the form stays busy until it is closed.
   */
  private async uploadImage(field: string): Promise<string | undefined> {
    const file = await this.uploadService.pickFile([...SETTINGS_IMAGE_MIMETYPES]);
    if (!file) return undefined;
    // the accept list of a file dialog is advisory: check the picked file again, by the type the images skill resolves
    const extension = settingsImageExtension(resolveMimeType(file.name, file.type));
    if (!extension) {
      await this.alertService.showToast(this.text('image_type_error'));
      return undefined;
    }
    if (settingsImageTooBig(file.size)) {
      await this.alertService.showToast(this.text('image_too_big'));
      return undefined;
    }
    const path = settingsImagePath(this.appStore.tenantId(), field, getTodayStr(DateFormat.StoreDateTime), extension);
    try {
      if (path && await this.uploadService.uploadFile(file, path, this.text('image_upload'))) return path;
    } catch (error) {
      console.warn('TenantSettingsContent.uploadImage: the upload failed', error);
    }
    await this.alertService.showToast(this.text('image_failed'));
    return undefined;
  }

  /** The id `app-config` stores for a location is its okey, no prefix (the departure board reads it with `LocationService.read`). */
  private async pickLocation(): Promise<SettingsChoice | undefined> {
    const result = await this.modelSelect.selectLocation('', true, false, false);
    return result?.kind === 'predefined' ? { id: result.location.okey, name: result.location.name } : undefined;
  }

  /** The id `app-config` stores for a resource is its okey, as `AppStore.defaultResource` and the reservation function read it. */
  private async pickResource(): Promise<SettingsChoice | undefined> {
    const resource = await this.modelSelect.selectResource();
    return resource ? { id: resource.okey, name: resource.name } : undefined;
  }

  /** The name of a stored id; '' when it cannot be told (the form then shows the id). Reads signals: the form re-reads it when they change. */
  private choiceName(field: string, id: string): string {
    if (field === 'ownerLocationId') {
      const location = this.location();
      return location?.okey === id ? location.name : '';
    }
    return field === 'defaultResourceId' ? this.appStore.getResource(id)?.name ?? '' : '';
  }

  /** `store.save` answers false without throwing for a cancelled confirmation and a failed write; anything thrown counts as not saved. */
  private async save(group: SettingsGroupId, before: TenantSettings, after: TenantSettings): Promise<boolean> {
    try {
      return await this.store.save(group, before, after);
    } catch (error) {
      console.warn('TenantSettingsContent.save: the settings could not be saved', error);
      return false;
    }
  }

  protected onNavigate(url: string | undefined): void {
    if (url) void this.router.navigateByUrl(url);
  }
}
