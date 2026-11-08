/**
 * Public-safe projection of a form definition for the anonymous `getFormDefinition` gateway — whitelist only.
 *
 * The public renderer needs the fields as stored, including each field's `visibleIf` rule and `asProperty`
 * flag (without them it would show every field), and the author's `fillerHelpText` for the (i) help.
 * `encryptionSalt` is needed client-side for file encryption and is not secret.
 *
 * Deliberately NOT projected: `encryptionKeyHash` (never exposed), audit data, and `derivedValues` — derived
 * values are computed on the server at submission; the public renderer never reads them (only the builder
 * preview does, from the full document). Nor the thank-you texts (`confirmationMessage`,
 * `confirmationVariants`): `submitForm` returns the filled-in text after a submit (1.125 B). The acceptance
 * settings travel as the computed `availability` that `getFormDefinition` adds, not as raw fields.
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
    // 1.125 B — the renderer only needs to know a thank-you mail goes out, never its text
    sendFillerConfirmation: data['sendFillerConfirmation'] === true,
  };
}

/** One category list as the static website needs it to render a 'category' field: the item keys only. */
export interface PublicCategoryList {
  name: string;
  items: { name: string; abbreviation: string }[];
}

/** The names of the category lists a form's 'category' fields need, each once, in form order. */
export function categoryNamesOfFields(fields: unknown): string[] {
  const names: string[] = [];
  for (const f of Array.isArray(fields) ? fields as Record<string, unknown>[] : []) {
    const name = f?.['type'] === 'category' ? f['categoryName'] : undefined;
    if (typeof name === 'string' && name !== '' && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * The category lists for an anonymous renderer without Firestore access (the static website, which
 * asks `getFormDefinition` with `withCategories`). Only lists of this tenant or the shared `system`
 * lists, never archived ones, and only the item keys — labels are translated by the caller.
 * When a tenant has its own list of a name, it wins over the `system` one.
 */
export function projectPublicCategories(
  docs: Record<string, unknown>[],
  names: string[],
  tenantId: string,
): PublicCategoryList[] {
  const result: PublicCategoryList[] = [];
  for (const name of names) {
    const candidates = docs.filter(d => d['name'] === name && d['isArchived'] !== true && Array.isArray(d['tenants']));
    const own = candidates.find(d => (d['tenants'] as unknown[]).includes(tenantId));
    const shared = candidates.find(d => (d['tenants'] as unknown[]).includes('system'));
    const doc = own ?? shared;
    if (!doc) continue;
    const items = (Array.isArray(doc['items']) ? doc['items'] as Record<string, unknown>[] : [])
      .filter(i => typeof i?.['name'] === 'string' && i['name'] !== '')
      .map(i => ({ name: i['name'] as string, abbreviation: typeof i['abbreviation'] === 'string' ? i['abbreviation'] : '' }));
    result.push({ name, items });
  }
  return result;
}
