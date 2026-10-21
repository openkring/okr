import { Injector } from '@angular/core';
import { ModalController } from '@ionic/angular';

import { AppStore } from '@okr/shared-feature';
import { ExpenseService } from '@okr/finance-expense-data-access';
import { canEditExpense } from '@okr/finance-expense-util';

/**
 * Opens the treasurer's edit modal for the expense a task belongs to, instead of the task modal:
 * the task only says «review this expense», the work happens on the expense (setting it to
 * «Erledigt» completes the task server-side). Called from the task list and the dashboard through
 * a dynamic import, so neither bundle carries the expense feature.
 *
 * Resolves false — the caller then opens the task as before — when the user may not edit expenses
 * or the expense cannot be read (deleted, or another tenant's).
 */
export async function openExpenseOfTask(injector: Injector, expenseKey: string): Promise<boolean> {
  const currentUser = injector.get(AppStore).currentUser();
  const expense = await injector.get(ExpenseService).readOnce(expenseKey);
  if (!expense || expense.isArchived || !canEditExpense(expense, currentUser)) return false;
  const { ExpenseEditModal } = await import('./expense-edit.modal');
  const modal = await injector.get(ModalController).create({
    component: ExpenseEditModal,
    componentProps: { expense },
  });
  await modal.present();
  await modal.onDidDismiss();
  return true;
}
