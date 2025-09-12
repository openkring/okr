export interface YearConfig {
  years: number[]; // e.g. [2021, 2020, 2019, 2018, 2017, 2016]
  selectedYear: number;
  fieldName: string; // a date field, e.g. validFrom, validTo
  label: string;
  // maybe we add an operator later:  ==, >=, <=, >, <
}
