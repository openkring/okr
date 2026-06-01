import { computed, inject, Injectable, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';

import { ExportFormats, memberTypeMatches, yearMatches } from '@bk2/shared-categories';
import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore, PersonSelectModal } from '@bk2/shared-feature';
import { AddressCollection, AddressModel, CategoryListModel, ExportFormat, GroupModel, GroupModelName, MembershipCollection, MembershipModel, OrgModel, OrgModelName, OwnershipCollection, OwnershipModel, PersonModel, PersonModelName } from '@bk2/shared-models';
import { chipMatches, convertDateFormatToString, DateFormat, debugListLoaded, debugMessage, generateRandomString, getAvatarInfo, getCatAbbreviation, getDataRow, getFullName, getSystemQuery, getTodayStr, isAfterDate, isAfterOrEqualDate, isMembership, isOngoing, isPerson, nameMatches, warn } from '@bk2/shared-util-core';
import { confirm, copyToClipboardWithConfirmation, exportXlsx, getCcEmailAddresses, getMainEmailAddresses, navigateByUrl, showToast } from '@bk2/shared-util-angular';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';
import { EmailAddressesModal, selectDate } from '@bk2/shared-ui';

import { TaskService } from '@bk2/task-data-access';
import { OwnershipService } from '@bk2/relationship-ownership-data-access';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { convertFormToNewPerson, convertMemberAndOrgToMembership, convertNewMemberFormToEmailAddress, convertNewMemberFormToMembership, convertNewMemberFormToPhoneAddress, convertNewMemberFormToPostalAddress, convertNewMemberFormToWebAddress, convertToAddressDataRow, convertToClubdeskImportRow, convertToSrvDataRow, getGroupsOfMember, getRelLogEntry, MemberNewFormModel } from '@bk2/relationship-membership-util';
import { AddressService } from '@bk2/subject-address-data-access';
import { PersonService } from '@bk2/subject-person-data-access';
import { PERSON_EDIT_MODAL } from '@bk2/subject-person-ui';
import { browseUrl } from '@bk2/subject-address-util';
import { MatrixChatService } from '@bk2/chat-data-access';
import { InvoiceNewModal } from '@bk2/finance-invoice-feature';

import { MemberNewModal } from './member-new.modal';
import { CategoryChangeModal } from './membership-category-change.modal';
import { MembershipEditModal } from './membership-edit.modal';
import { PFX } from './scope';
import { ActivityService } from '@bk2/activity-data-access';

export type MembershipState = {
  orgId: string;  // the organization to which the memberships belong (can be org or group)
  orgType: 'org' | 'group';
  listId: string;  // the current list view (active, exits, etc.) - used to detect view changes and reset filters
  showOnlyCurrent: boolean;  // whether to show only current memberships or all memberships that ever existed
  version: number; // used to trigger reload of resources when it changes (e.g. after adding/editing a membership) to avoid calling reload() directly from the modal which would cause issues with the modal closing before the reload is finished

  // for accordion-like display of memberships of a given member
  member: PersonModel | OrgModel | GroupModel | undefined;
  modelType: 'person' | 'org' | 'group' | undefined;

  // filters
  searchTerm: string;
  selectedTag: string;
  selectedMembershipCategory: string;
  selectedYear: number;
  selectedGender: string;
  selectedOrgType: string;
  yearField: 'dateOfEntry' | 'dateOfExit';
};

const initialState: MembershipState = {
  orgId: '',
  orgType: 'org',
  listId: '',
  showOnlyCurrent: true,
  version: 0,

  member: undefined,
  modelType: undefined,

  searchTerm: '',
  selectedTag: '',
  selectedMembershipCategory: 'all',
  selectedYear: parseInt(getTodayStr(DateFormat.Year)),
  selectedGender: 'all',
  selectedOrgType: 'all',
  yearField: 'dateOfEntry',
};

const MEMBERSHIP_I18N_KEYS = {
  memberships:                    PFX + 'memberships',
  members:                        PFX + 'members',
  reldesc1:                       PFX + 'reldesc1',
  reldesc2:                       PFX + 'reldesc2',
  new_desc:                       PFX + 'newDesc',
  title_rel:                      PFX + 'in',
  year_entry:                     PFX + 'year.entry',
  year_exit:                      PFX + 'year.exit',
  empty:                          PFX + 'empty',
  no_data_members:                PFX + 'noData.members',
  no_data_memberships:            PFX + 'noData.memberships',

  view_label:                     PFX + 'view.label',
  update_label:                   PFX + 'update.label',
  chat_open:                      PFX + 'chat.open',
  copy_email_label:               PFX + 'copy.email.label',
  copy_email_conf:                PFX + 'copy.email.conf',
  copy_phone_label:               PFX + 'copy.phone.label',
  copy_phone_conf:                PFX + 'copy.phone.conf',
  create_member:                  PFX + 'create.member',
  create_alreadyMember:           PFX + 'create.alreadyMember',
  create_label:                   PFX + 'create.label',
  create_error:                   PFX + 'create.error',
  create_conf:                    PFX + 'create.conf',
  end_label:                      PFX + 'end.label',
  end_select:                     PFX + 'end.select',
  end_intro:                      PFX + 'end.intro',
  delete_label:                   PFX + 'delete.label',
  delete_confirm:                 PFX + 'delete.confirm',
  send_email:                     PFX + 'send.email',
  call_phone:                     PFX + 'call.phone',

  category_label:                 PFX + 'category.label.label',
  category_label_old:             PFX + 'category.label.old',
  category_label_new:             PFX + 'category.label.new',
  category_abbreviation:          PFX + 'category.abbreviation',
  category_helper:                PFX + 'category.helper',
  category_name:                  PFX + 'category.name',
  category_change_label:          PFX + 'category.change.label',
  category_change_helper:         PFX + 'category.change.helper',
  category_change_helper_date:    PFX + 'category.change.helperDate',

  person_edit:                    PFX + 'person.edit',
  person_view:                    PFX + 'person.edit',

  invoice_create_label:           PFX + 'invoice.create.label',
  invoice_create_conf:            PFX + 'invoice.create.conf',
  invoice_edit:                   PFX + 'invoice.edit',
  invoice_upload:                 PFX + 'invoice.upload',
  invoice_download:               PFX + 'invoice.download',
  invoice_paid:                   PFX + 'invoice.paid',
  invoice_delete:                 PFX + 'invoice.delete',

  member_edit:                    PFX + 'member.edit',
  member_state_label:             PFX + 'member.state.label',
  member_state_helper:            PFX + 'member.state.label',

  scsMemberFee_archive_confirm:   PFX + 'scsMemberFee.archive.confirm',
  scsMemberFee_archive_conf:      PFX + 'scsMemberFee.archive.conf',
  scsMemberFee_delete_label:      PFX + 'scsMemberFee.delete.label',
  scsMemberFee_delete_confirm:    PFX + 'scsMemberFee.delete.confirm',
  scsMemberFee_delete_error:      PFX + 'scsMemberFee.delete.error',
  scsMemberFee_delete_conf:       PFX + 'scsMemberFee.delete.conf',
  scsMemberFee_generate_confirm:  PFX + 'scsMemberFee.generate.confirm',
  scsMemberFee_generate_conf:     PFX + 'scsMemberFee.generate.conf',
  scsMemberFee_update_label:      PFX + 'scsMemberFee.update.label',
  scsMemberFee_update_conf:       PFX + 'scsMemberFee.update.conf',
  scsMemberFee_download_enterInvoiceId:     PFX + 'scsMemberFee.download.enterInvoiceId',
  scsMemberFee_upload_label:      PFX + 'scsMemberFee.upload.label',
  scsMemberFee_upload_conf:       PFX + 'scsMemberFee.upload.conf',
  scsMemberFee_upload_noBexioId:  PFX + 'scsMemberFee.upload.noBexioId',
  scsMemberFee_totals_label:      PFX + 'scsMemberFee.totals.label',
  scsMemberFee_export_title:      PFX + 'scsMemberFee.export_title',
  scsMemberFee_list_title:        PFX + 'scsMemberFee.list.title',
  scsMemberFee_list_empty:        PFX + 'scsMemberFee.list.empty',
  scsMemberFee_jb:                PFX + 'scsMemberFee.jb',
  scsMemberFee_jbp:               PFX + 'scsMemberFee.jbp',
  scsMemberFee_entryFee:          PFX + 'scsMemberFee.entryFee',
  scsMemberFee_locker:            PFX + 'scsMemberFee.locker',
  scsMemberFee_skiff:             PFX + 'scsMemberFee.skiff',
  scsMemberFee_skiffInsurance:    PFX + 'scsMemberFee.skiffInsurance',
  scsMemberFee_bev:               PFX + 'scsMemberFee.bev',
  scsMemberFee_rebate:            PFX + 'scsMemberFee.rebate',
  scsMemberFee_total:             PFX + 'scsMemberFee.total',

  memberid_label:                 PFX + 'memberId.label',
  memberid_placeholder:           PFX + 'memberId.placeholder',
  memberid_error:                 PFX + 'memberId.error',
  memberid_helper:                PFX + 'memberId.helper',

  person_details:                 PFX + 'person.details',
  person_address:                 PFX + 'person.address',
  person_misc:                    PFX + 'person.misc',
  person_membership:              PFX + 'person.membership',
  
  firstname_label:                PFX + 'firstname.label',
  firstname_placeholder:          PFX + 'firstname.placeholder',
  firstname_helper:               PFX + 'firstname.helper',

  lastname_label:                 PFX + 'lastname.label',
  lastname_placeholder:           PFX + 'lastname.placeholder',
  lastname_helper:                PFX + 'lastname.helper',

  ssnid_label:                    PFX + 'ssnid.label',
  ssnid_placeholder:              PFX + 'ssnid.placeholder',
  ssnid_helper:                   PFX + 'ssnid.helper',
  ssnid_error:                    PFX + 'ssnid.error',
  
  bexioid_label:                  PFX + 'bexioId.label',
  bexioid_placeholder:            PFX + 'bexioId.placeholder',
  bexioid_helper:                 PFX + 'bexioId.helper',
  bexioid_error:                  PFX + 'bexioid.error',

  abbreviation_label:             PFX + 'memberAbbreviation.label',
  abbreviation_placeholder:       PFX + 'memberAbbreviation.placeholder',
  abbreviation_helper:            PFX + 'memberAbbreviation.helper',

  nickname_label:                 PFX + 'memberNickName.label',
  nickname_placeholder:           PFX + 'memberNickName.placeholder',
  nickname_helper:                PFX + 'memberNickName.helper',

  org_function_label:             PFX + 'orgFunction.label',
  org_function_placeholder:       PFX + 'orgFunction.placeholder',
  org_function_helper:            PFX + 'orgFunction.helper',

  rebate_label:                   PFX + 'rebate.label',
  rebate_placeholder:             PFX + 'rebate.placeholder',
  rebate_helper:                  PFX + 'rebate.helper',
  rebate_reason:                  PFX + 'rebate.reason',

  notes_label:                    PFX + 'notes.label',
  notes_placeholder:              PFX + 'notes.placeholder',
  notes_helper:                   PFX + 'notes.helper',

  email_label:                    PFX + 'email.label',
  email_placeholder:              PFX + 'email.placeholder',

  phone_label:                    PFX + 'phone.label',
  phone_placeholder:              PFX + 'phone.placeholder',

  streetname_label:               PFX + 'streetname.label',
  streetname_placeholder:         PFX + 'streetname.placeholder',
  streetname_error:               PFX + 'streetname.error',
  streetname_helper:              PFX + 'streetname.helper',

  streetnumber_label:             PFX + 'streetnumber.label',
  streetnumber_placeholder:       PFX + 'streetnumber.placeholder',
  streetnumber_error:             PFX + 'streetnumber.error',
  streetnumber_helper:            PFX + 'streetnumber.helper',

  countrycode_label:              PFX + 'countrycode.label',
  countrycode_placeholder:        PFX + 'countrycode.placeholder',
  countrycode_error:              PFX + 'countrycode.error',
  countrycode_helper:             PFX + 'countrycode.helper',

  zipcode_label:                  PFX + 'zipcode.label',
  zipcode_placeholder:            PFX + 'zipcode.placeholder',
  zipcode_error:                  PFX + 'zipcode.error',
  zipcode_helper:                 PFX + 'zipcode.helper',

  city_label:                     PFX + 'city.label',
  city_placeholder:               PFX + 'city.placeholder',
  city_error:                     PFX + 'city.error',
  city_helper:                    PFX + 'city.helper',

  web_label:                      PFX + 'web.label',
  web_placeholder:                PFX + 'web.placeholder',
  web_helper:                     PFX + 'web.helper',
  web_error:                      PFX + 'web.error',

  dateOfEntry_label:              PFX + 'dateOfEntry.label',
  dateOfEntry_placeholder:        PFX + 'dateOfEntry.placeholder',
  dateOfEntry_helper:             PFX + 'dateOfEntry.helper',

  dateOfExit_label:               PFX + 'dateOfExit.label',
  dateOfExit_placeholder:         PFX + 'dateOfExit.placeholder',
  dateOfExit_helper:              PFX + 'dateOfExit.helper',

  dateOfChange_label:             PFX + 'dateOfChange.label',
  dateOfChange_placeholder:       PFX + 'dateOfChange.placeholder',
  dateOfChange_helper:            PFX + 'dateOfChange.helper',

  dateOfBirth_label:             PFX + 'dateOfBirth.label',
  dateOfBirth_placeholder:       PFX + 'dateOfBirth.placeholder',
  dateOfBirth_helper:            PFX + 'dateOfBirth.helper',

  dateOfDeath_label:             PFX + 'dateOfDeath.label',
  dateOfDeath_placeholder:       PFX + 'dateOfDeath.placeholder',
  dateOfDeath_helper:            PFX + 'dateOfDeath.helper',

  key:                            '@key',
  select:                         '@select.label',
  search:                         '@search.label',
  as_title:                       '@actionsheet.title',
  name:                           '@name',
  phone:                          '@phone',
  email:                          '@email',
  ok:                             '@ok',
  cancel:                         '@cancel',
  save:                           '@save.label',

} satisfies Record<string, string>;

export type MembershipI18n = { [K in keyof typeof MEMBERSHIP_I18N_KEYS]: Signal<string> };

export const _MembershipStore = signalStore(
  withState(initialState),
  withProps(() => ({
    membershipService: inject(MembershipService),
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    alertController: inject(AlertController),
    router: inject(Router),
    personService: inject(PersonService),
    addressService: inject(AddressService),
    taskService: inject(TaskService),
    ownershipService: inject(OwnershipService),
    matrixService: inject(MatrixChatService),
    activityService: inject(ActivityService),
    personEditModalClass: inject(PERSON_EDIT_MODAL, { optional: true }),
    i18nService: inject(I18nService)
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(MEMBERSHIP_I18N_KEYS),

    // all memberships of this tenant
    allMembershipsResource: rxResource({  
      params: () => ({
        currentUser: store.appStore.currentUser(),
        version: store.version()
      }),
      stream: ({params}) => {
        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, getSystemQuery(store.appStore.tenantId()), 'memberName2', 'asc').pipe(
          debugListLoaded('MembershipStore.allMemberships', params.currentUser)
        );
      },
    }),
      // Loads all ownerships for a given member (if it is a person)
    ownershipsOfMemberResource: rxResource({
      params: () => ({
        member: store.member(),
        modelType: store.modelType()
      }),
      stream: ({params}) => {
        if (!params.member || !params.modelType || params.modelType !== 'person') return of([]);

        // Query ownerships where ownerKey == memberKey and ownerModelType == 'person'
        return store.firestoreService.searchData<OwnershipModel>(
          OwnershipCollection,
          [
            { key: 'ownerKey', operator: '==', value: params.member.bkey },
            { key: 'ownerModelType', operator: '==', value: 'person' },
            { key: 'state', operator: '==', value: 'active' },
            { key: 'tenants', operator: 'array-contains', value: store.appStore.tenantId() }
          ],
          'resourceName',
          'asc'
        );
      },
    }),
  })),

  withComputed((state) => {
    return {
      // all memberships, either only the current ones or all that ever existed (based on showOnlyCurrent)
      allMemberships: computed(() => state.showOnlyCurrent() ? 
        state.allMembershipsResource.value()?.filter(m => isAfterDate(m.dateOfExit, getTodayStr(DateFormat.StoreDate))) ?? [] : 
        state.allMembershipsResource.value()?.filter(m => m.relIsLast === true) ?? []),
      defaultMcat: computed(() => state.appStore.getCategory('mcat_default')),
      ownershipsOfMember: computed(() => state.ownershipsOfMemberResource.value() ?? []),
    };
  }),

  withComputed((state) => {
    return {
      // members of a given org or group (if orgId is set), otherwise []
      members: computed(() => { 
        return state.allMemberships()?.filter((membership: MembershipModel) => 
          membership.orgKey === state.orgId() &&
          membership.orgModelType === state.orgType()
        ) ?? []
      }),

      // memberships of the current member 
      memberships: computed(() => {
        if (!state.member() || !state.modelType) return [];
        return state.allMemberships()?.filter((membership: MembershipModel) => 
          membership.memberKey === state.member()?.bkey && 
          membership.memberModelType === state.modelType()) ?? []
      }),

      org: computed(() => state.orgType() === 'org' ? state.appStore.getOrg(state.orgId()) : undefined),
      group: computed(() => state.orgType() === 'group' ? state.appStore.getGroup(state.orgId()) : undefined),
      currentUser: computed(() => state.appStore.currentUser()),
      genders: computed(() => state.appStore.getCategory('gender')),
      privacySettings: computed(() => state.appStore.privacySettings()),
      orgTypes: computed(() => state.appStore.getCategory('org_type')),
      tenantId: computed(() => state.appStore.tenantId()),
    };   
  }),

  withComputed((state) => {
    return {
      orgName: computed(() => state.org()?.name ?? ''),
      groupsOfMember: computed(() => getGroupsOfMember(state.memberships(), state.member()?.bkey) ?? []),

      membershipCategoryKey: computed(() => {
        if (state.orgType() === 'group') return undefined;
        const org = state.org() as OrgModel | undefined;
        return org?.membershipCategoryKey ?? 'mcat_default';
      }),

      personMembers: computed(() => state.members().filter((membership: MembershipModel) =>
        membership.memberModelType === 'person') ?? []),

      orgMembers: computed(() => state.members().filter((membership: MembershipModel) =>
        membership.memberModelType === 'org') ?? []),

      appliedMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.state === "applied") ?? []),

      activeMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.state === "active") ?? []),

      passiveMembers: computed(() => state.members()?.filter((membership: MembershipModel) => 
        membership.memberModelType === 'person' && membership.state === "passive") ?? []),

      cancelledMembers: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.relIsLast === true &&
        isAfterOrEqualDate(getTodayStr(DateFormat.StoreDate), membership.dateOfExit) &&
        membership.state === "cancelled") ?? []),

      deceasedMembers: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) => 
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.memberDateOfDeath.length > 0) ?? []),

      entries: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() && 
        membership.memberModelType === 'person' &&
        membership.order === 1 && 
        isAfterOrEqualDate(state.selectedYear() + '1231', membership.dateOfEntry)) ?? []),

      exits: computed(() => state.allMembershipsResource.value()?.filter((membership: MembershipModel) =>
        membership.orgKey === state.orgId() &&
        membership.memberModelType === 'person' &&
        membership.relIsLast === true && 
        isAfterOrEqualDate(state.selectedYear() + '1231', membership.dateOfExit)) ?? []),
    };
  }),

  withComputed((state) => {
    return {
      membershipCategory: computed<CategoryListModel>(() => {
        const key = state.membershipCategoryKey();
        return key ? (state.appStore.getCategory(key) ?? state.defaultMcat()) : state.defaultMcat();
      }),
      groupsCount: computed(() => state.groupsOfMember().length),
      defaultOrg: computed(() => state.org()),
      currentPerson : computed(() => state.appStore.currentPerson()),
      
      isLoading: computed(() => 
        state.allMembershipsResource.isLoading() || 
        state.appStore.orgsResource.isLoading()
      ),

      // all members (= orgs and persons)
      membersCount: computed(() => state.members().length), 
      filteredMembers: computed(() => 
        state.members()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // person members
      personsCount: computed(() => state.personMembers().length), 
      filteredPersons: computed(() => {
        return state.personMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.category, state.selectedMembershipCategory()) &&
          nameMatches(membership.memberType, state.selectedGender(), true) &&
          chipMatches(membership.tags, state.selectedTag()))
      }
      ),

      // all orgs
      orgsCount: computed(() => state.orgMembers().length), 
      filteredOrgs: computed(() => 
        state.orgMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedOrgType()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // applied memberships
      appliedCount: computed(() => state.appliedMembers().length), 
      filteredApplied: computed(() => 
        state.appliedMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // active memberships
      activeCount: computed(() => state.activeMembers().length), 
      filteredActive: computed(() => 
        state.activeMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.category, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // passive memberships
      passiveCount: computed(() => state.passiveMembers().length), 
      filteredPassive: computed(() => 
        state.passiveMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),
      
      // cancelled memberships
      cancelledCount: computed(() => state.cancelledMembers().length), 
      filteredCancelled: computed(() => 
        state.cancelledMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          nameMatches(membership.category, state.selectedMembershipCategory()) &&
          memberTypeMatches(membership, state.selectedGender()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // deceased members
      deceasedCount: computed(() => state.deceasedMembers().length), 
      filteredDeceased: computed(() => 
        state.deceasedMembers()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          yearMatches(membership.memberDateOfDeath, state.selectedYear()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // entries
      entriesCount: computed(() => state.entries().length), 
      filteredEntries: computed(() => 
        state.entries()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          yearMatches(membership.dateOfEntry, state.selectedYear()) &&
          chipMatches(membership.tags, state.selectedTag()))
      ),

      // entries
      exitsCount: computed(() => state.exits().length), 
      filteredExits: computed(() => 
        state.exits()?.filter((membership: MembershipModel) => 
          nameMatches(membership.index, state.searchTerm()) &&
          yearMatches(membership.dateOfExit, state.selectedYear()) &&
          chipMatches(membership.tags, state.selectedTag()))
      )
    }
  }),

  withMethods((store) => {

    return {
      refreshData() {
        patchState(store, { version: store.version() + 1 });
      },

      /******************************** setters (filter) ******************************************* */
      setOrgId(orgId?: string, orgType: 'org' | 'group' = 'org') {
        if (!orgId) orgId = store.appStore.defaultOrg()?.bkey;
        // Only reset filters if orgId actually changed
        if (store.orgId() !== orgId) {
          patchState(store, { 
            orgId,
            orgType,
            searchTerm: '',
            selectedTag: '',
            selectedMembershipCategory: 'all',
            selectedGender: 'all',
            selectedOrgType: 'all'
          });
        }
      },

      setListId(listId: string) {
        patchState(store, { listId });
      },

      resetFilters() {
        patchState(store, {
          searchTerm: '',
          selectedTag: '',
          selectedMembershipCategory: 'all',
          selectedYear: parseInt(getTodayStr(DateFormat.Year)),
          selectedGender: 'all',
          selectedOrgType: 'all'
        });
      },

      setYearField(yearField: 'dateOfEntry' | 'dateOfExit') {
        patchState(store, { yearField });
      },
      
      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelectedMembershipCategory(selectedMembershipCategory: string) {
        patchState(store, { selectedMembershipCategory });
      },

      setSelectedYear(selectedYear: number) {
        patchState(store, { selectedYear });
      },

      setSelectedGender(selectedGender: string) {
        patchState(store, { selectedGender });
      },

      setSelectedOrgType(selectedOrgType: string) {
        patchState(store, { selectedOrgType });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setMember(member: PersonModel | OrgModel | GroupModel, modelType: 'person' | 'org' | 'group'): void {
        patchState(store, { member, modelType });
      },

      setShowMode(showOnlyCurrent: boolean) {
        patchState(store, { showOnlyCurrent });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('membership');
      },

      getEmail(membership: MembershipModel): string | undefined {
        const person = store.appStore.getPerson(membership.memberKey);
        if (person) {
          return person.favEmail;
        }
      },

      getPhone(membership: MembershipModel): string | undefined {
        const person = store.appStore.getPerson(membership.memberKey);
        if (person) {
          return person.favPhone;
        }
      },

      /******************************** actions ******************************************* */
      /**
       * Show a modal to add a new membership. The current org from the membership store is used as default org.
       * Initially, the modal proposes to add the current person as member to the default org.
       * @param readOnly whether the membership is added in readOnly mode (no editing possible)
       */
      async add(readOnly = true): Promise<void> {
        if (readOnly) { console.log('MembershipStore.add: readOnly mode.'); return; }
        const member = store.member() ?? store.appStore.currentPerson();
        const org = store.org();
        if (!member) { console.log('MembershipStore.add: no member.'); return; }
        if (!org) { console.log('MembershipStore.add: no org.'); return; }
        this.setOrgId(org.bkey);
        const membership = convertMemberAndOrgToMembership(member, PersonModelName, org, OrgModelName, store.tenantId());
        this.edit(membership, readOnly, true);
      },

      /**
       * Add a person to a given group as a member.
       * First shows a person select modal so the user can pick any person.
       * The group stays fix.
       * @param group
       * @param readOnly
       * @returns
       */
      async addMemberToGroup(group: GroupModel, readOnly = true): Promise<void> {
        if (readOnly) { console.log('MembershipStore.addMemberToGroup: readOnly mode.'); return; }
        const modal = await store.modalController.create({
          component: PersonSelectModal,
          cssClass: 'list-modal',
          componentProps: {
            selectedTag: '',
            currentUser: store.currentUser(),
          },
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role !== 'confirm') return;
        if (!isPerson(data, store.tenantId())) { console.log('MembershipStore.addMemberToGroup: no valid person selected.'); return; }
        const member = data as PersonModel;
        const memberAvatar = getAvatarInfo(member, 'person');
        const groupAvatar = getAvatarInfo(group, 'group');
        if (memberAvatar && groupAvatar && await store.membershipService.isMemberOf(memberAvatar, groupAvatar)) {
          await showToast(store.toastController, store.i18n.create_alreadyMember());
          return;
        }
        const membership = convertMemberAndOrgToMembership(member, PersonModelName, group, GroupModelName, store.tenantId());
        this.edit(membership, readOnly, true);
      },

      /**
       * Show a modal to create a new person and add it as member to the current org. 
       * The current org from the membership store is used as default org in the person creation modal.
       */
      async addNewMember(): Promise<void> {
        const tenantId = store.tenantId();
        const modal = await store.modalController.create({
          component: MemberNewModal,
          componentProps: {
            currentUser: store.currentUser(),
            mcat: store.membershipCategory(),
            tags: this.getTags(),
            tenantId,
            genders: store.genders(),
            org: store.org() 
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) {
          const newMember = data as MemberNewFormModel;
          if (store.personService.checkIfExists(store.appStore.allPersons(), newMember.firstName, newMember.lastName)) {
            if (!confirm(store.alertController, store.i18n.create_alreadyMember(), store.i18n.ok(), store.i18n.cancel(), true)) return;           
          }

          const personKey = await store.personService.create(convertFormToNewPerson(newMember, tenantId), store.currentUser());
          const avatarKey = `person.${personKey}`;
          if (newMember.email.length > 0) {
            this.saveAddress(convertNewMemberFormToEmailAddress(newMember, tenantId), avatarKey);
          }
          if (newMember.phone.length > 0) {
            this.saveAddress(convertNewMemberFormToPhoneAddress(newMember, tenantId), avatarKey);
          }
          if (newMember.web.length > 0) {
            this.saveAddress(convertNewMemberFormToWebAddress(newMember, tenantId), avatarKey);
          }
          if (newMember.city.length > 0) {
            this.saveAddress(convertNewMemberFormToPostalAddress(newMember, tenantId), avatarKey);
          }
          if (newMember.orgKey.length > 0 && newMember.category.length > 0) {
            await this.saveMembership(newMember, personKey);
          }
          this.refreshData();
        }
      },

        /**
       * Add the membership to the new person and make it a member.
       * We do not want to use MembershipService.create() in order to avoid the dependency to the membership module
       * @param vm  the form data for a new member
       * @param personKey the key of the newly created person
       */
      async saveMembership(vm: MemberNewFormModel, personKey?: string): Promise<string | undefined> {
        if (!personKey || personKey.length === 0) {
          console.warn('MembershipStore.saveMembership: personKey is empty, cannot save membership');
          return undefined;
        }
        const mcatAbbreviation = getCatAbbreviation(store.membershipCategory(), vm.category);
        const membership = convertNewMemberFormToMembership(vm, personKey, store.tenantId(), mcatAbbreviation);
        membership.index = 'mn:' + membership.memberName1 + ' ' + membership.memberName2 + ' mk:' + membership.memberKey + ' ok:' + membership.orgKey;
        return await store.firestoreService.createModel<MembershipModel>(MembershipCollection, membership, store.i18n.create_conf(), store.i18n.create_error(), store.appStore.currentUser());
      },

      saveAddress(address: AddressModel, avatarKey: string): void {
        address.parentKey = avatarKey;
        store.addressService.create(address, store.currentUser());
      },

      /**
       * Show a modal to edit an existing membership.
       * @param membership the membership to edit
       */
      async edit(membership?: MembershipModel, readOnly = true, isNew = false): Promise<void> {
        if (!membership) return;

        const modal = await store.modalController.create({
          component: MembershipEditModal,
          componentProps: {
            membership,
            currentUser: store.currentUser(),
            tags: this.getTags(),
            isNew,
            priv: store.privacySettings(),
            mcat: store.membershipCategory(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          if (isMembership(data, store.tenantId())) {
            const mcatAbbreviation = getCatAbbreviation(store.membershipCategory(), data.category);
            data.relLog = getRelLogEntry(data.dateOfEntry, mcatAbbreviation);
            if (!data.bkey) {
              // create new membership
              store.membershipService.create(data, store.currentUser());
              if (data.orgModelType === OrgModelName) { // do not add a task for a group membership
                // create a task for the treasurer
                const memberName = getFullName(data.memberName1, data.memberName2);
                await this.addTask(data, store.appStore.getGroup('treasurer'), `Neumitglied ${memberName} -> bitte Gebühren prüfen.`);
              }
              if (data.orgModelType === GroupModelName && data.memberModelType === PersonModelName) {
                // invite the new member to the group's Matrix chat room
                try {
                  await store.matrixService.inviteToGroupRoom(data.orgKey, data.memberKey);
                } catch (err) {
                  console.warn('MembershipStore.edit: Could not invite to group chat:', err);
                }
              }
            } else { // update existing membership
              store.membershipService.update(data, store.currentUser());
            }
          }
        }
        this.refreshData();
      },

      /**
         * Ask user for the end date of an existing membership and end it.
         * We do not archive memberships as we want to make them visible for entries & exits.
         * Therefore, we end an membership by setting its validTo date.
         * @param membership the membership to delete
         */
      async end(membership: MembershipModel, endDate?: string, readOnly = true): Promise<void> {
        if (!membership || readOnly) return;
        if (!endDate) {
          endDate =  await selectDate(store.modalController, getTodayStr(DateFormat.IsoDate), '@membership.operation.end.select', '@membership.operation.end.intro');
        }
        if (!endDate) { 
          warn('MembershipStore.end: no end date selected, cannot end membership');
          return;
        }
        const sDate = convertDateFormatToString(endDate.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate, false);
        await store.membershipService.endMembershipByDate(membership, sDate, store.currentUser());
        if (membership.orgModelType === GroupModelName && membership.memberModelType === PersonModelName) {
          // remove the member from the group's Matrix chat room
          try {
            await store.matrixService.kickFromGroupRoom(membership.orgKey, membership.memberKey);
            void store.activityService.log('chat', 'kickfromgroup', store.currentUser(), `SUCCESS: ${membership.memberKey} from ${membership.orgKey}`);

          } catch (err) {
            console.warn('MembershipStore.end: Could not kick from group chat:', err);
            void store.activityService.log('chat', 'kickfromgroup', store.currentUser(), `ERROR: ${membership.memberKey} from ${membership.orgKey}`);
          }
        }
        const memberName = getFullName(membership.memberName1, membership.memberName2);
        const ownerships = store.ownershipsOfMember();
        if (ownerships.length > 0) {
          await this.addTask(membership, store.appStore.getGroup('resourceAdmin'), `${memberName} ist ausgetreten -> bitte Schlüssel und/oder Chäschtli prüfen.`);
        } else {
          debugMessage('MembershipStore.end: no ownerships found for member, no task needed for resourceAdmin', store.currentUser());
        }
        await this.addTask(membership, store.appStore.getGroup('treasurer'), `${memberName} ist ausgetreten -> bitte Gebühren prüfen.`);
      },

      /**
       * Adds a new task to a group membership. 
       * The task is assigned to the group and the author is the current user. 
       * The task is initially assigned to the mainContact of the group resourceAdmin.
       * If the mainContact does not exist, the author is assigned, but can be changed in the task edit modal.
       * This is currently only implemented for memberships in Seeclub Stäfa (bkey = 'scs').
       * @param membership the membership for which to create the task. We need the membership to get the group (org) for which the task is created and to check if it is a SCS membership.
       * @param group the group to which the task is assigned.
       * @param name the name of the task to create. It should contain all relevant information about the reason for creating the task, so that the responsible person can directly act on it without having to look up additional information.
       * @returns 
       */
      async addTask(membership: MembershipModel, group?: GroupModel, name?: string): Promise<void> {
        await store.taskService.addTaskFromGroupMembership(membership, group, name, store.currentUser());
      },

      /**
       * Creates a direct message room between the current user and the given member (membership.memberKey)
       * Opens the Chat Page and preselects this room.
       * @param membership the membership represents the other end of the direct chat.
       * 
       */
      async chat(membership: MembershipModel): Promise<void> {
        try {
          const room = await store.matrixService.createDirectRoom(membership.memberKey);
          void store.activityService.log('chat', 'createdirect', store.currentUser(), `SUCCESS: ${membership.memberKey}`);
          await navigateByUrl(store.router, '/private/chat/c-contentpage', { selectedRoom: room.roomId });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Could not start chat';
          void store.activityService.log('chat', 'createdirect', store.currentUser(), `ERROR: ${membership.memberKey} ${msg}`);
          await showToast(store.toastController, msg);
        }
      },

      async isPersonUser(personKey: string): Promise<boolean> {
        return store.firestoreService.isPersonUser(personKey);
      },

      async changeMembershipCategory(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (readOnly || !membership) return;
        this.setOrgId(membership.orgKey);
        const membershipCategory = store.membershipCategory();
        if (membershipCategory) {
          const modal = await store.modalController.create({
            component: CategoryChangeModal,
            componentProps: {
              membership,
              membershipCategory,
              currentUser: store.currentUser()
            }
          });
          modal.present();
          const { data, role } = await modal.onDidDismiss();
          if (role === 'confirm' && data !== undefined) {   // result is vm: CategoryChangeFormModel
            await store.membershipService.saveMembershipCategoryChange(membership, data, membershipCategory, store.currentUser());
            if (data.membershipCategoryNew === 'passive') {
              const memberName = getFullName(membership.memberName1, membership.memberName2);
              const ownerships = store.ownershipsOfMember();
              if (ownerships.length > 0) {
                await this.addTask(membership, store.appStore.getGroup('resourceAdmin'), `${memberName} wechselt auf Passiv. Bitte Schlüssel und/oder Chäschtli prüfen.`);
              } else {
                debugMessage('MembershipStore.changeMembershipCategory: no ownerships found for member, no task needed for resourceAdmin', store.currentUser());
              }
              await this.addTask(membership, store.appStore.getGroup('treasurer'), `${memberName} wechselt auf Passiv. Bitte Gebühren prüfen.`);
            }
          }
          this.refreshData();
        }
      },


      async export(type: string, memberships: MembershipModel[]): Promise<void> {
        let keys: (keyof MembershipModel)[] = [];
        const table: string[][] = [];
        const fn = generateRandomString(10) + '.' + ExportFormats[ExportFormat.XLSX].abbreviation;
        let tableName = '';

        // Batch-load all favorite postal addresses once for all export types
        const postalQuery = getSystemQuery(store.tenantId());
        postalQuery.push({ key: 'addressChannel', operator: '==', value: 'postal' });
        postalQuery.push({ key: 'isFavorite', operator: '==', value: true });
        const allPostal = await firstValueFrom(store.firestoreService.searchData<AddressModel>(AddressCollection, postalQuery));
        const postalByPersonKey = new Map<string, AddressModel>();
        for (const a of allPostal) {
          if (a.parentKey?.startsWith('person.')) {
            postalByPersonKey.set(a.parentKey.substring('person.'.length), a);
          }
        }

        switch(type) {
          case 'raw':
            keys = Object.keys(new MembershipModel(store.appStore.tenantId())) as (keyof MembershipModel)[];
            table.push(keys);
            tableName = 'Rohdaten Mitgliedschaften';
            break;
          case 'srv':
            table.push(['Clubname', 'MGRART_Titel', 'Beitrag', 'LastName', 'FirstName', 'SrvId', 'Birthday', 'Street', 'Postcode', 'City', 'Mobile', 'Email', 'Funktion', 'Kommentar']);
            this.exportSrv(table, postalByPersonKey);
            exportXlsx(table, fn, 'SRV Mitgliedschaften');
            return;
          case 'address':
            table.push(['Vorname', 'Name', 'Strasse', 'PLZ', 'Ort', 'Tel', 'E-Mail']);
            for (const member of memberships) {
              const person = store.appStore.getPerson(member.memberKey);
              if (!person) continue;
              table.push(convertToAddressDataRow(person, postalByPersonKey.get(member.memberKey)));
            }
            exportXlsx(table, fn, 'Adressliste');
            return;
          case 'clubdesk':
            table.push(['Vorname', 'Nachname', 'Geschlecht', 'Anrede', 'Adresse', 'Ort', 'PLZ', 'Land', 'E-Mail', 'Telefon', 'Geburtsdatum', 'Eintritt', 'BexioId', 'Kategorie', 'Status', 'Funktion', 'RelLog']);
            for (const member of memberships) {
              const person = store.appStore.getPerson(member.memberKey);
              if (!person) continue;
              table.push(convertToClubdeskImportRow(member, person, postalByPersonKey.get(member.memberKey)));
            }
            exportXlsx(table, fn, 'Clubdesk Import');
            return;
          case 'member':
            keys = ['memberId', 'memberName1', 'memberName2', 'memberDateOfBirth', 'dateOfEntry', 'memberCategory', 'orgFunction'] as (keyof MembershipModel)[];
            table.push(['Mitgliedschafts-Nr', 'Vorname', 'Name', 'GebDatum', 'Eintrittsdatum', 'Kategorie', 'Funktion']);
            tableName = 'Mitglieder';
            break;
          default:
            console.error(`MembershipStore.export: unknown export type ${type}`);
            return;
        }
        for (const member of memberships) {
          table.push(getDataRow<MembershipModel>(member, keys));
        }
        exportXlsx(table, fn, tableName);
      },

      exportSrv(table: string[][], postalByPersonKey: Map<string, AddressModel>): void {
        // hardcoded and not considering any current membership filters.
        // That's why it can be used from any membership (SCS, SRV, other).
        // Get all persons
        const persons = store.appStore.allPersons();
        // Get all memberships (stateless)
        const allMemberships = store.allMembershipsResource.value() ?? [];
        for (const person of persons) {
          // Current SCS membership (active, orgKey = SCS org, memberModelType = 'person')
          const currentScs = allMemberships.find(m => m.memberKey === person.bkey && m.orgKey === 'scs' && m.state === 'active' && m.dateOfExit === END_FUTURE_DATE_STR);
          // SCS exit in last year
          const lastYear = (new Date()).getFullYear() - 1;
          const lastYearExit = allMemberships.find(m => m.memberKey === person.bkey && m.orgKey === 'scs' && m.dateOfExit?.startsWith(lastYear.toString()));

          // Current SRV membership (active, orgKey = SRV org, memberModelType = 'person')
          const currentSrv = allMemberships.find(m => m.memberKey === person.bkey && m.orgKey === 'srv' && m.state === 'active' && m.dateOfExit === END_FUTURE_DATE_STR);

          // we export a row for each person with a current SCS membership or an exit in the last year or a current SRV membership
          if (currentScs || currentSrv) {
            table.push(convertToSrvDataRow(person, currentScs, lastYearExit, currentSrv, postalByPersonKey.get(person.bkey)));
          }
        }
      },

      async delete(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!membership || readOnly) return;
        const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (result === true) {
          await store.membershipService.delete(membership);
          this.refreshData();  
        }
      },

      // persons, orgs, active, applied, passive, cancelled, deceased, entries, exits, all, memberships
      async copyEmailAddresses(listId: string, readOnly = true): Promise<void> {
        const persons = store.appStore.allPersons();
        let filteredMemberships: MembershipModel[] = [];
        switch (listId) {
          case 'persons': filteredMemberships = store.filteredPersons() ?? []; break;
          case 'orgs': filteredMemberships = store.filteredOrgs() ?? []; break;
          case 'active': filteredMemberships = store.filteredActive(); break;
          case 'applied': filteredMemberships = store.filteredApplied(); break;
          case 'passive': filteredMemberships = store.filteredPassive(); break;
          case 'cancelled': filteredMemberships = store.filteredCancelled(); break;
          case 'deceased': filteredMemberships = store.filteredDeceased(); break;
          case 'entries': filteredMemberships = store.filteredEntries(); break;
          case 'exits': filteredMemberships = store.filteredExits(); break;
          case 'all':
          case 'memberships': filteredMemberships = store.filteredMembers() ?? []; break;
        }

        const memberKeySet = new Set(filteredMemberships.map(m => m.memberKey));
        const filteredPersons = persons.filter(p => p.bkey && memberKeySet.has(p.bkey));

        const mainEmails = getMainEmailAddresses(filteredPersons);

        const ccQuery = getSystemQuery(store.tenantId());
        ccQuery.push({ key: 'addressChannel', operator: '==', value: 'email' });
        ccQuery.push({ key: 'isCc', operator: '==', value: true });
        const allCcAddresses = await firstValueFrom(store.firestoreService.searchData<AddressModel>(AddressCollection, ccQuery, 'none'));
        const ccEmails = getCcEmailAddresses(filteredPersons, allCcAddresses);

        const modal = await store.modalController.create({
          component: EmailAddressesModal,
          componentProps: { mainEmails, ccEmails, canChange: !readOnly }
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ memberKey: string; readOnly: boolean }>();
        if (role === 'navigate' && data?.memberKey) {
          const person = store.appStore.getPerson(data.memberKey);
          if (!person || !store.personEditModalClass) return;
          const personModal = await store.modalController.create({
            component: store.personEditModalClass,
            componentProps: {
              person,
              currentUser: store.currentUser(),
              tags: store.appStore.getTags(PersonModelName),
              tenantId: store.tenantId(),
              genders: store.genders(),
              readOnly: data.readOnly
            }
          });
          personModal.present();
          const { data: personData, role: personRole } = await personModal.onDidDismiss();
          if (personRole === 'confirm' && personData && !data.readOnly) {
            await store.personService.update(personData, store.currentUser());
          }
        }
      },

      async editPerson(membership?: MembershipModel, readOnly = true): Promise<void> {
        if (!membership) return;
        const person = store.appStore.getPerson(membership.memberKey);
        if (!person || !store.personEditModalClass) return;
        const modal = await store.modalController.create({
          component: store.personEditModalClass,
          componentProps: {
            person,
            currentUser: store.currentUser(),
            tags: store.appStore.getTags(PersonModelName),
            tenantId: store.tenantId(),
            genders: store.genders(),
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data && !readOnly) {
          await store.personService.update(data, store.currentUser());
        }
      },

      async copy(value: string, label: string): Promise<void> {
        await copyToClipboardWithConfirmation(store.toastController, value ?? '', label);
      },

      async sendEmail(membership: MembershipModel): Promise<void> {
        const email = this.getEmail(membership);
        if (email) {
          return await browseUrl(`mailto:${email}`, '');
        }
      },

      async call(membership: MembershipModel): Promise<void> {
        const phone = this.getPhone(membership);
        if (phone) {
          return await browseUrl(`tel:${phone}`, '');
        }
      },

      async createInvoice(membership: MembershipModel): Promise<void> {
        const modal = await store.modalController.create({
          component: InvoiceNewModal,
          cssClass: 'wide-modal',
          componentProps: { 
            membership 
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<{ id: string }>();
        if (role === 'confirm' && data) {
          await showToast(store.toastController, `@finance.invoice.operation.create.conf`);
        }
      }
    }
  }),
);


@Injectable({
  providedIn: 'root'
})
export class MembershipStore extends _MembershipStore {
  constructor() {
    super();
  }
}