import { CategoryModel, RegexType } from '@bk2/shared-models';

export type RegexTypeCategory = CategoryModel;

export const REGEX_TYPES: RegexTypeCategory[] = 
[
  {
    id: RegexType.SimpleName,
    abbreviation: 'Name',
    name: 'simpleName',
    i18nBase: 'core.regex.simpleName',
    icon: 'globe'
  },
  {
    id: RegexType.Phone,
    abbreviation: 'PHONE',
    name: 'phone',
    i18nBase: 'core.regex.phone',
    icon: 'globe'
  },
  {
    id: RegexType.UserName,
    abbreviation: 'UID',
    name: 'userName',
    i18nBase: 'core.regex.userName',
    icon: 'globe'
  },
  {
    id: RegexType.Password,
    abbreviation: 'PWD',
    name: 'password',
    i18nBase: 'core.regex.password',
    icon: 'globe'
  },
  {
    id: RegexType.Iban,
    abbreviation: 'IBAN',
    name: 'iban',
    i18nBase: 'core.regex.iban',
    icon: 'globe'
  },
  {
    id: RegexType.AHVN13,
    abbreviation: 'AHV',
    name: 'ahvn13',
    i18nBase: 'core.regex.ahvn13',
    icon: 'globe'
  },
  {
    id: RegexType.MacAddress,
    abbreviation: 'MACA',
    name: 'macAddress',
    i18nBase: 'core.regex.macAddress',
    icon: 'globe'
  },
  {
    id: RegexType.PLZ,
    abbreviation: 'PLZ',
    name: 'plz',
    i18nBase: 'core.regex.plz',
    icon: 'globe'
  },
  {
    id: RegexType.CC_Visa_MC,
    abbreviation: 'VMC',
    name: 'creditCard',
    i18nBase: 'core.regex.creditCard',
    icon: 'globe'
  },
  {
    id: RegexType.FilePath,
    abbreviation: 'FPATH',
    name: 'filePath',
    i18nBase: 'core.regex.filePath',
    icon: 'globe'
  },
]
