import { inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withMethods, withProps } from '@ngrx/signals';

import { BANK_IMPORT_MIMETYPES } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';

import { UploadService } from '@okr/avatar-data-access';
import { AccountService } from '@okr/finance-account-data-access';
import { AccountingStore } from '@okr/finance-accounting-feature';
import { leafAccounts } from '@okr/finance-account-util';
import { BankImportRowService } from '@okr/finance-bank-import-data-access';
import {
  BANK_IMPORT_I18N_KEYS, BankImportError, compareJournalSums, importableJournalRows, journalAccountSums, JournalAccountMap,
  matchesBexioJournalHeader, parseBexioJournal, ParsedWarning, PostJournalImportResult, resolveJournalAccounts, toJournalEntries,
} from '@okr/finance-bank-import-util';

/**
 * bexio journal import (spec 1.60 §12), reached from the journal's context menu. Root-provided and
 * loaded on demand by the booking store, so the journal page pays for the bank-import libs only
 * when the treasurer actually imports. The journal never enters the bank-import staging list.
 */
export const JournalImportStore = signalStore(
  { providedIn: 'root' },
  withProps(() => ({
    rowService: inject(BankImportRowService),
    accountService: inject(AccountService),
    accountingStore: inject(AccountingStore),
    uploadService: inject(UploadService),
    alertService: inject(AlertService),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BANK_IMPORT_I18N_KEYS),
  })),
  withMethods(store => ({
    errorText(code: string): string {
      const map: Record<string, () => string> = {
        'unknown-format': store.i18n.error_unknown_format, 'empty-file': store.i18n.error_empty_file,
        'period-locked': store.i18n.post_error_period_locked, 'account-invalid': store.i18n.journal_error_account_invalid,
        'zero-amount': store.i18n.journal_error_zero_amount, 'date-invalid': store.i18n.journal_error_date_invalid,
      };
      return (map[code] ?? store.i18n.post_error_unknown)();
    },
    warningText(w: ParsedWarning): string {
      return `${w.lineNo ? w.lineNo + ': ' : ''}${store.i18n.warning_line_skipped()}${w.detail ? ' (' + w.detail + ')' : ''}`;
    },
  })),
  withMethods(store => ({
    /**
     * Parse the journal, map its account numbers onto the chart of accounts, confirm the mapping,
     * post the entries in chunks of 100 and compare the per-account sums with the file.
     * The file dialog must open inside the user gesture — no await before pickFile().
     */
    async importFile(): Promise<void> {
      const file = await store.uploadService.pickFile(BANK_IMPORT_MIMETYPES);
      if (!file) return;
      const accountingTenantId = store.accountingStore.accountingTenantId();
      const text = await file.text();
      if (!matchesBexioJournalHeader(text)) {
        await store.alertService.confirm(`${store.errorText('unknown-format')} ${text.split('\n')[0]?.slice(0, 80) ?? ''}`.trim());
        return;
      }
      let journal;
      try {
        journal = parseBexioJournal(text);
      } catch (e) {
        const code = e instanceof BankImportError ? e.code : 'unknown-format';
        await store.alertService.confirm(`${store.errorText(code)} ${e instanceof BankImportError ? e.detail : ''}`.trim());
        return;
      }
      const rows = importableJournalRows(journal);
      if (rows.length === 0) { await store.alertService.confirm(store.i18n.journal_nothing()); return; }

      // mapping: by number against the leaf accounts; the treasurer confirms (and completes) it once
      const accounts = await store.accountService.listOnce(accountingTenantId);
      const proposal: JournalAccountMap = { entries: resolveJournalAccounts(rows, accounts) };
      const { JournalAccountMapModal } = await import('@okr/finance-bank-import-ui');
      const modal = await store.modalController.create({
        component: JournalAccountMapModal,
        componentProps: { mapping: proposal, accounts: leafAccounts(accounts) },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role !== 'confirm' || !data) { await store.alertService.confirm(store.i18n.import_cancelled()); return; }
      const mapping = (data as JournalAccountMap).entries;

      // post in chunks; the callable is idempotent per bexio id
      const entries = toJournalEntries(rows, mapping);
      const total: PostJournalImportResult = { posted: 0, replayed: 0, failed: [], sums: {} };
      try {
        for (let i = 0; i < entries.length; i += 100) {
          const res = await store.rowService.postJournalViaFunction({ accountingTenantId, entries: entries.slice(i, i + 100) });
          total.posted += res.posted;
          total.replayed += res.replayed;
          total.failed.push(...res.failed);
          for (const [key, sum] of Object.entries(res.sums ?? {})) total.sums[key] = (total.sums[key] ?? 0) + sum;
        }
      } catch (ex) {
        console.error('JournalImportStore.importFile -> ERROR:', ex);
        await store.alertService.confirm(store.errorText('unknown'));
        return;
      }

      // post-check: the file's own per-account sums against what the ledger now holds for this file
      const diffs = compareJournalSums(journalAccountSums(rows), mapping, total.sums);
      const lines = [
        `${store.i18n.journal_summary_rows()}: ${journal.rows.length}`,
        `${store.i18n.journal_summary_skipped()}: ${journal.rows.length - rows.length}`,
        `${store.i18n.journal_summary_posted()}: ${total.posted}`,
        `${store.i18n.journal_summary_replayed()}: ${total.replayed}`,
        `${store.i18n.journal_summary_failed()}: ${total.failed.length}`,
        ...total.failed.map(f => `${f.id}: ${store.errorText(f.reason)}`),
        ...(diffs.length
          ? [`${store.i18n.journal_summary_diff()}:`, ...diffs.map(d => `${d.no}: ${d.file} / ${d.ledger}`)]
          : [store.i18n.journal_summary_diff_ok()]),
        ...(journal.warnings.length ? [`${store.i18n.import_summary_warnings()}:`, ...journal.warnings.map(w => store.warningText(w))] : []),
      ];
      await store.alertService.confirm(`${store.i18n.journal_summary_title()}\n${lines.join('\n')}`);
    },
  })),
);
