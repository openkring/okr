import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { AlertService } from '@bk2/shared-util-angular';
import {
  AddressCollection,
  AddressModel,
  AvatarCollection,
  AvatarModel,
  PersonalRelCollection,
  PersonalRelModel,
  Roles,
  WorkrelCollection,
  WorkrelModel,
} from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import {
  ExportScope,
  resolveVcardCapability,
  ScopeAvailability,
  VcardChannelType,
  VcardExportRequest,
  VcardExportResponse,
  VcardI18n,
  VCARD_I18N_KEYS,
  VcardTargetKind,
} from '@bk2/vcard-util';

import { downloadVcfResponse } from './download.util';
import { VcardExportScopeModal } from './vcard-export-scope.modal';

const REGION = 'europe-west6';
const CHANNEL_ORDER: VcardChannelType[] = ['phone', 'email', 'postal', 'web'];

/** Minimal info a caller passes about the export target. */
export interface VcardExportTarget {
  bkey: string;
  displayName: string;
  /** person only — StoreDate (yyyyMMdd); used to decide the birthday toggle */
  dateOfBirth?: string;
}

function mapChannel(addressChannel: string | undefined): VcardChannelType | undefined {
  switch (addressChannel) {
    case 'email':
    case 'phone':
    case 'postal':
    case 'web':
      return addressChannel;
    default:
      return undefined;
  }
}

function channelHasValue(a: AddressModel, channel: VcardChannelType): boolean {
  switch (channel) {
    case 'email':
      return !!a.email;
    case 'phone':
      return !!a.phone;
    case 'web':
      return !!a.url;
    case 'postal':
      return !!(a.streetName || a.city || a.zipCode);
  }
}

/**
 * Client orchestration for the vCard export (spec §6/§8). The single method
 * person/org stores call: resolves the caller's capability, (tier 2) gathers data
 * availability and opens the scope modal, invokes the `vcardExport` callable and
 * triggers the `.vcf` download. Scope is re-enforced server-side regardless.
 */
@Injectable({ providedIn: 'root' })
export class VcardExportService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly modalController = inject(ModalController);
  private readonly alertService = inject(AlertService);
  private readonly i18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;
  private readonly functions = getFunctions(getApp(), REGION);

  public async exportSingle(target: VcardExportTarget, kind: VcardTargetKind, roles: Roles | undefined, tenantId: string): Promise<void> {
    const cap = resolveVcardCapability(roles, 1);
    if (!cap.allowed) {
      this.alertService.error(this.i18n.not_allowed());
      return;
    }

    let scope: ExportScope;
    if (cap.promptForScope) {
      const availability = await this.gatherAvailability(target, kind, tenantId);
      const chosen = await this.openScopeModal(availability, kind);
      if (!chosen) return; // cancelled
      scope = chosen;
    } else {
      // tier 1: favorites of every channel — the callable forces favorites-only anyway
      scope = { identity: true, addresses: [...CHANNEL_ORDER], birthday: false, photo: false, workRels: false, personalRels: false, orgLinks: false };
    }

    try {
      const fn = httpsCallable<VcardExportRequest, VcardExportResponse>(this.functions, 'vcardExport');
      const res = await fn({ tenantId, targetIds: [target.bkey], targetKind: kind, scope });
      downloadVcfResponse(res.data);
      await this.alertService.showToast(this.i18n.export_conf());
    } catch (e) {
      console.error('VcardExportService.exportSingle failed', e);
      this.alertService.error(this.i18n.export_error());
    }
  }

  private async gatherAvailability(target: VcardExportTarget, kind: VcardTargetKind, tenantId: string): Promise<ScopeAvailability> {
    // Every list query must be tenant-scoped: the Firestore rules gate list reads on
    // `tenants.hasAny(callerTenants())`, so a query without the tenant filter is rejected
    // with "Missing or insufficient permissions". The `addresses` collection is indexed on
    // `tenants, isArchived, parentKey`, so it can be filtered server-side; `workrels` and
    // `personal-rels` are not indexed by subject/object key, so — like WorkrelService /
    // PersonalRelService — we read the tenant-scoped list and filter in memory by key.
    const subjectKey = `${kind}.${target.bkey}`;
    const [addresses, avatar, workrels, personalRels] = await Promise.all([
      this.firestoreService.getDataOnce<AddressModel>(AddressCollection, [...getSystemQuery(tenantId), { key: 'parentKey', operator: '==', value: subjectKey }], 'none'),
      firstValueFrom(this.firestoreService.readModel<AvatarModel>(AvatarCollection, subjectKey)),
      this.firestoreService.getDataOnce<WorkrelModel>(WorkrelCollection, getSystemQuery(tenantId)),
      kind === 'person'
        ? this.firestoreService.getDataOnce<PersonalRelModel>(PersonalRelCollection, getSystemQuery(tenantId))
        : Promise.resolve<PersonalRelModel[]>([]),
    ]);

    const channelSet = new Set<VcardChannelType>();
    for (const a of addresses ?? []) {
      const c = mapChannel(a.addressChannel);
      if (c && channelHasValue(a, c)) channelSet.add(c);
    }

    const hasWorkRels = kind === 'person'
      ? (workrels ?? []).some((w) => w.subjectKey === target.bkey)
      : (workrels ?? []).some((w) => w.objectKey === target.bkey);
    const hasPersonalRels = kind === 'person'
      && (personalRels ?? []).some((r) => r.subjectKey === target.bkey || r.objectKey === target.bkey);

    return {
      addresses: CHANNEL_ORDER.filter((c) => channelSet.has(c)),
      birthday: kind === 'person' && !!target.dateOfBirth && target.dateOfBirth.length > 0,
      photo: !!avatar?.storagePath,
      workRels: hasWorkRels,
      personalRels: hasPersonalRels,
      orgLinks: false,
    };
  }

  private async openScopeModal(availability: ScopeAvailability, kind: VcardTargetKind): Promise<ExportScope | undefined> {
    const modal = await this.modalController.create({
      component: VcardExportScopeModal,
      componentProps: { availability, kind },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<ExportScope>();
    return role === 'confirm' ? data : undefined;
  }
}
