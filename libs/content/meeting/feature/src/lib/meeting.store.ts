import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AgendaItem, DocumentModel, MeetingModel, MeetingModelName, MembershipModel, TaskModel } from '@okr/shared-models';
import { AlertService, EmailEntry } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, debugListLoaded, fileName, getTodayStr, hasRole, nameMatches } from '@okr/shared-util-core';

import { MeetingService } from '@okr/content-meeting-data-access';
import { MEETING_I18N_KEYS, buildMinutesDocument, carryOverAgendaItems, getMeetingRelatedKey, newAttendees, newMeetingModel } from '@okr/content-meeting-util';
import { DocumentService } from '@okr/content-document-data-access';
import { DocGenerationService } from '@okr/content-pdf-template-data-access';
import { openBulkEmailFlow } from '@okr/content-pdf-template-feature';
import { EsignService } from '@okr/content-esign-data-access';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { TaskService } from '@okr/task-data-access';

export type MeetingState = {
  listId: string;        // 'all' or a groupKey
  searchTerm: string;
  selectedTag: string;
};

const initialState: MeetingState = {
  listId: 'all',
  searchTerm: '',
  selectedTag: '',
};

export const MeetingStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    firestoreService: inject(FirestoreService),
    alertService: inject(AlertService),
    meetingService: inject(MeetingService),
    membershipService: inject(MembershipService),
    taskService: inject(TaskService),
    documentService: inject(DocumentService),
    docGenerationService: inject(DocGenerationService),
    esignService: inject(EsignService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(MEETING_I18N_KEYS),
  })),
  withProps((store) => ({
    meetingsResource: rxResource({
      params: () => ({ currentUser: store.appStore.currentUser() }),
      stream: ({ params }) => {
        if (!params.currentUser) return of([] as MeetingModel[]);
        return store.meetingService.list().pipe(
          debugListLoaded<MeetingModel>('MeetingStore.meetings', params.currentUser)
        );
      },
    }),

    // The groups the current user belongs to. Meetings are visible per group, so this
    // is the filter — see the visibility section of the 2.7 spec: enforcement is at the
    // query layer, `firestore.rules` gates `meetings` with the house tenantRead().
    myGroupsResource: rxResource({
      params: () => ({ personKey: store.appStore.currentUser()?.personKey }),
      stream: ({ params }) => {
        if (!params.personKey) return of([] as MembershipModel[]);
        return store.membershipService.listMembershipsOfMember(params.personKey, 'person', 'group');
      },
    }),
  })),

  withComputed((state) => ({
    meetings: computed(() => state.meetingsResource.value() ?? []),
    isLoading: computed(() => state.meetingsResource.isLoading()),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.tenantId()),
    myGroupKeys: computed(() => (state.myGroupsResource.value() ?? []).map(m => m.orgKey)),
  })),

  withComputed((state) => ({
    meetingsCount: computed(() => state.meetings().length),
    /** privileged users see every group's meetings; everybody else only their own groups' */
    visibleMeetings: computed(() => {
      const meetings = state.meetings();
      if (hasRole('privileged', state.currentUser())) return meetings;
      const myGroups = state.myGroupKeys();
      return meetings.filter(m => myGroups.includes(m.groupKey ?? ''));
    }),
  })),

  withComputed((state) => ({
    filteredMeetings: computed(() => {
      const listId = state.listId();
      return state.visibleMeetings()
        .filter(m => listId === 'all' || (m.groupKey ?? '') === listId)
        .filter(m => nameMatches(m.index, state.searchTerm()))
        .filter(m => state.selectedTag() === '' || (m.tags ?? '').includes(state.selectedTag()));
    }),
  })),

  withMethods((store) => ({
    setListId(listId: string) { patchState(store, { listId }); },
    setSearchTerm(searchTerm: string) { patchState(store, { searchTerm }); },
    setSelectedTag(selectedTag: string) { patchState(store, { selectedTag }); },

    getTags(): string {
      return store.appStore.getTags(MeetingModelName);
    },

    reload() {
      store.meetingsResource.reload();
    },

    /**
     * Create a meeting for a group. Attendees are seeded from the group's members and
     * the agenda from the previous meeting's still-open action items.
     * @param groupKey the group the meeting belongs to; '' opens an unassigned meeting
     */
    async add(readOnly = false): Promise<void> {
      if (readOnly) return;
      const groupKey = store.listId() === 'all' ? '' : store.listId();
      const meeting = newMeetingModel(store.tenantId(), groupKey);
      if (groupKey) {
        const members = await firstValueFrom(store.membershipService.listMembersOfOrg(groupKey, 'group'));
        meeting.attendees = newAttendees(store.membershipService.getMemberAvatars(members));

        // carry the previous meeting of the same group forward
        const previous = store.visibleMeetings()
          .filter(m => (m.groupKey ?? '') === groupKey)
          .sort((a, b) => (b.meetingDate ?? '').localeCompare(a.meetingDate ?? ''))[0];
        if (previous) {
          meeting.previousMeetingKey = previous.okey;
          const openTasks = await firstValueFrom(store.meetingService.listOpenActionItems(previous.okey));
          meeting.agenda = carryOverAgendaItems(openTasks, previous.okey);
        }
      }
      await this.edit(meeting, false);
    },

    async edit(meeting: MeetingModel, readOnly = true, minutesMode = false): Promise<void> {
      // dynamic import: the modal lives in the ui lib and is only needed on demand
      const { MeetingEditModal } = await import('@okr/content-meeting-ui');
      const modal = await store.modalController.create({
        component: MeetingEditModal,
        componentProps: {
          meeting,
          currentUser: store.currentUser(),
          allTags: this.getTags(),
          readOnly,
          minutesMode,
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (readOnly || !data) return;

      if (role === 'confirm') {
        await this.save(data as MeetingModel);
        this.reload();
        return;
      }
      if (role === 'addTask') {
        const { meeting: edited, agendaItem } = data as { meeting: MeetingModel; agendaItem: AgendaItem };
        // the meeting must exist before a task can point at it
        const savedKey = await this.save(edited);
        if (savedKey) await this.createActionItem(savedKey, agendaItem);
        this.reload();
        // reopen where the user left off
        const reloaded = await firstValueFrom(store.meetingService.read(savedKey ?? edited.okey));
        if (reloaded) await this.edit(reloaded, false, minutesMode);
      }
    },

    /** Write the meeting; returns its okey (existing or freshly created). */
    async save(meeting: MeetingModel): Promise<string | undefined> {
      if ((meeting.okey ?? '').length === 0) {
        return await store.meetingService.create(meeting, store.currentUser());
      }
      await store.meetingService.update(meeting, store.currentUser());
      return meeting.okey;
    },

    /**
     * Turn an agenda item into a task carrying the meeting back-link (spec 1.35).
     * The task is created with the item's owner as assignee and no due date — the
     * board is where it gets refined.
     */
    async createActionItem(meetingKey: string, item: AgendaItem): Promise<void> {
      const task = new TaskModel(store.tenantId());
      task.name = item.title;
      task.assignee = item.owner;
      task.relatedModelType = MeetingModelName;
      task.relatedKey = getMeetingRelatedKey(meetingKey);
      await store.taskService.create(task, store.currentUser());
    },

    /**
     * Render the minutes to PDF and file the result as a document.
     *
     * The HTML goes to the same `generateDocument` callable the privacy report uses; no
     * TemplateModel is involved, so no tenant has to author one before the board can print
     * its first minutes. The generated file is registered in `docs` and referenced by
     * `minutesDocumentKey`, which is what a later Serienmail step (2.96) hands to the Verteiler.
     * @param meeting the meeting to print
     */
    async generateMinutesPdf(meeting: MeetingModel): Promise<void> {
      try {
        // Chair and secretary become the DeepSign signature fields of the PDF — without an
        // email there is no signee, and requestApproval() will refuse the document.
        const signatures = [meeting.chair, meeting.secretary]
          .map(p => ({
            name: `${p?.name1 ?? ''} ${p?.name2 ?? ''}`.trim(),
            email: store.appStore.getDirectoryEntry(`person.${p?.key}`)?.favEmail ?? '',
          }))
          .filter(s => s.email !== '');

        const html = buildMinutesDocument(meeting, {
          signatures,
          tenantName: store.appStore.appConfig().appName,
          meetingDate: convertDateFormatToString(meeting.meetingDate, DateFormat.StoreDate, DateFormat.ViewDate, false),
          generatedOn: convertDateFormatToString(getTodayStr(), DateFormat.StoreDate, DateFormat.ViewDate, false),
          labels: {
            title: store.i18n.pdf_title(),
            date: store.i18n.meetingDate_label(),
            location: store.i18n.locationKey_label(),
            attendees: store.i18n.attendees_title(),
            present: store.i18n.attendees_present(),
            excused: store.i18n.attendees_excused(),
            absent: store.i18n.attendees_absent(),
            invited: store.i18n.attendees_invited(),
            agenda: store.i18n.agenda_title(),
            minutes: store.i18n.agenda_minutes_label(),
            decision: store.i18n.agenda_decision_label(),
            generated: store.i18n.pdf_generated(),
            signatures: store.i18n.pdf_signatures(),
          },
        });

        const generated = await store.docGenerationService.generate({
          html,
          options: {
            storageMode: 'persist',
            filename: `${store.i18n.pdf_title()}-${meeting.meetingDate}.pdf`,
            metadata: { entityType: MeetingModelName, entityId: meeting.okey },
          },
        });

        // File it, so the minutes live in the document list rather than only in the
        // generation audit trail. The signed url of the response expires after an hour;
        // the DocumentModel keeps the storage path, which does not.
        const doc = new DocumentModel(store.tenantId());
        doc.fullPath = generated.storagePath;
        doc.description = `${store.i18n.pdf_title()} ${meeting.name}`;
        doc.mimeType = 'application/pdf';
        doc.size = generated.sizeBytes;
        doc.url = generated.url;
        doc.dateOfDocCreation = getTodayStr();
        doc.dateOfDocLastUpdate = getTodayStr();
        const docKey = await store.documentService.create(doc, store.currentUser());
        if (docKey) {
          meeting.minutesDocumentKey = docKey;
          await this.save(meeting);
          this.reload();
        }

        window.open(generated.url, '_blank');
      } catch (error) {
        store.alertService.error(`MeetingStore.generateMinutesPdf: ${error}`);
      }
    },

    /**
     * Hand the minutes PDF to the Serienmail Verteiler (4.65): the attendees become the
     * bcc list, the org's own address the to. Requires the PDF to exist — generate it first.
     * @param meeting the meeting whose minutes go out
     */
    async sendMinutes(meeting: MeetingModel): Promise<void> {
      const doc = meeting.minutesDocumentKey
        ? await firstValueFrom(store.documentService.read(meeting.minutesDocumentKey))
        : undefined;
      if (!doc) {
        store.alertService.error(store.i18n.send_noPdf());
        return;
      }
      const recipients: EmailEntry[] = (meeting.attendees ?? [])
        .map(a => ({
          email: store.appStore.getDirectoryEntry(`person.${a.person?.key}`)?.favEmail ?? '',
          memberKey: a.person?.key ?? '',
          memberName: `${a.person?.name1 ?? ''} ${a.person?.name2 ?? ''}`.trim(),
          lastName: a.person?.name2 ?? '',
        }))
        .filter(e => !!e.email);

      await openBulkEmailFlow({
        modalController: store.modalController,
        firestoreService: store.firestoreService,
        appStore: store.appStore,
        tenantId: store.tenantId(),
      }, recipients, { storagePath: doc.fullPath, filename: fileName(doc.fullPath) });
    },

    /**
     * Send the minutes PDF to DeepSign for signature by chair and secretary (3.20).
     *
     * The signees are not passed here: they are the `#deepsign#…#` patterns
     * `generateMinutesPdf` rendered into the PDF. `esignScanPredefined` is the dry-run that
     * catches a PDF generated before those patterns existed, before a run is started with
     * zero signees. `sourceRef` is what the archive trigger uses to flip the meeting to
     * 'approved' once every signature is in.
     * @param meeting the meeting whose minutes go to signature
     */
    async requestApproval(meeting: MeetingModel): Promise<void> {
      const doc = meeting.minutesDocumentKey
        ? await firstValueFrom(store.documentService.read(meeting.minutesDocumentKey))
        : undefined;
      if (!doc) {
        store.alertService.error(store.i18n.send_noPdf());
        return;
      }
      try {
        const scan = await store.esignService.scanPredefined(doc.fullPath);
        if (scan.signatureFields.length === 0) {
          store.alertService.error(store.i18n.approve_noSignees());
          return;
        }
        await store.esignService.sendDocument({
          storagePath: doc.fullPath,
          documentName: fileName(doc.fullPath),
          initiatorAliasName: store.appStore.appConfig().appName,
          source: 'cf-generated',
          sourceRef: getMeetingRelatedKey(meeting.okey),
          sendMail: 'all',
        });
        await store.alertService.showToast(store.i18n.approve_started());
      } catch (error) {
        store.alertService.error(`MeetingStore.requestApproval: ${error}`);
      }
    },

    async delete(meeting?: MeetingModel, readOnly = true): Promise<void> {
      if (!meeting || readOnly) return;
      const result = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (result === true) {
        await store.meetingService.delete(meeting, store.currentUser());
        this.reload();
      }
    },
  })),
);
