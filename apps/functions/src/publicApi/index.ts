import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import corsLib from 'cors';

// Mounted so the /contact route can send via mailtrap_api (reads process.env['MAILTRAP_APIKEY']).
const mailtrapApiKey = defineSecret('MAILTRAP_APIKEY');

import { orgRouter } from './routes/org';
import { contentRouter } from './routes/content';
import { newsRouter } from './routes/news';
import { calendarRouter } from './routes/calendar';
import { contactRouter } from './routes/contact';
import { coursesRouter, resultsRouter } from './routes/stubs';
import { pageRouter } from './routes/page';

// ---------------------------------------------------------------------------
// CORS allowlist. The public website calls this API from the browser, so we
// only reflect known site origins instead of any origin (L-4). The bundled
// /web site is same-origin (scs-app host); server-side callers send no Origin.
// Production custom domains are added via the PUBLIC_API_ALLOWED_ORIGINS env var
// (comma-separated) so they can be changed at deploy time without a code edit.
// ---------------------------------------------------------------------------
const DEFAULT_ALLOWED_ORIGINS = [
  'https://scs-app-54aef.web.app',
  'https://scs-app-54aef.firebaseapp.com',
];
const EXTRA_ALLOWED_ORIGINS = (process.env['PUBLIC_API_ALLOWED_ORIGINS'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [...DEFAULT_ALLOWED_ORIGINS, ...EXTRA_ALLOWED_ORIGINS];

const cors = corsLib({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  methods: ['GET', 'POST'],
  maxAge: 3600,
});

// ---------------------------------------------------------------------------
// Optional tenant allowlist. The API serves public content for a tenant given
// via ?tenantId=. When PUBLIC_API_ALLOWED_TENANTS (comma-separated) is set, any
// other tenantId is rejected — this prevents the API from being used to probe
// arbitrary tenants' public content / org contact info. Default (unset) keeps
// the previous behaviour so a newly onboarded tenant is never broken on deploy.
// Recommended: set it to the live tenants, e.g. "scs,kring,okr,p13".
// ---------------------------------------------------------------------------
const ALLOWED_TENANTS = (process.env['PUBLIC_API_ALLOWED_TENANTS'] ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => cors(req, res, next));
app.use(express.json({ limit: '64kb' }));

// Enforce the tenant allowlist (when configured) for any route that takes one.
app.use((req, res, next) => {
  if (ALLOWED_TENANTS.length === 0) return next();
  const tenantId = (req.query['tenantId'] as string | undefined)?.trim();
  if (tenantId && !ALLOWED_TENANTS.includes(tenantId)) {
    res.status(400).json({ error: { code: 'validation_error', message: 'Unknown tenantId' } });
    return;
  }
  next();
});

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

// JSON 404 for anything else (avoids leaking the default Express HTML page).
app.use((req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
});

// Last-resort error handler — never leak stack traces to the client.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('publicApi unhandled error', err);
  if (!res.headersSent) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal error' } });
  }
});

export const publicApi = onRequest({ region: 'europe-west6', secrets: [mailtrapApiKey] }, app);
