export interface SwissCity {
  zipCode: string;
  name: string;
  stateCode: string;
  countryCode: string;
}

export const SwissCitiesCollection = 'swissCities';

export const emptySwissCityList = [
  {
    zipCode: 0,
    name: 'Die Daten werden geladen ...',
    stateCode: '',
    countryCode: '',
  },
];
