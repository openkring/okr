export type QueryValueType = string | number | number[] | string[] | boolean; // number[] is needed for: category in [5, 6]; string[] for: tenants array-contains-any ['scs', 'system']

export interface DbQuery {
  key: string;
  operator: string;
  value: QueryValueType;
}
