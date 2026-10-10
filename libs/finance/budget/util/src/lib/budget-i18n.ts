import { Signal } from '@angular/core';

const PFX = '@finance/budget/feature.';

/** The `i18n` scope of the budget feature (bundle lives in the feature lib). */
export const BUDGET_I18N_SCOPE = '@finance/budget/feature';

/** Params use single braces (`{name}`) and are filled by a `fill()` helper, never `{{name}}`. */
export const BUDGET_I18N_KEYS = {
  budgets:              PFX + 'budgets',
  list_title:           PFX + 'list.title',
  grid_title:           PFX + 'grid.title',
  compare_title:        PFX + 'compare.title',
  empty:                PFX + 'empty',
  grid_empty:           PFX + 'grid.empty',
  grid_expense:         PFX + 'grid.expense',
  grid_revenue:         PFX + 'grid.revenue',
  grid_net:             PFX + 'grid.net',
  grid_total:           PFX + 'grid.total',
  grid_unassigned:      PFX + 'grid.unassigned',
  grid_frozen:          PFX + 'grid.frozen',
  grid_frozenSuperseded: PFX + 'grid.frozenSuperseded',
  grid_frozenArchived:  PFX + 'grid.frozenArchived',
  grid_frozenExternal:  PFX + 'grid.frozenExternal',
  grid_unbudgeted:      PFX + 'grid.unbudgeted',
  grid_notFound:        PFX + 'grid.notFound',
  compare_empty:        PFX + 'compare.empty',
  compare_versionA:     PFX + 'compare.versionA',
  compare_versionB:     PFX + 'compare.versionB',
  compare_noneB:        PFX + 'compare.noneB',
  compare_unknownCenter: PFX + 'compare.unknownCenter',
  compare_noVersion:    PFX + 'compare.noVersion',
  compare_expand:       PFX + 'compare.expand',
  compare_collapse:     PFX + 'compare.collapse',
  noApproved:           PFX + 'noApproved',
  noCostCenter:         PFX + 'noCostCenter',
  fiscalYear_select:    PFX + 'fiscalYear.select',

  status_draft:         PFX + 'status.draft',
  status_approved:      PFX + 'status.approved',
  status_superseded:    PFX + 'status.superseded',
  status_archived:      PFX + 'status.archived',

  kind_budget:          PFX + 'kind.budget',
  kind_forecast:        PFX + 'kind.forecast',

  body_gv:              PFX + 'body.gv',
  body_board:           PFX + 'body.board',

  newVersion:           PFX + 'action.newVersion',
  copyFrom:             PFX + 'action.copyFrom',
  approve:              PFX + 'action.approve',
  archive:              PFX + 'action.archive',
  compare:              PFX + 'action.compare',
  addLine:              PFX + 'action.addLine',
  view:                 PFX + 'action.view',
  update:               PFX + 'action.update',
  open:                 PFX + 'action.open',
  deleteLine:           PFX + 'action.deleteLine',

  approve_conf:         PFX + 'confirm.approve',
  archive_conf:         PFX + 'confirm.archive',
  copy_conf:            PFX + 'confirm.copy',
  deleteLine_conf:      PFX + 'confirm.deleteLine',

  toast_approved:       PFX + 'toast.approved',
  toast_frozen:         PFX + 'toast.frozen',
  toast_error:          PFX + 'toast.error',

  col_budget:           PFX + 'col.budget',
  col_actual:           PFX + 'col.actual',
  col_remaining:        PFX + 'col.remaining',
  col_used:             PFX + 'col.used',
  col_difference:       PFX + 'col.difference',

  // version form
  name:                 PFX + 'name.label',
  name_placeholder:     PFX + 'name.placeholder',
  name_helper:          PFX + 'name.helper',
  kind:                 PFX + 'kind.label',
  fiscalYear:           PFX + 'fiscalYear.label',
  fiscalYear_helper:    PFX + 'fiscalYear.helper',
  notes:                PFX + 'notes.label',
  notes_placeholder:    PFX + 'notes.placeholder',

  baseVersion:          PFX + 'baseVersion.label',

  // approval form
  approvedAt:           PFX + 'approvedAt.label',
  approvedAt_placeholder: PFX + 'approvedAt.placeholder',
  approve_supersedes:   PFX + 'approve.supersedes',
  approve_supersedesNone: PFX + 'approve.supersedesNone',
  approvedBy:           PFX + 'approvedBy.label',
  approvedBy_invalid:   PFX + 'approvedBy.invalid',
  approvalRef:          PFX + 'approvalRef.label',
  approvalRef_placeholder: PFX + 'approvalRef.placeholder',
  approvalRef_helper:   PFX + 'approvalRef.helper',

  // line form
  costCenterKey:        PFX + 'costCenterKey.label',
  costCenterKey_helper: PFX + 'costCenterKey.helper',
  costCenterKey_notLeaf: PFX + 'costCenterKey.notLeaf',
  accountKey:           PFX + 'accountKey.label',
  accountKey_helper:    PFX + 'accountKey.helper',
  accountKey_notBudgetable: PFX + 'accountKey.notBudgetable',
  accountKey_duplicate: PFX + 'accountKey.duplicate',
  amount:               PFX + 'amount.label',
  amount_helper:        PFX + 'amount.helper',

  as_title:             '@actionsheet.title',
  save:                 '@save.label',
  cancel:               '@cancel',
  ok:                   '@ok',
} satisfies Record<string, string>;

export type BudgetI18n = { [K in keyof typeof BUDGET_I18N_KEYS]: Signal<string> };
