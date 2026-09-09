/** One lexed vCard property line, params normalized to upper-case keys. */
export interface VcardProperty {
  /** `item1` in `item1.URL:…`, else undefined. */
  group?: string;
  /** upper-cased property name, e.g. `TEL`, `X-ABLabel` keeps its casing. */
  name: string;
  /** upper-cased param name → values; bare 2.1 tokens are folded into `TYPE`. */
  params: Record<string, string[]>;
  /** unescaped, decoded value. */
  value: string;
  /** the value exactly as it appeared, for the residual notes block (§4.6). */
  rawValue: string;
}
