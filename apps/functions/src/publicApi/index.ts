import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import corsLib from 'cors';

import { orgRouter } from './routes/org';
import { contentRouter } from './routes/content';
import { newsRouter } from './routes/news';
import { calendarRouter } from './routes/calendar';
import { contactRouter } from './routes/contact';
import { coursesRouter, resultsRouter } from './routes/stubs';
import { pageRouter } from './routes/page';

// Restrict cross-origin browser access to known site origins instead of
// reflecting any origin (L-4). The primary consumer is the bundled /web site,
// which calls this via the same-origin /web/api/** rewrite (no CORS), and
// server-side callers send no Origin header — both remain allowed. Add any
// production custom domain that fetches this API cross-origin from the browser.
const ALLOWED_ORIGINS = [
  'https://scs-app-54aef.web.app',
  'https://scs-app-54aef.firebaseapp.com',
  // TODO: add production custom domain(s), e.g. 'https://www.seeclub-staefa.ch'
];
const cors = corsLib({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
});

const app = express();
app.use((req, res, next) => cors(req, res, next));
app.use(express.json());

const BASE = '/public/api/v1';
app.get(`${BASE}/org`,           orgRouter);
app.get(`${BASE}/content`,       contentRouter);
app.get(`${BASE}/news`,          newsRouter);
app.get(`${BASE}/news/:slug`,    newsRouter);
app.get(`${BASE}/calendar`,      calendarRouter);
app.get(`${BASE}/courses`,       coursesRouter);
app.get(`${BASE}/results`,       resultsRouter);
app.get(`${BASE}/pages/:pageKey`, pageRouter);
app.post(`${BASE}/contact`,      contactRouter);

export const publicApi = onRequest({ region: 'europe-west6' }, app);
