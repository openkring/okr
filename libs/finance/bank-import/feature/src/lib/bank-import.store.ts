import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { BANK_CSV_MIMETYPES } from '@okr/shared-constants';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { BankImportRowModel, BankImportRowStatus, BankProfileModel, BankRuleModel } from '@okr/shared-models';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { UploadService } from '@okr/avatar-data-access';
import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { leafAccounts } from '@okr/finance-account-util';
import { BankImportRowService, PostBankImportResult } from '@okr/finance-bank-import-data-access';
import { BANK_IMPORT_I18N_KEYS, BankImportError, computeImportKeys, parseStatement, ParsedWarning, toImportRows } from '@okr/finance-bank-import-util';
import { BankProfileService } from '@okr/finance-bank-profile-data-access';
import { BankProfileStore } from '@okr/finance-bank-profile-feature';
import { BankRuleService } from '@okr/finance-bank-rule-data-access';
import { BankRuleStore } from '@okr/finance-bank-rule-feature';
import { applyRules } from '@okr/finance-bank-rule-util';
import { VatCodeService } from '@okr/finance-vat-code-data-access';

export type BankImportStatusFilter = BankImportRowStatus | 'all' | 'open';

type BankImportState = { statusFilter: BankImportStatusFilter; profileFilter: string; searchTerm: string };

export const BankImportStore = signalStore(
  withState<BankImportState>({ statusFilter: 'open', profileFilter: '', searchTerm: '' }),
  withProps(() => ({
    rowService: inject(BankImportRowService),
    profileService: inject(BankProfileService),
    ruleService: inject(BankRuleService),
    accountService: inject(AccountService),
    vatCodeService: inject(VatCodeService),
    accountingStore: inject(AccountingStore),
    profileStore: inject(BankProfileStore),
    ruleStore: inject(BankRuleStore),
    appStore: inject(AppStore),
    uploadService: inject(UploadService),
    alertService: inject(AlertService),
    modalController: inject(ModalController),
    router: inject(Router),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BANK_IMPORT_I18N_KEYS),
    rowsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.rowService.list(params.id) : of([]),
    }),
    profilesResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.profileService.list(params.id) : of([]),
    }),
    accountsResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.accountService.list(params.id) : of([]),
    }),
    vatCodesResource: rxResource({
      params: resourceParams(() => ({ id: store.accountingStore.accountingTenantId() })),
      stream: ({ params }) => params.id ? store.vatCodeService.list(params.id) : of([]),
    }),
  })),
  withComputed(store => ({
    rows: computed(() => store.rowsResource.value() ?? []),
    profiles: computed(() => store.profilesResource.value() ?? []),
    accounts: computed(() => leafAccounts(store.accountsResource.value() ?? [])),
    vatCodes: computed(() => store.vatCodesResource.value() ?? []),
    isLoading: computed(() => store.rowsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
  })),
  withComputed(store => ({
    counts: computed(() => {
      const c = { unmapped: 0, mapped: 0, posted: 0, error: 0 };
      store.rows().forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
      return c;
    }),
    filtered: computed(() => {
      const f = store.statusFilter();
      const p = store.profileFilter();
      const term = store.searchTerm().toLowerCase();
      return store.rows().filter(r =>
        (f === 'all' || (f === 'open' ? r.status !== 'posted' : r.status === f))
        && (!p || r.bankProfileKey === p)
        && (!term || r.rawText.toLowerCase().includes(term) || r.title.toLowerCase().includes(term) || r.payee.toLowerCase().includes(term)));
    }),
  })),
  withMethods(store => ({
    setAccountingTenant(id: string): void { store.accountingStore.setTenant(id); },
    setStatusFilter(statusFilter: BankImportStatusFilter): void { patchState(store, { statusFilter }); },
    setProfileFilter(profileFilter: string): void { patchState(store, { profileFilter }); },
    setSearchTerm(searchTerm: string): void { patchState(store, { searchTerm }); },

    /** Error/warning code → user-facing text (i18n keys resolved by the store). */
    errorText(code: string): string {
      const map: Record<string, () => string> = {
        'unknown-format': store.i18n.error_unknown_format, 'no-iban': store.i18n.error_no_iban,
        'format-not-implemented': store.i18n.error_format_not_implemented, 'empty-file': store.i18n.error_empty_file,
        'not-mapped': store.i18n.post_error_not_mapped, 'period-locked': store.i18n.post_error_period_locked,
        'account-invalid': store.i18n.post_error_account_invalid, 'profile-missing': store.i18n.post_error_profile_missing,
        'unbalanced': store.i18n.post_error_unbalanced,
      };
      return (map[code] ?? store.i18n.post_error_unknown)();
    },

    warningText(w: ParsedWarning): string {
      const map: Record<ParsedWarning['code'], () => string> = {
        'line-skipped': store.i18n.warning_line_skipped, 'saldo-mismatch': store.i18n.warning_saldo_mismatch,
        'iban-mismatch': store.i18n.warning_iban_mismatch, 'currency-mismatch': store.i18n.warning_currency_mismatch,
        'rule-regex-invalid': store.i18n.warning_rule_regex_invalid,
      };
      return `${w.lineNo ? w.lineNo + ': ' : ''}${map[w.code]()}${w.detail ? ' (' + w.detail + ')' : ''}`;
    },
  })),
  withMethods(store => ({
    /**
     * §6.2. The file dialog must open inside the user gesture — no await before pickFile().
     */
    async importFile(): Promise<void> {
      const file = await store.uploadService.pickFile(BANK_CSV_MIMETYPES);
      if (!file) return;
      const accountingTenantId = store.accountingTenantId();
      const tenantId = store.appStore.tenantId();
      let statement;
      try {
        statement = parseStatement(await file.text());
      } catch (e) {
        const code = e instanceof BankImportError ? e.code : 'unknown-format';
        const detail = e instanceof BankImportError ? e.detail : '';
        await store.alertService.confirm(`${store.errorText(code)} ${detail}`.trim());
        return;
      }

      // profile by IBAN, or create one. A file without an account number (legacy ZKB layout) maps to the
      // tenant's only profile of that format; with none or several, the treasurer picks/enters the IBAN.
      let profile = statement.iban
        ? await store.profileService.findByIban(accountingTenantId, statement.iban)
        : await store.profileService.findSingleByFormat(accountingTenantId, statement.format);
      if (!profile) {
        const proposal = new BankProfileModel(tenantId, accountingTenantId);
        proposal.format = statement.format;
        proposal.iban = statement.iban;
        proposal.bankName = statement.bankName;
        proposal.currency = statement.currency;
        profile = await store.profileStore.openEdit(proposal, false);
        if (!profile?.okey) { await store.alertService.confirm(store.i18n.import_cancelled()); return; }
      }

      // keys, rows, rules, duplicates
      const iban = statement.iban || profile.iban;
      const keys = await computeImportKeys(statement.rows.map(r => ({ iban, date: r.date, amount: r.amount, bankReference: r.bankReference, rawText: r.rawText })));
      const ctx = { tenantId, accountingTenantId, bankProfileKey: profile.okey, sourceFileName: file.name,
        importedBy: store.currentUser()?.okey ?? '', importedAt: getTodayStr(DateFormat.StoreDateTime) };
      const all = toImportRows(statement, keys, ctx);
      const existing = await store.rowService.existingKeys(accountingTenantId, keys);
      const fresh = all.filter(r => !existing.has(r.importKey));
      const rules = await store.ruleService.listOnce(accountingTenantId);
      const { rows: mapped, invalidRuleKeys } = applyRules(fresh, rules);
      if (mapped.length > 0) {
        const ok = await store.rowService.createMany(mapped);
        if (!ok) {
          store.rowsResource.reload();
          await store.alertService.confirm(store.i18n.create_error());
          return;
        }
      }
      store.rowsResource.reload();

      const warnings = [...statement.warnings, ...invalidRuleKeys.map(k => ({ code: 'rule-regex-invalid' as const, lineNo: 0, detail: k }))];
      const summary = [
        `${store.i18n.import_summary_parsed()}: ${statement.rows.length}`,
        `${store.i18n.import_summary_new()}: ${mapped.length}`,
        `${store.i18n.import_summary_duplicates()}: ${all.length - fresh.length}`,
        `${store.i18n.import_summary_mapped()}: ${mapped.filter(r => r.status === 'mapped').length}`,
        `${store.i18n.import_summary_unmapped()}: ${mapped.filter(r => r.status === 'unmapped').length}`,
        ...(warnings.length ? [`${store.i18n.import_summary_warnings()}:`, ...warnings.map(w => store.warningText(w))] : []),
      ].join('\n');
      await store.alertService.confirm(`${store.i18n.import_summary_title()}\n${summary}`);
    },

    /** "Regeln anwenden": re-run the rules over every open row of the tenant and persist the changes. */
    async applyRulesToOpenRows(): Promise<void> {
      try {
        const rules = await store.ruleService.listOnce(store.accountingTenantId());
        const open = store.rows().filter(r => r.status === 'unmapped' || r.status === 'mapped');
        const { rows } = applyRules(open, rules);
        const changed = rows.filter((r, i) => r.status !== open[i].status || r.ruleKey !== open[i].ruleKey || r.title !== open[i].title || r.accountKey !== open[i].accountKey);
        const ok = changed.length === 0 ? true : await store.rowService.updateMany(changed);
        store.rowsResource.reload();
        if (!ok) { await store.alertService.confirm(store.i18n.update_error()); return; }
        await store.alertService.showToast(store.i18n.apply_rules_conf());
      } catch (ex) {
        console.error('BankImportStore.applyRulesToOpenRows -> ERROR:', ex);
        store.rowsResource.reload();
        await store.alertService.confirm(store.errorText('unknown'));
      }
    },

    /** "Buchen": all mapped rows of the current filter, or the given keys; chunked at 100. */
    async post(rowKeys?: string[]): Promise<void> {
      const keys = rowKeys ?? store.filtered().filter(r => r.status === 'mapped').map(r => r.okey);
      if (keys.length === 0) { await store.alertService.confirm(store.i18n.post_nothing()); return; }
      try {
        const total: PostBankImportResult = { posted: 0, failed: [] };
        for (let i = 0; i < keys.length; i += 100) {
          const res = await store.rowService.postViaFunction({ accountingTenantId: store.accountingTenantId(), rowKeys: keys.slice(i, i + 100) });
          total.posted += res.posted;
          total.failed.push(...res.failed);
        }
        store.rowsResource.reload();
        const lines = [
          `${store.i18n.post_summary_posted()}: ${total.posted}`,
          `${store.i18n.post_summary_failed()}: ${total.failed.length}`,
          ...total.failed.map(f => `${f.rowKey.slice(0, 8)}… ${store.errorText(f.reason)}`),
        ];
        await store.alertService.confirm(`${store.i18n.post_summary_title()}\n${lines.join('\n')}`);
      } catch (ex) {
        console.error('BankImportStore.post -> ERROR:', ex);
        store.rowsResource.reload();
        await store.alertService.confirm(store.errorText('unknown'));
      }
    },

    /** "Regel erstellen": propose a rule from the row (§5.3); on save re-apply rules to open rows. */
    async createRuleFrom(row: BankImportRowModel): Promise<void> {
      const term = row.payee || row.rawText.split(' ').slice(0, 3).join(' ');
      const title = term.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase());
      const saved: BankRuleModel | undefined = await store.ruleStore.openCreate({ condition: 'contains', term, title });
      if (saved) await this.applyRulesToOpenRows();
    },

    /** "Konto zuweisen": one-off title/account/VAT on this row, no rule. */
    async assign(row: BankImportRowModel): Promise<void> {
      const { BankImportRowEditModal } = await import('@okr/finance-bank-import-ui');
      const modal = await store.modalController.create({
        component: BankImportRowEditModal,
        componentProps: { row, accounts: store.accounts(), vatCodes: store.vatCodes(), currentUser: store.currentUser() },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role !== 'confirm' || !data) return;
      const edited = { ...(data as BankImportRowModel), ruleKey: '', status: 'mapped' as const, error: '' };
      await store.rowService.update(edited, store.currentUser());
      store.rowsResource.reload();
    },

    async deleteRow(row: BankImportRowModel): Promise<void> {
      if (row.status === 'posted') return;
      await store.rowService.delete(row);
      store.rowsResource.reload();
    },

    /** "Buchung öffnen": the journal of the accounting tenant (the booking is found by its number/title). */
    async openBooking(row: BankImportRowModel): Promise<void> {
      if (!row.bookingKey) return;
      await store.router.navigate(['/accounting', store.accountingTenantId(), 'journal', 'journal-context']);
    },
  })),
);
