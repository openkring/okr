/**
 * Public-safe projection of a form definition for the anonymous `getFormDefinition` gateway — whitelist only.
 *
 * The public renderer needs the fields as stored, including each field's `visibleIf` rule and `asProperty`
 * flag (without them it would show every field), and the author's `fillerHelpText` for the (i) help.
 * `encryptionSalt` is needed client-side for file encryption and is not secret.
 *
 * Deliberately NOT projected: `encryptionKeyHash` (never exposed), audit data, and `derivedValues` — derived
 * values are computed on the server at submission; the public renderer never reads them (only the builder
 * preview does, from the full document).
 */
export function projectPublicFormDefinition(
  docId: string,
  data: Record<string, unknown>,
  formKey: string,
  tenantId: string,
): Record<string, unknown> {
  return {
    okey: docId,
    tenants: data['tenants'] ?? [tenantId],
    isArchived: data['isArchived'] ?? false,
    name: data['name'] ?? '',
    description: data['description'] ?? '',
    fillerHelpText: data['fillerHelpText'] ?? '',
    formKey: data['formKey'] ?? formKey,
    honeypotKey: data['honeypotKey'] ?? '',
    encryptionSalt: data['encryptionSalt'] ?? '',
    pdfTemplateId: data['pdfTemplateId'] ?? '',
    target: data['target'] ?? { kind: 'collection', mappingKey: '', modelType: '', collectionName: '' },
    fields: data['fields'] ?? [],
    version: data['version'] ?? 1,
  };
}
