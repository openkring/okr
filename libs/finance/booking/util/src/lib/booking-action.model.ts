/** Matches a booking by its accounting tenant and any of the account numbers present on its lines. */
export interface BookingTrigger {
  accountingTenantId: string;   // = BookingModel.accountingTenantId
  accountIds: string[];         // = AccountModel.id (account numbers, e.g. ['3401', '3407'])
}

interface BaseBookingAction {
  id: string;          // stable, unique, e.g. 'gss-spende-receipt'
  labelKey: string;    // i18n key shown in the ActionSheet
  icon: string;        // svgIcon name
  trigger: BookingTrigger;
}

/** Generate a document from a published template and open it. */
export interface GenerateDocumentAction extends BaseBookingAction {
  type: 'generateDocument';
  templateId: string;
  outputFormat?: 'pdf' | 'docx';            // default 'pdf'
  staticPayload?: Record<string, unknown>;  // merged into the built payload (e.g. logoUrl)
  /** Row label per trigger account on the generated document, e.g. { '3407': 'Spende' }. Falls back to the account name. */
  accountLabels?: Record<string, string>;
}

/** Future variant — open a task to a responsible person. Not dispatched yet. */
export interface CreateTaskAction extends BaseBookingAction {
  type: 'createTask';
  responsibleKey: string;
  taskTitleKey: string;
}

export type BookingAction = GenerateDocumentAction | CreateTaskAction;
