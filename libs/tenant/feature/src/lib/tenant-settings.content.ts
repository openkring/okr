import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow, ModalController } from '@ionic/angular';

import { combineLatest, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { MenuService } from '@okr/cms-menu-data-access';
import { expandMenuTokens, resolveMenuLabelKey } from '@okr/cms-menu-util';
import { PageService } from '@okr/cms-page-data-access';
import { LocationService } from '@okr/location-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner } from '@okr/shared-ui';
import { resourceParams } from '@okr/shared-util-angular';
import { getCountryName } from '@okr/shared-util-core';
import { SETTINGS_FORM_GROUPS, SettingsEditModal } from '@okr/tenant-ui';
import {
  FEATURE_BLOCKS, SETTINGS_GROUP_IDS, SETTINGS_I18N_KEYS, settingsGroupKey, settingsPageName, settingsPageOptions, settingsRows, startOptions, startTargets,
} from '@okr/tenant-util';
import type { SettingsDisplayContext, SettingsGroupId, TenantSettings } from '@okr/tenant-util';

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
    Spinner, SvgIconPipe,
    IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote, IonRow,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    ion-card-header { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; }
    .label { font-size: 0.85rem; opacity: 0.7; }
    .value { display: flex; align-items: center; gap: 8px; }
    .value span.text {
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden;
      overflow-wrap: anywhere; white-space: pre-line;
    }
    .value.empty { opacity: 0.6; font-style: italic; }
    .swatch { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 4px; border: 1px solid var(--ion-color-medium); }
  `],
  template: `
    @if (store.isLoaded()) {
      <ion-grid>
        <ion-row>
          @for (card of cards(); track card.group) {
            <ion-col size="12" size-md="6">
              <ion-card>
                <ion-card-header>
                  <ion-card-title>{{ card.title }}</ion-card-title>
                  @if (card.canEdit) {
                    <ion-button fill="clear" size="small" [attr.aria-label]="text('edit') + ': ' + card.title" (click)="onEdit(card.group)">
                      <ion-icon slot="start" src="{{ 'edit' | svgIcon }}" aria-hidden="true" />
                      {{ text('edit') }}
                    </ion-button>
                  }
                </ion-card-header>
                <ion-card-content class="ion-no-padding">
                  @if (card.note) {
                    <ion-item lines="none">
                      <ion-note class="ion-text-wrap">{{ card.note }}</ion-note>
                    </ion-item>
                  }
                  <ion-list lines="none">
                    @for (row of card.rows; track row.field) {
                      <ion-item>
                        <ion-label>
                          <div class="label ion-text-wrap">{{ row.label }}</div>
                          <div class="value" [class.empty]="!row.value">
                            @if (row.color) {
                              <span class="swatch" [style.background-color]="row.color"></span>
                            }
                            <span class="text">{{ row.value || text(row.emptyText) }}</span>
                          </div>
                        </ion-label>
                      </ion-item>
                    }
                  </ion-list>
                </ion-card-content>
              </ion-card>
            </ion-col>
          }
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
        </ion-row>
      </ion-grid>
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
  private readonly router = inject(Router);

  private readonly i18n = this.i18nService.translateAll(SETTINGS_I18N_KEYS);

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

  /** The same with the labels the menu shows. `startWith`: a text that loads slowly holds back its own label only. */
  private readonly startTargets = toSignal(toObservable(this.rawStartTargets).pipe(
    switchMap((targets) => (targets.length === 0 ? of([]) : combineLatest(targets.map(({ url, label }) => {
      const tokens = { version: '', tenantId: this.appStore.tenantId(), appDomain: this.appStore.appConfig().appDomain ?? '' };
      return this.i18nService.translate(resolveMenuLabelKey(label ?? '', tokens)).pipe(
        startWith(''),
        map((text) => ({ url, label: expandMenuTokens(text, tokens) })),
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

  protected readonly cards = computed(() => {
    const display = this.display();
    return SETTINGS_GROUP_IDS.map((group) => ({
      group,
      title: this.text(settingsGroupKey(group)),
      note: group === 'platform' ? this.text('operator_only') : '',
      canEdit: this.canEdit(group),
      rows: settingsRows(group, this.store.settings(group), display),
    }));
  });

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
    return this.store.isLoaded() && this.store.isAdmin() && SETTINGS_FORM_GROUPS.includes(group);
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
          onSave: (after: TenantSettings) => this.save(group, before, after),
        },
      });
      await modal.present();
    } finally {
      this.isOpening = false;
    }
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
