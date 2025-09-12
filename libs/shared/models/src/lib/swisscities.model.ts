export interface SwissCity {
  zipCode: number;
  name: string;
  stateCode: string;
  countryCode: string;
}

export const SwissCitiesCollection = 'swissCities2';

export const emptySwissCityList = [
  {
    zipCode: 0,
    name: 'Die Daten werden geladen ...',
    stateCode: '',
    countryCode: '',
  },
];
