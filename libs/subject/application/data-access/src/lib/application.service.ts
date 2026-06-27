import { inject, Injectable } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import {
  ApplicationCollection, ApplicationModel, ApplicationState, AvatarInfo,
  PersonalRelModel, TaskModel, UserModel
} from '@bk2/shared-models';
import {
  addWorkDays, getAvatarInfo, getAvatarInfoForCurrentUser,
  getSystemQuery, getTodayStr, isValidAt
} from '@bk2/shared-util-core';
import { showToast } from '@bk2/shared-util-angular';
import { ToastController } from '@ionic/angular/standalone';
import { ActivityService } from '@bk2/activity-data-access';
import { PersonalRelService } from '@bk2/relationship-personal-rel-data-access';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { AddressService } from '@bk2/subject-address-data-access';
import { createFavoriteAddress } from '@bk2/subject-address-util';
import { PersonService } from '@bk2/subject-person-data-access';
import { TaskService } from '@bk2/task-data-access';
import {
  getApplicationIndex, newParentPerson, toPersonModel
} from '@bk2/application-util';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  private readonly env              = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService  = inject(ActivityService);
  private readonly personService    = inject(PersonService);
  private readonly addressService   = inject(AddressService);
  private readonly personalRelService     = inject(PersonalRelService);
  private readonly responsibilityService  = inject(ResponsibilityService);
  private readonly taskService      = inject(TaskService);
  private readonly toastController  = inject(ToastController);
  private readonly i18nService      = inject(I18nService);

  private readonly i18n = this.i18nService.translateAll({
    create_conf:        PFX + 'edit.save_conf',
    create_error:       PFX + 'edit.save_error',
    update_conf:        PFX + 'edit.save_conf',
    update_error:       PFX + 'edit.save_error',
    delete_conf:        PFX + 'delete.conf',
    delete_error:       PFX + 'delete.error',
    accept_conf:        PFX + 'edit.accept_conf',
    accept_error:       PFX + 'edit.accept_error',
    deny_conf:          PFX + 'edit.deny_conf',
    deny_error:         PFX + 'edit.deny_error',
    mail_conf:          PFX + 'mail.confirmation_sent',
    mail_decision_conf: PFX + 'mail.decision_sent',
    mail_failed:        PFX + 'mail.send_failed',
  });

  private readonly sendEmailFn = httpsCallable<unknown, void>(
    getFunctions(getApp(), 'europe-west6'),
    'sendEmail'
  );

  /*----------- CRUD ----------- */

  public list(orderBy = 'submittedAt', sortOrder: 'asc' | 'desc' = 'desc'): Observable<ApplicationModel[]> {
    return this.firestoreService.searchData<ApplicationModel>(
      ApplicationCollection,
      getSystemQuery(this.env.tenantId),
      orderBy,
      sortOrder
    );
  }

  public read(key?: string): Observable<ApplicationModel | undefined> {
    return this.firestoreService.readModel<ApplicationModel>(ApplicationCollection, key);
  }

  public async create(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined> {
    application.submittedAt = new Date().toISOString();
    application.state       = 'applied';
    application.index       = getApplicationIndex(application);
    const key = await this.firestoreService.createModel<ApplicationModel>(
      ApplicationCollection, application, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
    if (!key) return undefined;
    application.bkey = key;

    const taskKey = await this.createApplicationTask(application, currentUser);
    if (taskKey) {
      application.taskKey = taskKey;
      await this.firestoreService.updateModel<ApplicationModel>(
        ApplicationCollection, application, false, '', '', currentUser
      );
    }

    void this.sendConfirmationMail(application);
    void this.activityService.log('application', 'create', currentUser,
      `${key}: ${application.lastName}/${application.firstName} (${application.applicationAs}) → applied`);
    return key;
  }

  public async update(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined> {
    application.index = getApplicationIndex(application);
    const key = await this.firestoreService.updateModel<ApplicationModel>(
      ApplicationCollection, application, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
    void this.activityService.log('application', 'update', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName} (${application.applicationAs}) → ${application.state}`);
    return key;
  }

  public async delete(application: ApplicationModel, currentUser?: UserModel): Promise<void> {
    application.isArchived = true;
    await this.firestoreService.updateModel<ApplicationModel>(
      ApplicationCollection, application, false, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
    void this.activityService.log('application', 'delete', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName}`);
  }

  /*----------- Workflow ----------- */

  public async beginReview(application: ApplicationModel, reviewer: AvatarInfo, currentUser?: UserModel): Promise<void> {
    if (application.state !== 'applied') return;
    application.state      = 'reviewing';
    application.reviewedAt = new Date().toISOString();
    application.reviewer   = reviewer;
    await this.update(application, currentUser);
    void this.activityService.log('application', 'begin-review', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName}`);
  }

  public async accept(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined> {
    if (application.state !== 'reviewing') return undefined;

    const tenantId = this.env.tenantId;
    const kid      = toPersonModel(application, tenantId);
    const kidsKey  = await this.personService.create(kid, currentUser);
    if (!kidsKey) throw new Error('ApplicationService.accept: personService.create failed');

    await this.createApplicantAddresses(application, kidsKey, currentUser);

    if (application.applicationAs === 'youth') {
      await this.provisionYouthExtras(application, kidsKey, kid, tenantId, currentUser);
    }

    application.state     = 'closed.approved';
    application.closedAt  = new Date().toISOString();
    application.personKey = kidsKey;
    await this.update(application, currentUser);
    await this.closeLinkedTask(application, currentUser);

    void this.sendDecisionMail('application.accepted', application, currentUser);
    void this.activityService.log('application', 'accept', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName} (${application.applicationAs}) → closed.approved`);
    return kidsKey;
  }

  public async deny(application: ApplicationModel, reason: string, currentUser?: UserModel): Promise<void> {
    await this.closeApplication(application, 'closed.denied', reason, currentUser);
    void this.sendDecisionMail('application.denied', application, currentUser);
    void this.activityService.log('application', 'deny', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName} → closed.denied`);
  }

  public async cancel(application: ApplicationModel, reason: string, currentUser?: UserModel): Promise<void> {
    await this.closeApplication(application, 'closed.cancelled', reason, currentUser);
    void this.activityService.log('application', 'cancel', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName} → closed.cancelled`);
  }

  /*----------- Private helpers ----------- */

  private async createApplicantAddresses(
    app: ApplicationModel, kidsKey: string, currentUser?: UserModel
  ): Promise<void> {
    const parentKey = 'person.' + kidsKey;
    if (app.email) {
      const a = createFavoriteAddress('email', 'home', app.email, this.env.tenantId);
      a.parentKey = parentKey;
      await this.addressService.create(a, currentUser);
    }
    if (app.phone) {
      const a = createFavoriteAddress('phone', 'home', app.phone, this.env.tenantId);
      a.parentKey = parentKey;
      await this.addressService.create(a, currentUser);
    }
    if (app.streetName) {
      const a = createFavoriteAddress('postal', 'home', app.streetName, this.env.tenantId,
        app.streetNumber, '', app.zipCode, app.city, app.countryCode);
      a.parentKey = parentKey;
      await this.addressService.create(a, currentUser);
    }
  }

  private async provisionYouthExtras(
    app: ApplicationModel,
    kidsKey: string,
    kid: ReturnType<typeof toPersonModel>,
    tenantId: string,
    currentUser?: UserModel
  ): Promise<void> {
    const parent     = newParentPerson(app, tenantId);
    const parentsKey = await this.personService.create(parent, currentUser);
    if (!parentsKey) throw new Error('ApplicationService.accept: parent personService.create failed');

    if (app.parentEmail) {
      const a = createFavoriteAddress('email', 'home', app.parentEmail, tenantId);
      a.parentKey = 'person.' + parentsKey;
      await this.addressService.create(a, currentUser);
    }
    if (app.parentPhone) {
      const a = createFavoriteAddress('phone', 'home', app.parentPhone, tenantId);
      a.parentKey = 'person.' + parentsKey;
      await this.addressService.create(a, currentUser);
    }
    if (app.streetName) {
      const a = createFavoriteAddress('postal', 'home', app.streetName, tenantId,
        app.streetNumber, '', app.zipCode, app.city, app.countryCode);
      a.parentKey = 'person.' + parentsKey;
      await this.addressService.create(a, currentUser);
    }

    const rel = new PersonalRelModel(tenantId);
    rel.subjectKey       = parentsKey;
    rel.subjectFirstName = parent.firstName;
    rel.subjectLastName  = parent.lastName;
    rel.subjectGender    = parent.gender;
    rel.objectKey        = kidsKey;
    rel.objectFirstName  = kid.firstName;
    rel.objectLastName   = kid.lastName;
    rel.objectGender     = kid.gender;
    rel.type             = 'parentChild';
    await this.personalRelService.create(rel, currentUser);

    await this.applyParentChannel('email', app.email, app.parentEmail, kidsKey, tenantId, currentUser);
    await this.applyParentChannel('phone', app.phone, app.parentPhone, kidsKey, tenantId, currentUser);
  }

  private async applyParentChannel(
    channel: 'email' | 'phone',
    kidValue: string,
    parentValue: string,
    kidsKey: string,
    tenantId: string,
    currentUser?: UserModel
  ): Promise<void> {
    if (!kidValue && !parentValue) return;
    if (!parentValue) return;

    const a = createFavoriteAddress(channel, 'custom', parentValue, tenantId);
    a.addressUsageLabel = 'Eltern';
    a.parentKey         = 'person.' + kidsKey;

    if (kidValue) {
      a.isFavorite = false;
      a.isCc       = true;
    }
    await this.addressService.create(a, currentUser);
  }

  private async closeApplication(
    application: ApplicationModel,
    state: ApplicationState,
    reason: string,
    currentUser?: UserModel
  ): Promise<void> {
    application.state       = state;
    application.closedAt    = new Date().toISOString();
    application.closeReason = reason;
    await this.update(application, currentUser);
    await this.closeLinkedTask(application, currentUser);
  }

  private async closeLinkedTask(application: ApplicationModel, currentUser?: UserModel): Promise<void> {
    if (!application.taskKey) return;
    const task = await firstValueFrom(this.taskService.read(application.taskKey));
    if (!task) return;
    task.state          = 'closed';
    task.completionDate = getTodayStr();
    if (application.closeReason) {
      task.notes = `${task.notes}\n[${application.state}] ${application.closeReason}`.trim();
    }
    await this.taskService.update(task, currentUser);
  }

  private async createApplicationTask(
    application: ApplicationModel,
    currentUser?: UserModel
  ): Promise<string | undefined> {
    const task    = new TaskModel(this.env.tenantId);
    task.name     = `Antrag: ${application.firstName} ${application.lastName} (${application.applicationAs})`;
    task.author   = currentUser ? getAvatarInfo(currentUser, 'user-person') : undefined;
    task.assignee = await this.resolveApplicationApprover();
    task.tags     = `application,${application.applicationAs}`;
    task.priority = 'medium';
    task.dueDate  = addWorkDays(getTodayStr(), 7);
    return this.taskService.create(task, currentUser);
  }

  private async resolveApplicationApprover(): Promise<AvatarInfo | undefined> {
    const today          = getTodayStr();
    const responsibilities = await this.responsibilityService.listOnce();
    const resp = responsibilities.find(r =>
      r.name === 'application' &&
      isValidAt(r.validFrom, r.validTo, today)
    );
    if (!resp) return undefined;
    if (resp.delegateAvatar && isValidAt(resp.delegateValidFrom, resp.delegateValidTo, today)) {
      return resp.delegateAvatar;
    }
    return resp.responsibleAvatar;
  }

  private async sendConfirmationMail(app: ApplicationModel): Promise<void> {
    const { to, cc } = this.resolveConfirmationRecipients(app);
    if (!to) return;
    try {
      await this.sendEmailFn({
        to: [to],
        cc: cc.length > 0 ? cc : undefined,
        appId: this.env.appId,
        subject: 'Wir haben Ihren Antrag erhalten',
        html: '',
        // from omitted: the sendEmail CF supplies the app's verified sender address.
        provider: 'mailtrap_api',
        template: 'application.confirmation',
      });
      await showToast(this.toastController, this.i18n.mail_conf());
    } catch {
      await showToast(this.toastController, this.i18n.mail_failed());
    }
  }

  private resolveConfirmationRecipients(app: ApplicationModel): { to: string; cc: string[] } {
    if (app.applicationAs !== 'youth') {
      return { to: app.email, cc: [] };
    }
    if (app.email && app.parentEmail) return { to: app.email, cc: [app.parentEmail] };
    if (app.email)       return { to: app.email, cc: [] };
    if (app.parentEmail) return { to: app.parentEmail, cc: [] };
    return { to: '', cc: [] };
  }

  private async sendDecisionMail(
    template: string,
    app: ApplicationModel,
    currentUser?: UserModel
  ): Promise<void> {
    const to = app.email || app.parentEmail;
    if (!to) return;
    const cc: string[] = (app.email && app.parentEmail) ? [app.parentEmail] : [];
    try {
      await this.sendEmailFn({
        to: [to],
        cc: cc.length > 0 ? cc : undefined,
        appId: this.env.appId,
        subject: template === 'application.accepted'
          ? 'Ihr Antrag wurde angenommen'
          : 'Ihr Antrag wurde nicht angenommen',
        html: '',
        // from omitted: the sendEmail CF supplies the app's verified sender address.
        provider: 'mailtrap_api',
        template,
      });
      await showToast(this.toastController, this.i18n.mail_decision_conf());
    } catch {
      await showToast(this.toastController, this.i18n.mail_failed());
    }
  }
}
