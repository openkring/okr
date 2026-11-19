// Trainer-Abrechnung (spec 1.167): the trainer's monthly invoice — preview, send to the treasurer, download.
export { previewTrainerInvoice } from './preview-trainer-invoice';
export { sendTrainerInvoice } from './send-trainer-invoice';
export { downloadTrainerInvoice } from './download-trainer-invoice';
export { rejectTrainerInvoice } from './reject-trainer-invoice';
export { markTrainerInvoicePaid } from './mark-trainer-invoice-paid';
// Triggers: the invoice state follows its Kreditor; the profile's tenants follow the person's agreements.
export { onBillWrittenTrainerMirror } from './on-bill-written';
export { onTrainerAgreementWritten } from './on-trainer-agreement-written';
