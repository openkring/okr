// apps/functions/src/_gateway/adapters/oecd.fixture.ts
// Minimal but shape-accurate SDMX-JSON (?format=jsondata,
// dimensionAtObservation=AllDimensions): 2 dims (REF_AREA, TIME_PERIOD), 2 obs.
export const OECD_SAMPLE = {
  meta: { prepared: '2026-07-20T09:00:00Z' },
  data: {
    structures: [
      {
        dimensions: {
          observation: [
            { id: 'REF_AREA', name: 'Reference area', values: [{ id: 'CHE', name: 'Switzerland' }] },
            {
              id: 'TIME_PERIOD',
              name: 'Time period',
              values: [
                { id: '2023', name: '2023' },
                { id: '2024', name: '2024' },
              ],
            },
          ],
        },
      },
    ],
    dataSets: [
      { observations: { '0:0': [1.2], '0:1': [1.5] } },
    ],
  },
};
