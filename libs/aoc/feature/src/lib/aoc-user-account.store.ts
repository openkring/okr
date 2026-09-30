import { computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { from } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { authState } from 'rxfire/auth';
import { Router } from '@angular/router';

import { FirestoreService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { MembershipCollection, MembershipModel, UserModel } from '@okr/shared-models';
import { DateFormat, debugListLoaded, fill, getAge, getFullName, getSystemQuery, getTodayStr, isAfterDate } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { AUTH } from '@okr/shared-config';
import { confirm, error, navigateByUrl, notify, showToast } from '@okr/shared-util-angular';

import { AuthService } from '@okr/auth-data-access';
import { UserService } from '@okr/user-data-access';
import { PersonService } from '@okr/subject-person-data-access';
import { PersonEditModal } from '@okr/subject-person-feature';
import { findLoginEmailHolder, isMinorAge, AOC_I18N_KEYS } from '@okr/aoc-util';
import { isSyntheticLoginEmail, isValidLoginId, normalizeLoginIdInput } from '@okr/user-util';

export type FirebaseAuthUser = {
  uid: string;
  email: string | undefined;
  displayName: string | undefined;
  disabled: boolean;
  emailVerified: boolean;
  creationTime: string | undefined;
  lastSignInTime: string | undefined;
};

export type UserAccount = {
    hasFirebaseAccount: boolean,
    hasBkAccount: boolean,
    hasMembership: boolean,
    firstName: string,
    lastName: string,
    loginEmail: string,
    loginId: string,
    personKey: string,
    uid: string,
    index: string
};

/** What syncPersonAccount({ action: 'open' }) hands back — openAccount's result (spec 1.71 §5.3). */
type OpenAccountResponse = {
  ok: boolean;
  outcome?: 'created' | 'createdWithLoginId' | 'exists' | 'noEmail' | 'noPerson';
  uid?: string;
  loginEmail?: string;
  loginId?: string;
};

function callable<Req, Res>(name: string) {
  return httpsCallable<Req, Res>(getFunctions(getApp(), 'europe-west6'), name);
}

/** The Firebase error code of a failed callable, without the 'functions/' prefix. */
function callableErrorCode(ex: unknown): string {
  return String((ex as { code?: string })?.code ?? '').replace(/^functions\//, '');
}

export type AocUserAccountState = {
  searchTerm: string | undefined;
};

export const initialState: AocUserAccountState = {
  searchTerm: undefined,
};

export const AocUserAccountStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    router: inject(Router),
    firestoreService: inject(FirestoreService),
    fbUser: toSignal(authState(inject(AUTH))),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    authService: inject(AuthService),
    userService: inject(UserService),
    personService: inject(PersonService),
    i18nService: inject(I18nService)
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),

    usersResource: rxResource({
      // the resource will reload whenever the fbUser changes (login/logout).
      params: () => store.fbUser(),
      stream: () => {
        // We need the users of ALL tenants here (to tell "no BK account anywhere" apart from
        // "BK account in another tenant"). A client-side cross-tenant list on /users is denied by
        // the Firestore rules, so we read them through an admin-only Cloud Function (Admin SDK).
        const fn = httpsCallable<void, { users: UserModel[] }>(getFunctions(getApp(), 'europe-west6'), 'listBkUsers');
        return from(fn().then(result => result.data.users));
      }
    }),
    activeMembersResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        defaultOrg: store.appStore.defaultOrg()
      }),
      stream: ({params}) => {
        const orgKey = params.defaultOrg?.okey;
        if (!orgKey) return store.firestoreService.searchData<MembershipModel>(MembershipCollection, [], 'memberName2', 'asc').pipe(
          debugListLoaded('MembershipStore.activeMembers (no org)', params.currentUser)
        );
        const query = getSystemQuery(store.appStore.tenantId());
        query.push({ key: 'orgKey', operator: '==', value: orgKey });
        query.push({ key: 'state', operator: '==', value: 'active' });
        query.push({ key: 'memberModelType', operator: '==', value: 'person' });
        query.push({ key: 'relIsLast', operator: '==', value: true });

        return store.firestoreService.searchData<MembershipModel>(MembershipCollection, query, 'memberName2', 'asc').pipe(
          debugListLoaded('MembershipStore.activeMembers', params.currentUser)
        );
      },
    }),    
    firebaseUsersResource: rxResource({
      params: () => store.fbUser(),
      stream: () => {
        const fn = httpsCallable<void, { users: FirebaseAuthUser[] }>(getFunctions(getApp(), 'europe-west6'), 'listFirebaseUsers');
        return from(fn().then(result => result.data.users));
      },
    }),
  })),

  withComputed(state => {
    return {
        activeMembers: computed(() => {
            const activeMembers = state.activeMembersResource.value() ?? [];
            return activeMembers.filter(m => isAfterDate(m.dateOfExit, getTodayStr(DateFormat.StoreDate)))
        }),
        firebaseUsers: computed(() => state.firebaseUsersResource.value() ?? []),
        allUsers: computed(() => state.usersResource.value() ?? []), // of all tenants
    };
  }),

  withComputed(state => {
    return {
      userAccounts: computed((): UserAccount[] => {
        const firebaseUsers = state.firebaseUsers();
        const allUsers      = state.allUsers();
        const activeMembers = state.activeMembers();

        // Fast lookup maps
        const userByUid      = new Map(allUsers.map(u => [u.okey, u]));
        const memberByPerson = new Map(activeMembers.map(m => [m.memberKey, m]));

        const result: UserAccount[] = [];
        const seenUids = new Set<string>();

        // 1. Firebase Auth users (source of truth for accounts)
        for (const fbUser of firebaseUsers) {
          seenUids.add(fbUser.uid);
          const user       = userByUid.get(fbUser.uid);
          const loginEmail = user?.loginEmail ?? fbUser.email ?? '';
          if (!user) {
            result.push({
              uid:                fbUser.uid,
              loginEmail,
              loginId:            '',
              firstName:          '',
              lastName:           '',
              personKey:          '',
              hasFirebaseAccount: true,
              hasBkAccount:       false,
              hasMembership:      false,
              index:              loginEmail.toLocaleLowerCase()
              });
          } else {
            // found a user -> ignore users of other tenants
            if (!user.tenants.includes(state.appStore.tenantId())) continue;
            const membership = user ? memberByPerson.get(user.personKey) : undefined;
            const firstName = user?.firstName  ?? membership?.memberName1 ?? '';
            const lastName = user?.lastName   ?? membership?.memberName2 ?? '';
            const loginId = user?.loginId ?? '';
            result.push({
              uid:                fbUser.uid,
              loginEmail,
              loginId,
              firstName,
              lastName,
              personKey:          user?.personKey  ?? '',
              hasFirebaseAccount: true,
              hasBkAccount:       !!user,
              hasMembership:      !!membership,
              index:              (loginEmail + ' ' + loginId + ' ' + firstName + ' ' + lastName).toLocaleLowerCase()
            });
          }
        }

        // 2. BK users without a Firebase Auth account
        for (const user of allUsers) {
          // ignore users of other tenants
          if (!user.tenants.includes(state.appStore.tenantId())) continue;
          if (seenUids.has(user.okey)) continue;
          seenUids.add(user.okey);
          const membership = memberByPerson.get(user.personKey);
          result.push({
            uid:                user.okey,
            loginEmail:         user.loginEmail,
            loginId:            user.loginId ?? '',
            firstName:          user.firstName,
            lastName:           user.lastName,
            personKey:          user.personKey,
            hasFirebaseAccount: false,
            hasBkAccount:       true,
            hasMembership:      !!membership,
            index:              (user.loginEmail + ' ' + (user.loginId ?? '') + ' ' + user.firstName + ' ' + user.lastName).toLocaleLowerCase()
          });
        }

        // 3. Active members without any account at all
        const accountedPersonKeys = new Set(allUsers.map(u => u.personKey).filter(Boolean));
        console.log('accountedPersonKeys: ', accountedPersonKeys);
        console.log(activeMembers.length + ' active members');
        for (const membership of activeMembers) {
          if (accountedPersonKeys.has(membership.memberKey)) continue;
          result.push({
            uid:                '',
            loginEmail:         '',
            loginId:            '',
            firstName:          membership.memberName1,
            lastName:           membership.memberName2,
            personKey:          membership.memberKey,
            hasFirebaseAccount: false,
            hasBkAccount:       false,
            hasMembership:      true,
            index:              (membership.memberName1 + ' ' + membership.memberName2).toLocaleLowerCase()
          });
        }

        return result;
      }),
    };
  }),


  withComputed(state => {
    return {
      isLoading: computed(() => state.usersResource.isLoading() || state.firebaseUsersResource.isLoading()),
      defaultOrg: computed(() => state.appStore.defaultOrg()),
      currentUser: computed(() => state.appStore.currentUser()),
      filteredAccounts: computed(() => state.userAccounts().filter(a => a.index.includes(state.searchTerm() ?? '')))
    };
  }),

  withMethods(store => {
    return {
      reset() {
        patchState(store, initialState);
        this.reload();
      },

      reload() {
        store.usersResource.reload();
        store.activeMembersResource.reload();
        store.firebaseUsersResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      setSearchTerm(term: string) {
        const searchTerm = term.toLocaleLowerCase();
        patchState(store, { searchTerm });
      },

      /******************************** actions ******************************************* */
      async editPerson(account: UserAccount): Promise<void> {
        if (!account.personKey) return;
        const person = store.appStore.getPerson(account.personKey);
        if (!person) return;
          const modal = await store.modalController.create({
          component: PersonEditModal,
          componentProps: {
            person,
            currentUser: store.appStore.currentUser(),
            tags: store.appStore.getTags('person'),
            tenantId: store.appStore.tenantId(),
            genders: store.appStore.getCategory('gender'),
            readOnly: false,
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          await store.personService.update(data, store.appStore.currentUser());
        }
      },

      async editMembership(account: UserAccount): Promise<void> {
        if (!account.personKey) return;
        const person = store.appStore.getPerson(account.personKey);
        if (!person) return;
          const modal = await store.modalController.create({
          component: PersonEditModal,
          componentProps: {
            person,
            currentUser: store.appStore.currentUser(),
            tags: store.appStore.getTags('person'),
            tenantId: store.appStore.tenantId(),
            genders: store.appStore.getCategory('gender'),
            readOnly: false,
          }
        });
        modal.present();
        const { data, role } = await modal.onDidDismiss();
        if (role === 'confirm' && data) {
          await store.personService.update(data, store.appStore.currentUser());
        }
      },

      async editUser(account: UserAccount): Promise<void> {
        if (!account.uid) return;
        await navigateByUrl(store.router, `/user/${account.uid}`, { readOnly: false });
      },

      /**
       * Opens the account through the openAccount Cloud Function (spec 1.71 §5.3) — the one code path
       * that knows the shared-email rule. Creating the Auth identity and the users doc here on the
       * client would attach a child's person to the parent's uid when both share one email.
       */
      async createAccountAndUser(account: UserAccount): Promise<void> {
        if (!account.personKey) return;
        try {
          const { data } = await callable<{ personKey: string; tenantId: string; action: 'open' }, OpenAccountResponse>('syncPersonAccount')(
            { personKey: account.personKey, tenantId: store.appStore.tenantId(), action: 'open' });
          const name = getFullName(account.firstName, account.lastName);
          switch (data.outcome) {
            case 'created':            await showToast(store.toastController, store.i18n.account_open_created()); break;
            case 'createdWithLoginId': await notify(store.alertController, store.i18n.account_open(),
                                         fill(store.i18n.account_open_created_login_id(), { name, loginId: data.loginId ?? '' }), store.i18n.ok()); break;
            case 'exists':             await showToast(store.toastController, store.i18n.account_open_exists()); break;
            case 'noEmail':            await showToast(store.toastController, store.i18n.account_open_no_email()); break;
            case 'noPerson':           await showToast(store.toastController, store.i18n.account_open_no_person()); break;
          }
          this.reload();
        } catch (ex) {
          console.error('AocUserAccountStore.createAccountAndUser', ex);
          error(store.toastController, store.i18n.account_open_error());
        }
      },

      async deleteUser(account: UserAccount): Promise<void> {
        const confirmed = await confirm(store.alertController, store.i18n.account_user_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (confirmed === true) {
          const user = store.allUsers().find(u => u.okey === account.uid);
          if (user) {
            await store.userService.delete(user, store.currentUser());
            this.reload();
          }
        }
      },

      async deleteFirebaseUser(account: UserAccount): Promise<void> {
        const confirmed = await confirm(store.alertController, store.i18n.account_fbuser_delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (confirmed === true) {
          try {
            const fn = httpsCallable<{ uid: string }, void>(getFunctions(getApp(), 'europe-west6'), 'deleteFirebaseAuthUser');
            await fn({ uid: account.uid });
            this.reload();
          } catch (ex) {
            error(store.toastController, 'AocUserAccountStore.deleteFirebaseUser -> error: ' + JSON.stringify(ex));
          }
        }
      },

      /**
       * Requests a password link. A Benutzername account is reset by its Benutzername — the mail then
       * goes to the favourite email (spec 1.71 §5.2); the synthetic login address has no mailbox.
       */
      async resetPassword(account: UserAccount): Promise<void> {
        const target = isSyntheticLoginEmail(account.loginEmail) ? account.loginId : account.loginEmail;
        if (!target) return;
        // resetPassword reports only whether the REQUEST went through; whether a mail was
        // delivered is deliberately not knowable here (M-3). Say exactly that much.
        const sent = await store.authService.resetPassword(target);
        if (sent) await showToast(store.toastController, store.i18n.account_reset_conf());
        else error(store.toastController, store.i18n.account_reset_error());
      },

      /**
       * The swap (spec 1.71 §6b): `account` has a Benutzername login; the account that logs in with
       * this person's favourite email (the "holder", typically the child who registered first) hands
       * that email over and logs in with its Benutzername from then on.
       */
      async swapLoginEmail(account: UserAccount): Promise<void> {
        if (!account.uid || !isSyntheticLoginEmail(account.loginEmail)) return;
        const favEmail = store.appStore.getDirectoryEntry(`person.${account.personKey}`)?.favEmail;
        const holder = findLoginEmailHolder(store.allUsers(), favEmail, store.appStore.tenantId(), account.uid);
        if (!holder?.okey) {
          await notify(store.alertController, store.i18n.account_swap(), store.i18n.account_swap_no_holder(), store.i18n.ok());
          return;
        }
        const params = {
          holder: getFullName(holder.firstName, holder.lastName),
          newcomer: getFullName(account.firstName, account.lastName),
          loginId: holder.loginId ?? '',
        };
        if (!params.loginId) {
          await notify(store.alertController, store.i18n.account_swap(), fill(store.i18n.account_swap_no_login_id(), params), store.i18n.ok());
          return;
        }
        // Minor hint (spec §6b): the admin is privileged, so the vault read is allowed. The dob is
        // only turned into "under 18" here — never stored, never logged.
        let holderIsMinor = false;
        try {
          if (holder.personKey) {
            const { dob } = await store.personService.loadSensitive(holder.personKey, store.currentUser());
            holderIsMinor = isMinorAge(getAge(dob ?? ''));
          }
        } catch {
          holderIsMinor = false;   // no hint is fine; the admin still decides
        }
        const message = (holderIsMinor ? fill(store.i18n.account_swap_minor(), params) + ' ' : '') + fill(store.i18n.account_swap_confirm(), params);
        if (!(await confirm(store.alertController, message, store.i18n.ok(), store.i18n.cancel(), true))) return;
        try {
          const { data } = await callable<{ holderUid: string; newcomerUid: string }, { holderLoginId: string }>('swapLoginEmail')(
            { holderUid: holder.okey, newcomerUid: account.uid });
          // the newcomer was opened with a random password: the reset link reaches exactly their mailbox
          if (favEmail) await store.authService.resetPassword(favEmail);
          await notify(store.alertController, store.i18n.account_swap(),
            fill(store.i18n.account_swap_conf(), { ...params, loginId: data.holderLoginId }), store.i18n.ok());
          this.reload();
        } catch (ex) {
          console.error('AocUserAccountStore.swapLoginEmail', ex);
          error(store.toastController, store.i18n.account_swap_error());
        }
      },

      /** Changes the Benutzername on purpose (spec §3). A Benutzername account is signed out once. */
      async changeLoginId(account: UserAccount): Promise<void> {
        if (!account.uid) return;
        const alert = await store.alertController.create({
          header: store.i18n.account_login_id_change_header(),
          message: isSyntheticLoginEmail(account.loginEmail)
            ? fill(store.i18n.account_login_id_change_signout(), { name: getFullName(account.firstName, account.lastName) })
            : undefined,
          inputs: [{ type: 'text', value: account.loginId, placeholder: store.i18n.account_login_id() }],
          buttons: [
            { text: store.i18n.cancel(), role: 'cancel' },
            { text: store.i18n.ok(), role: 'confirm' },
          ],
        });
        await alert.present();
        const { data, role } = await alert.onWillDismiss();
        if (role !== 'confirm') return;
        const loginId = normalizeLoginIdInput(String(data?.values?.[0] ?? ''));
        if (!loginId || loginId === account.loginId) return;
        if (!isValidLoginId(loginId)) {
          await notify(store.alertController, store.i18n.account_login_id_change(), store.i18n.account_login_id_change_invalid(), store.i18n.ok());
          return;
        }
        try {
          const result = await callable<{ uid: string; loginId: string }, { loginId: string }>('setLoginId')({ uid: account.uid, loginId });
          await showToast(store.toastController, fill(store.i18n.account_login_id_change_conf(), { loginId: result.data.loginId }));
          this.reload();
        } catch (ex) {
          console.error('AocUserAccountStore.changeLoginId', ex);
          error(store.toastController, callableErrorCode(ex) === 'already-exists'
            ? store.i18n.account_login_id_change_taken()
            : store.i18n.account_login_id_change_error());
        }
      }
    };
  })
);
