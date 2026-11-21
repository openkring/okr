import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { NewsletterSubscriptionModel } from '@okr/shared-models';
import { AlertService, showToast } from '@okr/shared-util-angular';
import { fill, nameMatches } from '@okr/shared-util-core';

import type { VersandRecipient } from '@okr/content-pdf-template-feature';
import { NewsletterSubscriptionService } from '@okr/relationship-newsletter-data-access';
import { activeSubscribers, canSeeSubscribers, NEWSLETTER_I18N_KEYS } from '@okr/relationship-newsletter-util';
import { isNewsletterGroup } from '@okr/subject-group-util';

export type NewsletterState = {
  groupKey: string;
  searchTerm: string;
};

const initialState: NewsletterState = {
  groupKey: '',
  searchTerm: '',
};

/**
 * The subscribers of one newsletter group (spec 1.169 §5.8) and the actions on them: end a
 * subscription (`leaveNewsletter`) and open the Versand to all active subscribers.
 */
export const NewsletterStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    subscriptionService: inject(NewsletterSubscriptionService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(NEWSLETTER_I18N_KEYS),
  })),
  withComputed((store) => ({
    tenantId: computed(() => store.appStore.tenantId()),
    currentUser: computed(() => store.appStore.currentUser()),
    /** The newsletter group; undefined while loading or when the key names no newsletter. */
    group: computed(() => {
      const group = store.appStore.getGroup(store.groupKey());
      return isNewsletterGroup(group) ? group : undefined;
    }),
  })),
  withComputed((store) => ({
    /** Mirrors the read rule: without it the query would only be refused. */
    canSee: computed(() => canSeeSubscribers(store.group(), store.currentUser())),
  })),
  withProps((store) => ({
    subscriptionsResource: rxResource({
      params: () => ({
        tenantId: store.tenantId(),
        groupKey: store.groupKey(),
        canSee: store.canSee(),
      }),
      stream: ({ params }) => {
        if (!params.tenantId || !params.groupKey || !params.canSee) return of([] as NewsletterSubscriptionModel[]);
        return store.subscriptionService.listByGroup(params.tenantId, params.groupKey);
      },
    }),
  })),
  withComputed((store) => ({
    /** The active subscriptions, sorted by name. */
    subscribers: computed(() => activeSubscribers(store.subscriptionsResource.value() ?? [])),
    isLoading: computed(() => store.subscriptionsResource.isLoading() || store.appStore.isReferenceDataLoading()),
  })),
  withComputed((store) => ({
    activeCount: computed(() => store.subscribers().length),
    filteredSubscribers: computed(() => store.subscribers().filter((s) => nameMatches(s.personName, store.searchTerm()))),
  })),
  withMethods((store) => ({
    setGroupKey(groupKey: string): void {
      patchState(store, { groupKey });
    },
    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    /**
     * Opens the Versand to every active subscriber. `groupKey` (the newsletter) is passed for every
     * caller, elevated ones too: the server then admits only subscribers, adds the personal unsubscribe
     * link, and prices the letters with it (spec 1.169 §5.6).
     */
    async openVersand(): Promise<void> {
      const group = store.group();
      if (!group || !store.canSee()) return;
      const recipients: VersandRecipient[] = store.subscribers().map((s) => ({
        personKey: s.personKey,
        name: s.personName,
        email: store.appStore.getDirectoryEntry(`person.${s.personKey}`)?.favEmail ?? '',
      }));
      // loaded on demand: the Versand flow is heavy and this lib is also imported by the profile page
      const { openBulkEmailFlow } = await import('@okr/content-pdf-template-feature');
      await openBulkEmailFlow({
        modalController: store.modalController,
        firestoreService: store.firestoreService,
        appStore: store.appStore,
        tenantId: store.tenantId(),
      }, recipients, undefined, undefined, group.okey, { newsletter: true });
    },

    /** Ends one subscription after a confirmation; the server sets `dateOfExit` (and may release the person). */
    async endSubscription(subscriptionKey: string): Promise<void> {
      const subscription = store.subscribers().find((s) => s.okey === subscriptionKey);
      if (!subscription) return;
      const name = subscription.personName;
      const confirmed = await store.alertService.confirm(fill(store.i18n.unsubscribe_confirm(), { name }), true);
      if (!confirmed) return;
      try {
        await store.subscriptionService.leave(store.tenantId(), subscriptionKey);
        await showToast(store.toastController, fill(store.i18n.unsubscribe_conf(), { name }));
      } catch (err) {
        console.error('NewsletterStore.endSubscription: leaveNewsletter failed', err);
        await showToast(store.toastController, store.i18n.unsubscribe_error());
      }
    },
  })),
);
