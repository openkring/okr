import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import corsLib from 'cors';

import { orgRouter } from './routes/org';
import { contentRouter } from './routes/content';
import { newsRouter } from './routes/news';
import { calendarRouter } from './routes/calendar';
import { contactRouter } from './routes/contact';
import { coursesRouter, resultsRouter } from './routes/stubs';

const cors = corsLib({ origin: true });

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
app.post(`${BASE}/contact`,      contactRouter);

export const publicApi = onRequest({ region: 'europe-west6' }, app);
