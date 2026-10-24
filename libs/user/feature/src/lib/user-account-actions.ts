import { inject, Injectable } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, AlertController, ModalController, ToastController } from '@ionic/angular';

import { firstValueFrom } from 'rxjs';

import { FirebaseUserModel, PersonModel, PersonModelName } from '@okr/shared-models';
import { openReport } from '@okr/shared-ui';
import { confirm, copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error, notify, okrPrompt, showToast } from '@okr/shared-util-angular';
import { fill, getAge, getCategoryItemNames, getFullName, hasRole, normalizeEmail, OPERATOR_TENANT_ID } from '@okr/shared-util-core';

import { AuthService } from '@okr/auth-data-access';
import { AddressService } from '@okr/subject-address-data-access';
import { createFavoriteAddress } from '@okr/subject-address-util';
import { PersonService } from '@okr/subject-person-data-access';
import {
  callableErrorCode, createCustomToken, deleteFirebaseAuthUser, generatePassword, getFirebaseUser, openPersonAccount,
  provisionMatrixUser, setLoginId, setPassword, swapLoginEmail, updateFirebaseUser, UserService
} from '@okr/user-data-access';
import {
  AccountCheckFix, accountCheckFindings, actionGroup, actionsForRow, findLoginEmailHolder, isMinorAge, isPlausibleEmail, isSyntheticLoginEmail,
  isValidLoginId, normalizeLoginIdInput, structureRoles, UserAccountAction, UserAccountRow
} from '@okr/user-util';

import { UserStore } from './user.store';

/**
 * The «Benutzer & Zugänge» row ActionSheet and what each entry does (spec 1.101 phase 4). It holds
 * every account tool of the former AOC pages «User Accounts» and «Berechtigungen»; which entries a
 * row offers is decided by `actionsForRow` (user-util). Provided by `UserList`, next to its store.
 */
@Injectable()
export class UserAccountActions {
  private readonly store = inject(UserStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);
  private readonly authService = inject(AuthService);
  private readonly personService = inject(PersonService);
  private readonly userService = inject(UserService);
  private readonly addressService = inject(AddressService);

  private readonly i18n = this.store.i18n;
  private readonly appStore = this.store.appStore;
  private readonly imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  /** Shows the actions that apply to `row` and runs the chosen one. Admin only (as the list route). */
  public async show(row: UserAccountRow): Promise<void> {
    if (!hasRole('admin', this.appStore.currentUser())) return;
    const actions = actionsForRow(row, this.appStore.tenantId() === OPERATOR_TENANT_ID);
    if (actions.length === 0) return;
    const options = createActionSheetOptions(this.i18n.as_title());
    this.addButtons(options, actions);
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action || data.action === 'cancel') return;
    await this.run(data.action as UserAccountAction, row);
  }

  private addButtons(options: ActionSheetOptions, actions: UserAccountAction[]): void {
    let group: string | undefined;
    for (const action of actions) {
      const next = actionGroup(action);
      if (group && next !== group) options.buttons.push(createActionSheetDivider());
      group = next;
      const [label, icon] = this.button(action);
      options.buttons.push(createActionSheetButton(action, label, this.imgixBaseUrl, icon));
    }
    options.buttons.push(createActionSheetButton('cancel', this.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
  }

  private button(action: UserAccountAction): [string, string] {
    const i = this.i18n;
    switch (action) {
      case 'user.edit':           return [i.update(), 'edit'];
      case 'person.edit':         return [i.account_person_edit(), 'person'];
      case 'account.open':        return [i.account_open(), 'person-add'];
      case 'account.reset':       return [i.account_reset(), 'email'];
      case 'account.password':    return [i.account_password(), 'lock-closed'];
      case 'account.loginid':     return [i.account_login_id_change(), 'edit'];
      case 'account.swap':        return [i.account_swap(), 'email'];
      case 'fbuser.edit':         return [i.account_fbuser_edit(), 'key'];
      case 'account.check':       return [i.account_check(), 'shield'];
      case 'account.impersonate': return [i.account_impersonate(), 'shield'];
      case 'matrix.provision':    return [i.account_matrix(), 'chatbubbles'];
      case 'copy.email':          return [i.account_copy_email(), 'copy'];
      case 'copy.uid':            return [i.account_copy_uid(), 'copy'];
      case 'copy.pkey':           return [i.account_copy_pkey(), 'copy'];
      case 'user.delete':         return [i.delete(), 'trash'];
      case 'fbuser.delete':       return [i.account_fbuser_delete(), 'trash'];
    }
  }

  private async run(action: UserAccountAction, row: UserAccountRow): Promise<void> {
    switch (action) {
      case 'user.edit':           if (row.user) await this.store.edit(row.user, false); break;
      case 'person.edit':         await this.editPerson(row); break;
      case 'account.open':        await this.openAccount(row); break;
      case 'account.reset':       await this.resetPassword(row); break;
      case 'account.password':    await this.setPassword(row); break;
      case 'account.loginid':     await this.changeLoginId(row); break;
      case 'account.swap':        await this.swapLoginEmail(row); break;
      case 'fbuser.edit':         await this.editFirebaseUser(row); break;
      case 'account.check':       await this.checkAccount(row); break;
      case 'account.impersonate': await this.impersonate(row); break;
      case 'matrix.provision':    await this.provisionMatrix(row); break;
      case 'copy.email':          await this.copy(row.loginEmail); break;
      case 'copy.uid':            await this.copy(row.uid); break;
      case 'copy.pkey':           await this.copy(row.personKey); break;
      case 'user.delete':         await this.deleteUser(row); break;
      case 'fbuser.delete':       await this.deleteFirebaseUser(row); break;
    }
  }

  /******************************* edits *************************************** */
  private async editPerson(row: UserAccountRow): Promise<void> {
    const person = await this.loadPerson(row.personKey);
    if (!person) {
      await showToast(this.toastController, this.i18n.account_open_no_person());
      return;
    }
    // lazy: the person editor stays out of the list's chunk until it is used
    const { PersonEditModal } = await import('@okr/subject-person-feature');
    const modal = await this.modalController.create({
      component: PersonEditModal,
      componentProps: {
        person,
        currentUser: this.appStore.currentUser(),
        tags: this.appStore.getTags('person'),
        tenantId: this.appStore.tenantId(),
        genders: this.appStore.getCategory('gender'),
        readOnly: false,
      }
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm' && data) {
      await this.personService.update(data as PersonModel, this.appStore.currentUser());
      this.appStore.reloadPersons();
    }
  }

  /**
   * The row's person: from the loaded persons, else read directly. The loaded list holds the
   * tenant's persons only, so a problem row (a member or user whose person lacks this tenant)
   * would otherwise find nothing and the action silently did nothing.
   */
  private async loadPerson(personKey: string | undefined): Promise<PersonModel | undefined> {
    if (!personKey) return undefined;
    return this.appStore.getPerson(personKey) ?? await firstValueFrom(this.personService.read(personKey));
  }

  /******************************* account *************************************** */
  /** Opens the account through openAccount (syncPersonAccount, spec 1.71 §5.3), the one path that knows the shared-email rule. */
  private async openAccount(row: UserAccountRow, createdText = this.i18n.account_open_created()): Promise<boolean> {
    if (!row.personKey) return false;
    try {
      const data = await openPersonAccount(row.personKey, this.appStore.tenantId());
      switch (data.outcome) {
        case 'created':            await showToast(this.toastController, createdText); break;
        case 'createdWithLoginId': await notify(this.alertController, this.i18n.account_open(),
                                     fill(this.i18n.account_open_created_login_id(), { name: row.name, loginId: data.loginId ?? '' }), this.i18n.ok()); break;
        case 'exists':             await showToast(this.toastController, this.i18n.account_open_exists()); break;
        case 'noEmail':            await showToast(this.toastController, this.i18n.account_open_no_email()); break;
        case 'noPerson':           await showToast(this.toastController, this.i18n.account_open_no_person()); break;
      }
      this.store.reload();
      return data.outcome === 'created' || data.outcome === 'createdWithLoginId';
    } catch (ex) {
      console.error('UserAccountActions.openAccount', ex);
      error(this.toastController, this.i18n.account_open_error());
      return false;
    }
  }

  /**
   * Requests a password link. A Benutzername account is reset by its Benutzername: the mail then
   * goes to the favourite email (spec 1.71 §5.2), the synthetic login address has no mailbox.
   * Outside production the link goes to the admin's own login (never mail a real user from dev).
   */
  private async resetPassword(row: UserAccountRow): Promise<void> {
    const target = isSyntheticLoginEmail(row.loginEmail) ? row.loginId : row.loginEmail;
    const recipient = this.appStore.env.production ? target : this.appStore.currentUser()?.loginEmail;
    if (!recipient) return;
    // resetPassword reports only whether the REQUEST went through, never whether a mail was delivered (M-3)
    const sent = await this.authService.resetPassword(recipient);
    if (sent) await showToast(this.toastController, this.i18n.account_reset_conf());
    else error(this.toastController, this.i18n.account_reset_error());
  }

  /** Sets a password without a reset mail; an empty field sets a random one. */
  private async setPassword(row: UserAccountRow): Promise<void> {
    if (!row.uid) return;
    const alert = await this.alertController.create({
      header: this.i18n.account_password_header(),
      message: this.i18n.account_password_message(),
      inputs: [{ type: 'password', placeholder: this.i18n.account_password_placeholder() }],
      buttons: [
        { text: this.i18n.cancel(), role: 'cancel' },
        { text: this.i18n.ok(), role: 'confirm' },
      ],
    });
    await alert.present();
    const { data, role } = await alert.onWillDismiss();
    if (role !== 'confirm') return;
    try {
      await setPassword(row.uid, generatePassword(String(data?.values?.[0] ?? '')), this.appStore.env.useEmulators);
      await showToast(this.toastController, this.i18n.account_password_conf());
    } catch (ex) {
      console.error('UserAccountActions.setPassword', ex);
      error(this.toastController, this.i18n.account_password_error());
    }
  }

  /** Changes the Benutzername on purpose (spec 1.71 §3). A Benutzername account is signed out once. */
  private async changeLoginId(row: UserAccountRow): Promise<void> {
    if (!row.uid) return;
    const current = row.loginId ?? '';
    const alert = await this.alertController.create({
      header: this.i18n.account_login_id_change_header(),
      message: isSyntheticLoginEmail(row.loginEmail) ? fill(this.i18n.account_login_id_change_signout(), { name: row.name }) : undefined,
      inputs: [{ type: 'text', value: current, placeholder: this.i18n.account_login_id() }],
      buttons: [
        { text: this.i18n.cancel(), role: 'cancel' },
        { text: this.i18n.ok(), role: 'confirm' },
      ],
    });
    await alert.present();
    const { data, role } = await alert.onWillDismiss();
    if (role !== 'confirm') return;
    const loginId = normalizeLoginIdInput(String(data?.values?.[0] ?? ''));
    if (!loginId || loginId === current) return;
    if (!isValidLoginId(loginId)) {
      await notify(this.alertController, this.i18n.account_login_id_change(), this.i18n.account_login_id_change_invalid(), this.i18n.ok());
      return;
    }
    try {
      const saved = await setLoginId(row.uid, loginId);
      await showToast(this.toastController, fill(this.i18n.account_login_id_change_conf(), { loginId: saved }));
      this.store.reload();
    } catch (ex) {
      console.error('UserAccountActions.changeLoginId', ex);
      error(this.toastController, callableErrorCode(ex) === 'already-exists'
        ? this.i18n.account_login_id_change_taken()
        : this.i18n.account_login_id_change_error());
    }
  }

  /**
   * The swap (spec 1.71 §6b): `row` logs in with a Benutzername; the account that logs in with this
   * person's favourite email (the "holder", typically the child who registered first) hands that
   * email over and logs in with its Benutzername from then on.
   */
  private async swapLoginEmail(row: UserAccountRow): Promise<void> {
    if (!row.uid || !isSyntheticLoginEmail(row.loginEmail)) return;
    const favEmail = this.appStore.getDirectoryEntry(`person.${row.personKey}`)?.favEmail;
    const holder = findLoginEmailHolder(this.store.usersResource.value() ?? [], favEmail, this.appStore.tenantId(), row.uid);
    if (!holder?.okey) {
      await notify(this.alertController, this.i18n.account_swap(), this.i18n.account_swap_no_holder(), this.i18n.ok());
      return;
    }
    const params = { holder: getFullName(holder.firstName, holder.lastName), newcomer: row.name, loginId: holder.loginId ?? '' };
    if (!params.loginId) {
      await notify(this.alertController, this.i18n.account_swap(), fill(this.i18n.account_swap_no_login_id(), params), this.i18n.ok());
      return;
    }
    // Minor hint (spec §6b): the admin is privileged, so the vault read is allowed. The dob is only
    // turned into "under 18" here — never stored, never logged.
    let holderIsMinor = false;
    try {
      if (holder.personKey) {
        const { dob } = await this.personService.loadSensitive(holder.personKey, this.appStore.currentUser());
        holderIsMinor = isMinorAge(getAge(dob ?? ''));
      }
    } catch {
      holderIsMinor = false;   // no hint is fine; the admin still decides
    }
    const message = (holderIsMinor ? fill(this.i18n.account_swap_minor(), params) + ' ' : '') + fill(this.i18n.account_swap_confirm(), params);
    if (!(await confirm(this.alertController, message, this.i18n.ok(), this.i18n.cancel(), true))) return;
    try {
      const holderLoginId = await swapLoginEmail(holder.okey, row.uid);
      // the newcomer was opened with a random password: the reset link reaches exactly their mailbox
      // (outside production the admin's own login, as in resetPassword: never mail a real user from dev)
      const resetTo = this.appStore.env.production ? favEmail : this.appStore.currentUser()?.loginEmail;
      if (resetTo) await this.authService.resetPassword(resetTo);
      await notify(this.alertController, this.i18n.account_swap(), fill(this.i18n.account_swap_conf(), { ...params, loginId: holderLoginId }), this.i18n.ok());
      this.store.reload();
    } catch (ex) {
      console.error('UserAccountActions.swapLoginEmail', ex);
      error(this.toastController, this.i18n.account_swap_error());
    }
  }

  /** Edits the Firebase login itself (email, display name, verified, disabled). */
  private async editFirebaseUser(row: UserAccountRow): Promise<void> {
    if (!row.uid) return;
    let fbuser: FirebaseUserModel | undefined;
    try {
      fbuser = await getFirebaseUser(row.uid);
    } catch (ex) {
      console.error('UserAccountActions.editFirebaseUser', ex);
      error(this.toastController, fill(this.i18n.account_fbuser_edit_load_error(), { reason: (ex as Error)?.message ?? '' }));
      return;
    }
    if (!fbuser) {
      await notify(this.alertController, this.i18n.account_fbuser_edit(), this.i18n.account_fbuser_edit_notfound(), this.i18n.ok());
      return;
    }
    const { FbuserEditModal } = await import('./fbuser-edit.modal');
    const modal = await this.modalController.create({
      component: FbuserEditModal,
      componentProps: { fbuser, currentUser: this.appStore.currentUser() },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role !== 'confirm' || !data) return;
    try {
      await updateFirebaseUser(data as FirebaseUserModel, this.appStore.env.useEmulators);
      await showToast(this.toastController, this.i18n.account_fbuser_edit_conf());
      this.store.reload();
    } catch (ex) {
      error(this.toastController, fill(this.i18n.account_fbuser_edit_error(), { reason: (ex as Error)?.message ?? '' }));
    }
  }

  /******************************* diagnose *************************************** */
  /**
   * «Berechtigung prüfen»: person, email, user and login of this account, and whether they match.
   * A missing email, user or login carries an add button; the roles are chips saved on every change.
   * After a repair the check opens again on the reloaded data, until the admin closes it.
   */
  private async checkAccount(row: UserAccountRow): Promise<void> {
    if (!row.personKey) return;
    let current: UserAccountRow = row;
    let addedEmail = '';   // the address directory follows an address write only seconds later
    for (;;) {
      const result = await openReport(this.modalController, {
        title: this.i18n.account_check_title(),
        kind: 'check',
        explanation: this.i18n.account_check_explanation(),
        findings: await this.accountFindings(current, addedEmail),
        ranAt: new Date(),
        onChipsChange: (findingId, value) => findingId === 'roles' ? this.saveRoles(current, value) : undefined,
      });
      if (result?.kind !== 'action') return;
      const fix = result.actionId as AccountCheckFix;
      if (fix === 'email.add') {
        const email = await this.addEmail(current);
        if (!email) return;
        addedEmail = email;
      } else if (!(await this.openAccount(current, fix === 'login.add' ? this.i18n.account_check_login_conf() : undefined))) {
        return;
      }
      current = await this.reloadedRow(current);
    }
  }

  private async accountFindings(row: UserAccountRow, addedEmail: string) {
    const personKey = row.personKey ?? '';
    const person = await this.loadPerson(personKey);
    const login = (this.store.firebaseUsersResource.value() ?? []).find(f => f.uid === row.uid);
    const i = this.i18n;
    return accountCheckFindings({
      personKey,
      personTenants: person?.tenants ?? [],
      favEmail: this.appStore.getDirectoryEntry(`${PersonModelName}.${personKey}`)?.favEmail || addedEmail,
      user: row.user,
      login: login ? { uid: login.uid, email: login.email } : undefined,
      allRoles: getCategoryItemNames(this.appStore.getCategory('roles')),
    }, {
      person: i.account_check_person(), email: i.account_check_email(), noEmail: i.account_check_no_email(),
      user: i.account_check_user(), noUser: i.account_check_no_user(), login: i.account_check_login(), noLogin: i.account_check_no_login(),
      linkPerson: i.account_check_link_person(), linkLogin: i.account_check_link_login(), ok: i.account_check_ok(),
      roles: i.account_check_roles(), archived: i.account_check_archived(),
      addEmail: i.account_check_add_email(), addUser: i.account_check_add_user(), addLogin: i.account_check_add_login(),
    });
  }

  /** Asks for an email and stores it as the person's favourite email address; returns it, or '' when nothing was saved. */
  private async addEmail(row: UserAccountRow): Promise<string> {
    if (!row.personKey) return '';
    const input = await okrPrompt(this.alertController, this.i18n.account_check_add_email_header(), this.i18n.account_check_add_email_header(), this.i18n.ok(), this.i18n.cancel());
    const email = normalizeEmail(input).toLowerCase();
    if (!email) return '';
    if (!isPlausibleEmail(email)) {
      await notify(this.alertController, this.i18n.account_check_add_email(), this.i18n.account_check_add_email_invalid(), this.i18n.ok());
      return '';
    }
    const parentKey = `${PersonModelName}.${row.personKey}`;
    const address = createFavoriteAddress('email', 'home', email, this.appStore.tenantId());
    address.parentKey = parentKey;
    const key = await this.addressService.create(address, this.appStore.currentUser());
    if (!key) return '';
    this.appStore.watchDirectoryEntry(parentKey);
    return email;
  }

  /** Saves the roles chips (comma-separated) onto the user; the list reloads to show them. */
  private async saveRoles(row: UserAccountRow, value: string): Promise<void> {
    if (!row.user) return;
    const user = { ...row.user, roles: structureRoles(value) };
    if (await this.userService.update(user, this.appStore.currentUser())) {
      row.user = user;
      this.store.reload();
    }
  }

  /** The row of the same account after the store reloaded (by uid, else by person). */
  private async reloadedRow(row: UserAccountRow): Promise<UserAccountRow> {
    await this.store.whenLoaded();
    const rows = this.store.accountRows();
    return rows.find(r => !!row.uid && r.uid === row.uid && r.kind !== 'memberWithoutAccount')
      ?? rows.find(r => r.personKey === row.personKey && !!r.user)
      ?? rows.find(r => r.personKey === row.personKey)
      ?? row;
  }

  /** Signs the admin in as this user (custom token). Back to the own account only by signing out and in. */
  private async impersonate(row: UserAccountRow): Promise<void> {
    if (!row.uid || !hasRole('admin', this.appStore.currentUser())) return;
    const message = fill(this.i18n.account_impersonate_confirm(), { name: row.name });
    if (!(await confirm(this.alertController, message, this.i18n.ok(), this.i18n.cancel(), true))) return;
    try {
      const token = await createCustomToken(row.uid, this.appStore.env.useEmulators);
      await this.authService.loginWithToken(token, this.appStore.appConfig().rootUrl);
    } catch (ex) {
      console.error('UserAccountActions.impersonate', ex);
      error(this.toastController, this.i18n.account_impersonate_error());
    }
  }

  /** Creates (or confirms) the person's Matrix account. */
  private async provisionMatrix(row: UserAccountRow): Promise<void> {
    if (!row.personKey) return;
    try {
      const matrixUserId = await provisionMatrixUser(row.personKey);
      await showToast(this.toastController, fill(this.i18n.account_matrix_conf(), { id: matrixUserId }));
    } catch (ex) {
      console.error('UserAccountActions.provisionMatrix', ex);
      error(this.toastController, this.i18n.account_matrix_error());
    }
  }

  private async copy(value: string | undefined): Promise<void> {
    if (!value) return;
    await copyToClipboardWithConfirmation(this.toastController, value, this.i18n.account_copied());
  }

  /******************************* delete *************************************** */
  private async deleteUser(row: UserAccountRow): Promise<void> {
    if (!row.user) return;
    // With a login (a normal row) deleting the user doc strands the login: warn and point to «Login löschen».
    const text = row.kind === 'normal' ? this.i18n.account_user_delete_confirm() : this.i18n.delete_confirm();
    if (!(await confirm(this.alertController, text, this.i18n.ok(), this.i18n.cancel(), true))) return;
    await this.userService.delete(row.user, this.appStore.currentUser());
    this.store.reload();
  }

  private async deleteFirebaseUser(row: UserAccountRow): Promise<void> {
    if (!row.uid) return;
    if (!(await confirm(this.alertController, this.i18n.account_fbuser_delete_confirm(), this.i18n.ok(), this.i18n.cancel(), true))) return;
    try {
      await deleteFirebaseAuthUser(row.uid);
      this.store.reload();
    } catch (ex) {
      console.error('UserAccountActions.deleteFirebaseUser', ex);
      error(this.toastController, this.i18n.account_fbuser_delete_error());
    }
  }
}
