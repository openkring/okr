// weather-rain-radar is deliberately NOT exported: it pulls in Leaflet and is loaded
// dynamically by weather-section.ts. Re-exporting it here would make that edge static again.
export * from './lib/weather-section';
