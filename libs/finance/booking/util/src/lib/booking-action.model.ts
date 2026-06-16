/** Matches a booking by its accounting tenant and an account number present on its lines. */
export interface BookingTrigger {
  accountingTenantId: string;   // = BookingModel.accountingTenantId
  accountId: string;            // = AccountModel.id (account number, e.g. '3407')
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
}

/** Future variant — open a task to a responsible person. Not dispatched yet. */
export interface CreateTaskAction extends BaseBookingAction {
  type: 'createTask';
  responsibleKey: string;
  taskTitleKey: string;
}

export type BookingAction = GenerateDocumentAction | CreateTaskAction;
