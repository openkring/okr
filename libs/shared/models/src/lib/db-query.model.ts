export type QueryValueType = string | number | number[] | boolean; // number[] is needed for: category in [5, 6]

export interface DbQuery {
  key: string;
  operator: string;
  value: QueryValueType;
}
