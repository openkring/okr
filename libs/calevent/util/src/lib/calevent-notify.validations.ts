import { enforce, only, staticSuite, test } from 'vest';

import { CalEventNotifyFormData, MAX_NOTIFY_MESSAGE_LENGTH } from './calevent-notify.model';

/**
 * A notice needs text and nothing else — the recipients are derived server-side and the scope
 * always carries a valid default. The length cap mirrors the Cloud Function's, so a message the
 * server would refuse never leaves the form.
 */
export const calEventNotifyValidations = staticSuite((model: CalEventNotifyFormData, field?: string) => {
  if (field) only(field);

  // bare key: ErrorNote resolves it as 'validation.<key>' in the main bundle
  test('message', 'calEventNotifyMessageMandatory', () => {
    enforce(model.message?.trim()).isNotEmpty();
  });
  test('message', 'calEventNotifyMessageTooLong', () => {
    enforce(model.message?.length ?? 0).lessThanOrEquals(MAX_NOTIFY_MESSAGE_LENGTH);
  });
});
