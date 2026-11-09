import { computed, effect, inject, Injector, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { NewsChannelModel, NewsChannelRequestModel, NewsSegment, NewsSubscriptionModel } from '@okr/shared-models';
import { resourceParams, showToast } from '@okr/shared-util-angular';
import { getFullName, hasRole } from '@okr/shared-util-core';
import { NewsChannelRequestService, NewsChannelService, NewsRelayService, NewsSubscriptionService } from '@okr/social-news-center-data-access';
import { AddressDirectoryService, GeocodingService } from '@okr/subject-address-data-access';
import type { NewsChannelFormData } from '@okr/social-news-center-util';
import { NewsChannelEditModal } from '@okr/social-news-center-ui';
import type { NewsPosition, NewsResolveError } from '@okr/social-news-center-ui';
import {
  avatarOf, canSuggest, orgPostalString, effectiveChannels, hiddenChannels, mergeNewest, NEWS_CENTER_I18N_KEYS, NewsCenterI18n, NewsItem, NewsRequestFormData,
  optionalChannels, parseNewsFeed, ResolvedNewsSource,
} from '@okr/social-news-center-util';

import { emptySubscription, NEWS_MAX_ALL, NewsCenterService, NewsFeedState, NewsFetchQueue, staleChannels, toResolveError } from './news-center.service';

/** How often the webcam segment checks whether a camera is due (each camera keeps its own `refreshMinutes`). */
const WEBCAM_TICK_MS = 30_000;
const EMPTY_FEED: NewsFeedState = { items: [], loading: false, error: false, fetchedAt: 0 };

export type NewsCenterState = {
  segment: NewsSegment;
  /** 'all' or a channel okey */
  selectedKey: string;
  feeds: Record<string, NewsFeedState>;
  /** the curator add flow: the relay's answer to the last pasted link */
  resolved: ResolvedNewsSource | undefined;
  preview: NewsItem[];
  resolveError: NewsResolveError | undefined;
  /** the page is on screen (ionViewDidEnter … ionViewWillLeave); the webcam timer runs only then */
  active: boolean;
  /** optimistic subscription while writes are pending; undefined = the server's doc */
  localSubscription: NewsSubscriptionModel | undefined;
};

const initialState: NewsCenterState = {
  segment: 'video',
  selectedKey: 'all',
  feeds: {},
  resolved: undefined,
  preview: [],
  resolveError: undefined,
  active: false,
  localSubscription: undefined,
};

/** Legacy / partial docs miss the arrays (Firestore reads skip model defaults). */
function normalizeSubscription(sub: NewsSubscriptionModel | undefined, uid: string, tenantId: string): NewsSubscriptionModel {
  const base = emptySubscription(uid, tenantId);
  if (!sub) return base;
  return { ...base, ...sub, okey: uid, hiddenChannelKeys: sub.hiddenChannelKeys ?? [], addedChannelKeys: sub.addedChannelKeys ?? [] };
}

/**
 * NewsCenter (design 2026-11-08 §5, §8): the club's channels, the user's subscription, the feeds of
 * the active segment and the settings actions. Provided by `NewsCenterPage`, so every listener and
 * the webcam timer live exactly as long as the page.
 *
 * The two modals are thin hosts in this lib that inject this store (so their inputs stay live while
 * open); they are loaded with `await import()` to keep the store ↔ modal import one-way.
 */
export const NewsCenterStore = signalStore(
  withState(initialState),

  withProps(() => ({
    appStore: inject(AppStore),
    newsService: inject(NewsCenterService),
    channelService: inject(NewsChannelService),
    subscriptionService: inject(NewsSubscriptionService),
    requestService: inject(NewsChannelRequestService),
    relay: inject(NewsRelayService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    injector: inject(Injector),
    i18nService: inject(I18nService),
    modelSelect: inject(ModelSelectService),
    addressDirectory: inject(AddressDirectoryService),
    geocoder: inject(GeocodingService),
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(NEWS_CENTER_I18N_KEYS) as NewsCenterI18n,
    /** one limit for every refresh of this page: at most 4 relay calls in flight */
    fetchQueue: new NewsFetchQueue(),
    subscriptionWriter: store.newsService.subscriptionWriter((localSubscription) => patchState(store, { localSubscription })),
  })),

  withComputed((store) => ({
    tenantId: computed(() => store.appStore.tenantId()),
    uid: computed(() => store.appStore.fbUser()?.uid ?? ''),
    isCurator: computed(() => hasRole('admin', store.appStore.currentUser()) || hasRole('contentAdmin', store.appStore.currentUser())),
  })),

  withProps((store) => ({
    channelsResource: rxResource({
      params: resourceParams(() => ({ tenantId: store.tenantId() })),
      stream: ({ params }) => (params.tenantId ? store.channelService.list(params.tenantId) : of([] as NewsChannelModel[])),
    }),
    subscriptionResource: rxResource({
      params: resourceParams(() => ({ uid: store.uid() })),
      stream: ({ params }) => (params.uid ? store.subscriptionService.read(params.uid) : of(undefined)),
    }),
    myRequestsResource: rxResource({
      params: resourceParams(() => ({ tenantId: store.tenantId(), uid: store.uid() })),
      stream: ({ params }) => (params.tenantId && params.uid ? store.requestService.listMine(params.tenantId, params.uid) : of([] as NewsChannelRequestModel[])),
    }),
    openRequestsResource: rxResource({
      params: resourceParams(() => ({ tenantId: store.isCurator() ? store.tenantId() : '' })),
      stream: ({ params }) => (params.tenantId ? store.requestService.listOpen(params.tenantId) : of([] as NewsChannelRequestModel[])),
    }),
  })),

  withComputed((store) => {
    const allChannels = computed(() => store.channelsResource.value() ?? []);
    const subscription = computed(() => store.localSubscription() ?? normalizeSubscription(store.subscriptionResource.value(), store.uid(), store.tenantId()));
    /** the user's own doc has been read (or failed): before that, channels() would still list the ones they hid */
    const subscriptionReady = computed(() => !!store.uid() && ['resolved', 'local', 'error'].includes(store.subscriptionResource.status()));
    const channels = computed(() => effectiveChannels(allChannels(), subscription(), store.segment()));
    const failedKeys = computed(() => channels().filter((c) => store.feeds()[c.okey]?.error).map((c) => c.okey));
    const myRequests = computed(() => store.myRequestsResource.value() ?? []);
    const openRequests = computed(() => store.openRequestsResource.value() ?? []);
    /** a selection that left the list (hidden, archived, other segment) falls back to «Alle Kanäle» */
    const activeKey = computed(() => (channels().some((c) => c.okey === store.selectedKey()) ? store.selectedKey() : 'all'));
    return {
      allChannels,
      subscription,
      subscriptionReady,
      channels,
      failedKeys,
      activeKey,
      hiddenChannels: computed(() => hiddenChannels(allChannels(), subscription(), store.segment())),
      optionalChannels: computed(() => optionalChannels(allChannels(), subscription(), store.segment())),
      /** curator view: every channel of the segment, in club order */
      clubChannels: computed(() => allChannels().filter((c) => c.segment === store.segment())),
      /** okey → avatar url: an explicit avatarUrl, else a webcam's current still (design 2026-11-09 §5.2) */
      avatars: computed(() => {
        const out: Record<string, string> = {};
        for (const c of allChannels()) {
          const url = avatarOf(c, store.feeds()[c.okey]);
          if (url) out[c.okey] = url;
        }
        return out;
      }),
      myRequests,
      openRequests,
      openRequestCount: computed(() => openRequests().length),
      canSuggest: computed(() => canSuggest(myRequests().filter((r) => r.status === 'open').length)),
      visibleItems: computed(() => {
        const key = activeKey();
        if (key !== 'all') return store.feeds()[key]?.items ?? [];
        const failed = new Set(failedKeys());
        return mergeNewest(channels().filter((c) => !failed.has(c.okey)).map((c) => store.feeds()[c.okey]?.items ?? []), NEWS_MAX_ALL);
      }),
      /** the grid shows its spinner only while nothing is there yet */
      isLoading: computed(() => {
        const key = activeKey();
        const keys = key === 'all' ? channels().map((c) => c.okey) : [key];
        return keys.some((k) => store.feeds()[k]?.loading) && keys.every((k) => !(store.feeds()[k]?.items.length));
      }),
      requesterName: computed(() => {
        const named = store.appStore.currentPerson() ?? store.appStore.currentUser();
        return named ? getFullName(named.firstName, named.lastName) : '';
      }),
    };
  }),

  withMethods((store) => {
    /** the channel save of the curator add flow, so a following accept can wait for its key */
    let pendingChannelSave: Promise<string | undefined> | undefined;

    const toastError = async (): Promise<void> => {
      await showToast(store.toastController, store.i18n.error_unknown());
    };
    const findChannel = (key: string): NewsChannelModel | undefined => store.allChannels().find((c) => c.okey === key);
    const patchFeed = (key: string, state: Partial<NewsFeedState>): void => {
      patchState(store, (s) => ({
        feeds: { ...s.feeds, [key]: { ...(s.feeds[key] ?? EMPTY_FEED), ...state } },
      }));
    };
    const run = async (action: () => Promise<unknown>): Promise<void> => {
      try {
        await action();
      } catch (error) {
        console.error('NewsCenterStore:', error);
        await toastError();
      }
    };

    return {
      setSegment(segment: NewsSegment): void {
        if (segment === store.segment()) return;
        // refetching happens in the effect below: channels() follows the segment
        patchState(store, { segment, selectedKey: 'all' });
        // queued fetches of the segment just left are dropped, not started
        store.fetchQueue.prune();
      },

      select(key: string): void {
        patchState(store, { selectedKey: key || 'all' });
      },

      /** Loads the channels of the active segment that are missing or too old (all of them with `force`). */
      async refresh(force = false): Promise<void> {
        // until the user's doc is read, channels() still lists channels they hid
        if (!store.subscriptionReady()) return;
        const due = staleChannels(store.channels(), store.feeds(), Date.now(), force);
        if (due.length === 0) return;
        for (const channel of due) patchFeed(channel.okey, { loading: true });
        await store.newsService.loadChannels(due, store.fetchQueue, {
          onLoaded: (key, state) => patchFeed(key, state),
          // dropped before it started: not loading any more, and still stale for the next visit
          onSkipped: (key) => patchFeed(key, { loading: false }),
        }, (channel) => channel.segment === store.segment());
      },

      async openItem(item: NewsItem): Promise<void> {
        const { NewsCenterDetailModal } = await import('./news-center-detail.modal');
        const modal = await store.modalController.create({
          component: NewsCenterDetailModal,
          componentProps: { item, segment: store.segment() },
          injector: store.injector,
        });
        await modal.present();
      },

      async openSettings(): Promise<void> {
        patchState(store, { resolved: undefined, preview: [], resolveError: undefined });
        const { NewsCenterSettingsModal } = await import('./news-center-settings.modal');
        const modal = await store.modalController.create({
          component: NewsCenterSettingsModal,
          injector: store.injector,
        });
        await modal.present();
      },

      /*---------------- settings: my channels (save on every tap) ----------------*/
      async hide(channelKey: string): Promise<void> {
        const channel = findChannel(channelKey);
        if (channel) await run(() => store.subscriptionWriter.hide(store.subscription(), channel));
      },
      async show(channelKey: string): Promise<void> {
        await run(() => store.subscriptionWriter.show(store.subscription(), channelKey));
      },
      async add(channelKey: string): Promise<void> {
        await run(() => store.subscriptionWriter.add(store.subscription(), channelKey));
      },
      async reset(): Promise<void> {
        await run(() => store.subscriptionWriter.reset(store.subscription(), store.allChannels(), store.segment()));
      },
      async suggest(data: NewsRequestFormData): Promise<void> {
        if (!store.canSuggest()) return;
        await run(() => store.newsService.suggest(data, { uid: store.uid(), name: store.requesterName(), tenantId: store.tenantId() }));
      },

      /*---------------- settings: club list (curators) ----------------*/
      /** A new add flow starts from nothing resolved. */
      clearResolve(): void {
        patchState(store, { resolved: undefined, preview: [], resolveError: undefined });
      },

      async resolve(request: { url: string; segment: NewsSegment }): Promise<void> {
        patchState(store, { resolved: undefined, preview: [], resolveError: undefined });
        try {
          const resolved = await store.relay.resolve(request.url, request.segment);
          let preview: NewsItem[] = [];
          if (resolved.kind !== 'image' && resolved.body) {
            try {
              preview = parseNewsFeed(resolved.body, resolved.kind, '', 3);
            } catch {
              preview = [];
            }
          }
          patchState(store, { resolved, preview });
        } catch (error) {
          patchState(store, { resolveError: toResolveError(error) });
        }
      },

      /** Saves a new or changed channel. A new one is remembered so an «Übernehmen» right after can use its key. */
      async clubSave(channel: NewsChannelModel): Promise<void> {
        const save = store.newsService.saveChannel(channel, store.tenantId(), store.allChannels());
        if (!channel.okey) {
          pendingChannelSave = save.catch(() => undefined);
          patchState(store, { resolved: undefined, preview: [], resolveError: undefined });
        }
        const key = await save.catch(() => undefined);
        if (!key) await toastError();
      },

      /** The modal emits accept right after clubSave: mark the suggestion accepted only once that channel is saved. */
      async accept(request: NewsChannelRequestModel): Promise<void> {
        const save = pendingChannelSave;
        pendingChannelSave = undefined;
        if (!save) return;
        await run(() => store.newsService.acceptAfterSave(request, save));
      },

      async reject(request: NewsChannelRequestModel): Promise<void> {
        await run(() => store.newsService.reject(request));
      },

      async clubArchive(channelKey: string): Promise<void> {
        const channel = findChannel(channelKey);
        if (channel) await run(() => store.newsService.archiveChannel(channel));
      },

      /**
       * Curator edit of a webcam (design 2026-11-09 §5.3): name, position, host org. The modal gets the
       * pickers and the org geocoding as callbacks; save writes exactly what the form holds.
       */
      async editChannel(channel: NewsChannelModel): Promise<void> {
        const orgName = channel.orgKey ? (store.appStore.allOrgs().find((o) => o.okey === channel.orgKey)?.name ?? '') : '';
        const pickLocation = async (): Promise<NewsPosition | undefined> => {
          const pick = await store.modelSelect.selectLocation('', true, false, true);
          if (pick?.kind === 'predefined') return { latitude: pick.location.latitude, longitude: pick.location.longitude };
          if (pick?.kind === 'current') return { latitude: pick.latitude, longitude: pick.longitude };
          return undefined;
        };
        const pickOrg = async (): Promise<{ orgKey: string; orgName: string } | undefined> => {
          const org = await store.modelSelect.selectOrg();
          return org ? { orgKey: org.okey, orgName: org.name } : undefined;
        };
        const geocodeOrg = async (orgKey: string): Promise<NewsPosition | undefined> => {
          const directory = await firstValueFrom(store.addressDirectory.read(`org.${orgKey}`)).catch(() => undefined);
          const address = orgPostalString(directory);
          if (!address) return undefined;
          const coords = await store.geocoder.geocodeAddress(address);
          return coords ? { latitude: coords.lat, longitude: coords.lng } : undefined;
        };
        const modal = await store.modalController.create({
          component: NewsChannelEditModal,
          componentProps: { channel, orgName, i18n: store.i18n, pickLocation, pickOrg, geocodeOrg },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<NewsChannelFormData>();
        if (role !== 'confirm' || !data) return;
        await run(() => store.channelService.update({ ...channel, name: data.name, latitude: data.latitude, longitude: data.longitude, orgKey: data.orgKey }));
      },

      async clubReorder(orderedKeys: string[]): Promise<void> {
        await run(() => store.newsService.reorder(store.clubChannels(), orderedKeys));
      },
    };
  }),

  withMethods((store) => ({
    /** The page is on screen (ionViewDidEnter) or not (ionViewWillLeave). Coming back refetches what went stale. */
    setActive(active: boolean): void {
      patchState(store, { active });
      if (active) void store.refresh();
    },
  })),

  withHooks((store) => {
    let timer: ReturnType<typeof setInterval> | undefined;
    return {
      onInit(): void {
        // fetch whatever is missing or older than 10 min whenever the segment or its channel list
        // changes — first once the user's own doc is read, so hidden channels are never fetched
        effect(() => {
          store.channels();
          if (!store.subscriptionReady()) return;
          untracked(() => void store.refresh());
        });
        // webcams: reload each camera after its refreshMinutes while the webcam segment is on screen
        // (page shown, not navigated away from, browser tab visible)
        timer = setInterval(() => {
          if (store.active() && store.segment() === 'webcam' && document.visibilityState === 'visible') void store.refresh();
        }, WEBCAM_TICK_MS);
      },
      onDestroy(): void {
        if (timer) clearInterval(timer);
      },
    };
  }),
);
