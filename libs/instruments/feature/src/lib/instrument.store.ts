import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { InstrumentCollection, InstrumentModel, InstrumentTopic, InstrumentType } from '@okr/shared-models';
import { chipMatches, debugItemLoaded, debugListLoaded, getAvatarInfo, getSystemQuery, hasRole, nameMatches } from '@okr/shared-util-core';

import { InstrumentService } from '@okr/instruments-data-access';
import {
  createInstrument, createTopic, gridDefinitionFor, INSTRUMENTS_I18N_KEYS, CELL_I18N_KEYS,
  isInstrument, rankForInsertion, sortTopicsByRank,
} from '@okr/instruments-util';
import { InstrumentTopicMove } from '@okr/instruments-ui';

export type InstrumentFilterState = {
  type: InstrumentType;
  instrumentKey: string;
  searchTerm: string;
  selectedTag: string;
};

export const initialState: InstrumentFilterState = {
  type: 'swot',
  instrumentKey: '',
  searchTerm: '',
  selectedTag: '',
};

export const InstrumentStore = signalStore(
  withState(initialState),
  withProps(() => ({
    instrumentService: inject(InstrumentService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(INSTRUMENTS_I18N_KEYS),
    cellI18n: store.i18nService.translateAll(CELL_I18N_KEYS),
    instrumentsResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) =>
        store.firestoreService.searchData<InstrumentModel>(InstrumentCollection, getSystemQuery(store.appStore.tenantId()), 'name', 'asc').pipe(
          debugListLoaded<InstrumentModel>('InstrumentStore.instruments', params.currentUser),
        ),
    }),
    instrumentResource: rxResource({
      params: () => ({ instrumentKey: store.instrumentKey(), currentUser: store.appStore.currentUser() }),
      stream: ({ params }) =>
        store.instrumentService.read(params.instrumentKey).pipe(
          debugItemLoaded('InstrumentStore.instrument', params.currentUser),
        ),
    }),
  })),

  withComputed((state) => ({
    instruments: computed(() => (state.instrumentsResource.value() ?? []).filter(instrument => instrument.type === state.type())),
    instrument: computed(() => state.instrumentResource.value()),
    isLoading: computed(() => state.instrumentsResource.isLoading() || state.instrumentResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
    tags: computed(() => state.appStore.getTags('instrument')),
  })),

  withComputed((state) => ({
    instrumentsCount: computed(() => state.instruments().length),
    filteredInstruments: computed(() =>
      state.instruments().filter(instrument =>
        nameMatches(instrument.index, state.searchTerm()) &&
        chipMatches(instrument.tags, state.selectedTag()),
      ),
    ),
    // the current board's grid definition and its topics, ordered per cell
    gridDefinition: computed(() => gridDefinitionFor(state.instrument()?.type ?? state.type())),
    topics: computed<InstrumentTopic[]>(() => sortTopicsByRank(state.instrument()?.topics ?? [])),
    // resolved cell labels for the board (store-driven i18n): cellId -> label
    cellLabels: computed<Record<string, string>>(() => {
      const def = gridDefinitionFor(state.instrument()?.type ?? state.type());
      const labels: Record<string, string> = {};
      for (const cell of def.cells) {
        const signal = (state.cellI18n as Record<string, () => string>)[cell.id];
        labels[cell.id] = signal ? signal() : cell.labelKey;
      }
      return labels;
    }),
  })),

  withMethods((store) => ({
    reset() {
      patchState(store, initialState);
    },
    reload() {
      store.instrumentsResource.reload();
      store.instrumentResource.reload();
    },

    setType(type: InstrumentType) {
      patchState(store, { type });
    },
    setInstrumentKey(instrumentKey: string) {
      patchState(store, { instrumentKey });
    },
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
    setSelectedTag(selectedTag: string) {
      patchState(store, { selectedTag });
    },

    /** May the current user change this instrument? Privileged, or the instrument's own author. */
    canChange(instrument?: InstrumentModel): boolean {
      const currentUser = store.currentUser();
      if (hasRole('privileged', currentUser)) return true;
      if (instrument && currentUser && instrument.author?.key === currentUser.personKey) return true;
      return false;
    },

    /*-------------------------- instrument CRUD --------------------------------*/

    async add(readOnly = true): Promise<void> {
      if (readOnly) return;
      const instrument = createInstrument(store.tenantId(), store.type());
      const person = store.appStore.getPerson(store.currentUser()?.personKey ?? '');
      instrument.author = getAvatarInfo(person, 'person') ?? undefined;
      await this.edit(instrument, readOnly);
    },

    async edit(instrument: InstrumentModel, readOnly = true): Promise<void> {
      const { InstrumentEditModal } = await import('./instrument-edit.modal');
      const modal = await store.modalController.create({
        component: InstrumentEditModal,
        componentProps: { instrument, currentUser: store.currentUser(), tags: store.tags(), tenantId: store.tenantId(), readOnly },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data && !readOnly && isInstrument(data, store.tenantId())) {
        data.okey.length === 0
          ? await store.instrumentService.create(data, store.currentUser())
          : await store.instrumentService.update(data, store.currentUser());
        this.reload();
      }
    },

    async delete(instrument?: InstrumentModel, readOnly = true): Promise<void> {
      if (instrument && !readOnly) {
        await store.instrumentService.delete(instrument, store.currentUser());
        this.reload();
      }
    },

    /*-------------------------- board (topics) --------------------------------*/

    /** Present the topic-card editor. Returns the dismiss `{ data, role }`. */
    async presentTopicEditor(topic: InstrumentTopic, readOnly: boolean, showScore: boolean): Promise<{ data?: InstrumentTopic; role?: string }> {
      const { TopicEditModal } = await import('./topic-edit.modal');
      const modal = await store.modalController.create({
        component: TopicEditModal,
        componentProps: { topic, readOnly, showScore },
      });
      modal.present();
      return modal.onDidDismiss<InstrumentTopic>();
    },

    /** Add a new topic to a cell (ranked at the end). Only persisted if its editor is confirmed. */
    async addTopic(cell: string, readOnly = true): Promise<void> {
      const instrument = store.instrument();
      if (readOnly || !instrument) return;
      const cellTopics = sortTopicsByRank(instrument.topics.filter(topic => topic.cell === cell));
      const topic = createTopic(cell);
      topic.rank = rankForInsertion(cellTopics, cellTopics.length);
      const { data, role } = await this.presentTopicEditor(topic, readOnly, this.scored(instrument));
      if (role === 'confirm' && data) {
        instrument.topics = [...instrument.topics, data];
        await store.instrumentService.saveTopics(instrument, store.currentUser());
      }
    },

    /** Move a card: a single `{ cell, rank }` change on the embedded topic (spec D4). */
    async moveTopic(move: InstrumentTopicMove, readOnly = true): Promise<void> {
      const instrument = store.instrument();
      if (readOnly || !instrument) return;
      const topic = instrument.topics.find(candidate => candidate.key === move.topic.key);
      if (!topic) return;
      topic.cell = move.targetCell;
      topic.rank = move.targetRank;
      await store.instrumentService.saveTopics(instrument, store.currentUser());
    },

    /** Edit an existing card. The editor may also request deletion (role 'delete'). */
    async editTopic(topic: InstrumentTopic, readOnly = true): Promise<void> {
      const instrument = store.instrument();
      if (!instrument) return;
      const { data, role } = await this.presentTopicEditor(topic, readOnly, this.scored(instrument));
      if (readOnly) return;
      if (role === 'delete') {
        await this.deleteTopic(topic, readOnly);
        return;
      }
      if (role === 'confirm' && data) {
        instrument.topics = instrument.topics.map(candidate => (candidate.key === data.key ? data : candidate));
        await store.instrumentService.saveTopics(instrument, store.currentUser());
      }
    },

    async deleteTopic(topic: InstrumentTopic, readOnly = true): Promise<void> {
      const instrument = store.instrument();
      if (readOnly || !instrument) return;
      instrument.topics = instrument.topics.filter(candidate => candidate.key !== topic.key);
      await store.instrumentService.saveTopics(instrument, store.currentUser());
    },

    /** Score axes only apply to SWOT (weighting) and PESTEL (impact/horizon); positional grids hide them. */
    scored(instrument: InstrumentModel): boolean {
      return instrument.type === 'swot' || instrument.type === 'pestel';
    },

    getTitleLabel(readOnly: boolean, name?: string): string {
      if (readOnly) return store.i18n.view();
      return name && name.length > 0 ? name : store.i18n.create();
    },
  })),
);
