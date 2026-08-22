import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AliasModel, AliasSpaceModel, CategoryItemModel, CategoryListModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
import { debugListLoaded } from '@okr/shared-util-core';

import { AliasMintService, AliasService, AliasSpaceService } from '@okr/system-alias-data-access';
import { ALIAS_I18N_KEYS } from '@okr/system-alias-util';

// Plain imports sind hier sicher: beide Modale lösen ihre i18n über I18nService auf und
// injizieren diesen Store NIE — es gibt also keinen Import-Zyklus, der eine dynamische
// import()-Form nötig machen würde (siehe new-feature-Skill, „Store ↔ edit-modal DI contract").
import { AliasEditModal, AliasSpaceEditModal } from '@okr/system-alias-ui';

export type AliasState = {
  searchTerm: string;
  selectedSpace: string;
};

const initialState: AliasState = {
  searchTerm: '',
  selectedSpace: '',
};

/** Sucht über Alias, Original und Notiz — das sind die drei Felder, die ein Mensch wiedererkennt. */
function matches(alias: AliasModel, term: string): boolean {
  if (!term) return true;
  const needle = term.toLowerCase();
  return [alias.alias, alias.original, alias.notes, alias.targetUrl, alias.targetKey]
    .some((field) => (field ?? '').toLowerCase().includes(needle));
}

export const AliasStore = signalStore(
  withState(initialState),

  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    aliasService: inject(AliasService),
    aliasSpaceService: inject(AliasSpaceService),
    aliasMintService: inject(AliasMintService),
    i18nService: inject(I18nService),
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(ALIAS_I18N_KEYS),
  })),

  withProps((store) => ({
    aliasesResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => store.aliasService.list().pipe(
        debugListLoaded<AliasModel>('AliasStore.aliases', params.currentUser),
      ),
    }),
    spacesResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => store.aliasSpaceService.list().pipe(
        debugListLoaded<AliasSpaceModel>('AliasStore.spaces', params.currentUser),
      ),
    }),
  })),

  withComputed((state) => ({
    aliases: computed(() => state.aliasesResource.value() ?? []),
    spaces: computed(() => state.spacesResource.value() ?? []),
    isLoading: computed(() => state.aliasesResource.isLoading() || state.spacesResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
  })),

  withComputed((state) => ({
    aliasesCount: computed(() => state.aliases().length),
    spacesCount: computed(() => state.spaces().length),
    spaceNames: computed(() => state.spaces().map((space) => space.name)),
    /**
     * Die Space-Auswahl des Listenfilters. `okr-list-filter` erwartet eine CategoryListModel,
     * keine Namensliste; ohne `i18n` zeigt sie den Item-Namen selbst als Label — und genau der
     * Space-Name steht auch in der URL, ist also die ehrlichste Beschriftung.
     */
    spaceCategory: computed(() => {
      const category = new CategoryListModel(state.appStore.tenantId());
      category.name = 'space';
      category.items = state.spaces().map((space) => new CategoryItemModel(space.name, 'link'));
      return category;
    }),
    filteredAliases: computed(() => state.aliases()
      .filter((alias) => !state.selectedSpace() || alias.space === state.selectedSpace())
      .filter((alias) => matches(alias, state.searchTerm()))),
  })),

  withComputed((state) => ({
    /**
     * Pro Space: wie viele Aliase, wie oft benutzt. Beides wird in der Space-Liste gezeigt UND
     * entscheidet, ob das Space-Formular `name`/`kind`/`charset` sperrt — ein Space mit Aliasen
     * darf nicht umbenannt werden, weil sein Name in jeder gedruckten Adresse steht.
     */
    spaceUsage: computed(() => {
      const usage = new Map<string, { aliasCount: number; useCount: number }>();
      for (const alias of state.aliases()) {
        const entry = usage.get(alias.space) ?? { aliasCount: 0, useCount: 0 };
        entry.aliasCount += 1;
        entry.useCount += alias.useCount ?? 0;
        usage.set(alias.space, entry);
      }
      return usage;
    }),
  })),

  withMethods((store) => ({
    setSearchTerm(searchTerm: string): void { patchState(store, { searchTerm }); },
    setSelectedSpace(selectedSpace: string): void { patchState(store, { selectedSpace: selectedSpace ?? '' }); },

    reload(): void {
      store.aliasesResource.reload();
      store.spacesResource.reload();
    },

    getSpace(name: string): AliasSpaceModel | undefined {
      return store.spaces().find((space) => space.name === name);
    },

    hasAliases(space: AliasSpaceModel): boolean {
      return (store.spaceUsage().get(space.name)?.aliasCount ?? 0) > 0;
    },

    /**
     * Einen neuen Alias prägen.
     *
     * Geht über die Callable, NICHT über Firestore: `aliases` ist `allow write: if false`, weil
     * die Document-ID deterministisch ist und ein Client-Write einen bestehenden — womöglich
     * gedruckten — Alias still überschreiben würde.
     */
    async add(readOnly = false): Promise<void> {
      if (readOnly || !store.currentUser()) return;
      const draft = new AliasModel(store.tenantId());
      draft.space = store.selectedSpace() || (store.spaceNames()[0] ?? '');

      const modal = await store.modalController.create({
        component: AliasEditModal,
        componentProps: {
          alias: draft, currentUser: store.currentUser(), tenantId: store.tenantId(), readOnly: false,
        },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss<AliasModel>();
      if (role !== 'confirm' || !data) return;

      const result = await store.aliasMintService.createAlias({
        space: data.space,
        targetType: data.targetType,
        targetUrl: data.targetUrl,
        targetKey: data.targetKey,
        original: data.original || data.targetUrl,
        notes: data.notes,
        alias: data.alias || undefined,
        validUntil: data.validUntil || undefined,
        maxUses: data.maxUses,
        trackingLevel: data.trackingLevel,
      });

      // Die Fehlermeldung kommt vom Server und ist dort neben der Regel formuliert, die sie
      // ausgelöst hat — sie wird deshalb wörtlich gezeigt statt durch eine eigene ersetzt.
      if (!result.ok) {
        await store.alertService.error(result.message);
        return;
      }
      this.reload();
    },

    /** Ein bestehender Alias wird nur ANGESEHEN — geändert wird über den Server, nicht hier. */
    async view(alias: AliasModel): Promise<void> {
      const modal = await store.modalController.create({
        component: AliasEditModal,
        componentProps: {
          alias, currentUser: store.currentUser(), tenantId: store.tenantId(), readOnly: true,
        },
      });
      await modal.present();
      await modal.onDidDismiss();
    },

    async editSpace(space: AliasSpaceModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: AliasSpaceEditModal,
        componentProps: {
          space,
          hasAliases: this.hasAliases(space),
          currentUser: store.currentUser(),
          tenantId: store.tenantId(),
          readOnly,
        },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss<AliasSpaceModel>();
      if (role === 'confirm' && data && !readOnly) {
        if ((data.okey ?? '').length === 0) await store.aliasSpaceService.create(data);
        else await store.aliasSpaceService.update(data);
        this.reload();
      }
    },

    async addSpace(readOnly = false): Promise<void> {
      if (readOnly || !store.currentUser()) return;
      await this.editSpace(new AliasSpaceModel(store.tenantId()), false);
    },

    /**
     * Ein Space wird ARCHIVIERT, nie gelöscht: ein gelöschter Space macht jeden seiner Aliase
     * unauflösbar — auch die bereits gedruckten. Das erzwingen auch die Firestore-Regeln
     * (`allow delete: if false`).
     */
    async archiveSpace(space: AliasSpaceModel): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.action_delete(), true);
      if (confirmed !== true) return;
      await store.aliasSpaceService.archive(space);
      this.reload();
    },

    exportRaw(): void {
      const rows = store.filteredAliases();
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aliases-${store.tenantId()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    },
  })),
);
