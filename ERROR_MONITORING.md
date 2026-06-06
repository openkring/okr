# Error Monitoring

*Architecture decision record & operations reference*

| | |
|---|---|
| **Subject** | Technical error & crash monitoring for the KMU platform |
| **Decision** | Adopt **Sentry** (EU region) as the error/crash monitoring tool |
| **Stack** | Angular 21 (standalone) · Ionic · Capacitor PWA · Firebase |
| **Related** | `spec-sentry-integration.md` (implementation spec) |
| **Status** | Decided |

---

## 1. Purpose & Scope

This document records **why** Sentry was chosen for error and crash monitoring, and describes how it is hosted, how it handles data and privacy, how it is billed, and how it integrates with our stack. It is the reference for onboarding and for revisiting the decision later.

**In scope:** uncaught JavaScript errors, unhandled promise rejections, and native iOS/Android crashes — i.e. *technical faults*.

**Explicitly out of scope:** domain/business events (failed Swissdec submissions, GeBüV archiving outcomes, audit records). These remain in **Firestore**, surfaced in the **AOC**, because they are regulatory-relevant records, not faults. The two systems are complementary: Sentry tells us *the software broke*; the Firestore/AOC log tells us *what happened in the business process*.

---

## 2. Decision Summary — Why Sentry

### 2.1 What we needed to monitor

The platform is a **Capacitor PWA** today and ships to **native iOS/Android** later. Almost all application logic runs in the Angular **WebView**, but native builds also introduce a **native crash** surface (signals, ANRs, OOM/watchdog terminations) that lives outside the WebView. Any monitoring choice had to cover *both* layers and survive the move to mobile without being re-platformed.

### 2.2 Options evaluated

1. **Self-built Firestore error logging** with a view in the AOC.
2. **Firebase Crashlytics.**
3. **Sentry.**

### 2.3 Comparison

| Criterion | Firestore self-logging | Firebase Crashlytics | Sentry |
|---|---|---|---|
| WebView JS errors (Angular) | Only what we explicitly catch | Manual `recordException` only; second-class | First-class, automatic |
| Browser / PWA errors | Same limitation | Not generally available (web in private preview) | Full support |
| Native iOS/Android crashes | **Cannot capture** | Best-in-class, automatic | Captured via native SDKs |
| Minified → original TS stack traces | None | Weak for JS | Source-mapped to TypeScript |
| Issue grouping / dedup | None (duplicate docs) | Native-tuned | Strong, JS-aware |
| Breadcrumbs / release health / alerting | Build it all yourself | Partial (native-oriented) | Built-in |
| Cost | Firestore writes/reads (spikes on storms) | Free, unlimited | Event-based (free tier → paid) |
| Data residency / DSG | Own project (pick Zürich region) | Google infra; limited region control | EU (Frankfurt) region or self-host |
| Build / maintenance effort | High and ongoing | Low (native), high (web workaround) | Low |

### 2.4 Reasoning

**Why not self-built Firestore logging.** It can only ever record *handled* JS errors, because writing a document requires a living JS context, the Firestore SDK, and (eventually) network. A native crash kills the process before any of that runs, so the approach is structurally blind to exactly the failures we most need on mobile. It also lacks source-map resolution (Angular prod output is minified), has no grouping (one recurring bug becomes thousands of duplicate documents), and pushes all alerting, triage, and write-amplification cost onto us. It remains the right tool for **business events** — which is why we keep it for that — but not for technical fault monitoring.

**Why not Crashlytics alone.** Crashlytics is fundamentally a **native** crash reporter. Web support was only announced as *upcoming* (private preview built on Google Cloud Observability) and is not generally available, so the browser/PWA build would be unmonitored. In the native app it captures native crashes excellently but does **not** automatically see WebView JS errors — the layer where nearly all our code runs; forwarding caught JS errors manually yields weak, non-fatal, non-source-mapped events. It is free and unbeatable for native crash-free-user metrics, which keeps it on the table as a *future complement*, but it cannot be our primary tool.

**Why Sentry.** It is the only option that covers all three layers — **browser/PWA, WebView, and native** — with one integration, and the only one that resolves minified stack traces back to our **TypeScript**. It provides grouping, breadcrumbs, release health, and alerting out of the box, offers an **EU data region** for DSG, and has a cost model that starts free and scales predictably when controlled. Adopting it now means the move to native adds a native crash layer to the *same* dashboard rather than introducing a second tool.

### 2.5 Decision

**Sentry is the primary error/crash monitoring tool**, hosted in the **EU (Frankfurt) region**, integrated via a single `@sentry/capacitor` entrypoint. The Firestore/AOC log is retained for domain/business events. Crashlytics may be added later, at zero marginal cost, purely for native crash-free-user health metrics.

---

## 3. Hosting & Data Residency

Sentry is used as **managed SaaS** in its **EU data region**. Sentry's EU region is hosted in **Frankfurt, Germany**, and telemetry data (errors, transactions, profiles, replays) is stored within the region selected when the organization is created — EU-region data does not leave Frankfurt. The region is chosen at org/project creation and **cannot be changed afterward**, so the project must be created in the EU region from the start.

EU data residency is available on **every plan, including the free Developer tier**, and pricing is identical across the US and EU regions.

**Self-hosting** is available (Sentry is open source) and would give full data control, but it was **not adopted**: no client contract requires residency stricter than EU-managed, and self-hosting adds substantial operational overhead. A migration path from self-hosted to SaaS (and between regions) exists should the situation change.

**Relevance for Switzerland:** Sentry has self-certified under the **Swiss–U.S. Data Privacy Framework** (alongside the EU–U.S. framework and UK extension), and offers a **Data Processing Addendum (AVV/DPA)**. EU-region hosting keeps event data inside the EU, which avoids the international-transfer discussion for most DSG purposes.

---

## 4. Privacy & DSG

The platform processes accounting, payroll, and HR data, so crash payloads can inadvertently contain sensitive material (AHV numbers, IBANs, salaries, names). The integration is hardened accordingly:

- **No automatic PII:** `sendDefaultPii: false` — IP address, cookies, and request headers are not attached.
- **Pseudonymous identity only:** user context is a Firebase UID/hash plus `mandant` and `role` tags — never name or email.
- **Client-side scrubbing:** a `beforeSend` hook redacts Swiss-sensitive patterns (AHV number `756.xxxx.xxxx.xx`, IBAN, email) from messages, exception values, and breadcrumbs before anything is transmitted.
- **Server-side scrubbing:** Sentry's built-in data-scrubbing / sensitive-data filters are enabled as a second line of defence. (Sentry's *Advanced* Data Scrubbing is a Business-tier feature; the standard scrubbing plus our client-side `beforeSend` covers our needs on lower tiers.)
- **No Session Replay:** disabled by default to avoid capturing sensitive screen content; any future enablement requires aggressive masking and a fresh DSG review.
- **Retention:** the event retention period was reviewed against DSG and accepted; combined with redaction, residual risk within that window is acceptable.
- **Legal basis:** AVV/DPA signed; EU-region processing.

---

## 5. Billing

Sentry uses an **event-based (consumption) model**. Cost is driven by plan tier, monthly event volume (errors, and separately transactions/replays/attachments), and seat count.

| Plan | Price | Included errors/mo | Notes |
|---|---|---|---|
| **Developer** | Free | 5,000 | 1 user, 30-day retention, full error tracking & SDKs |
| **Team** | $26/mo | 50,000 | Unlimited users, longer retention |
| **Business** | $80/mo | 100,000 | 90-day retention, advanced data scrubbing, anomaly detection, SAML/SCIM |
| **Enterprise** | Custom | Negotiated | High volume, custom terms |

(Prices in USD; same in the EU region. Verify current figures at sign-up — pricing changes.)

**Overages** are pay-as-you-go beyond the included quota (roughly $0.00025 per error event), so a single widespread bug can generate meaningful charges. We mitigate this with:

- a **spending cap** and **rate limiting** on the project,
- `tracesSampleRate` held at ~0.1 (Sentry recommends 10–20% in production),
- **inbound filters** plus `beforeSend` drops (e.g. all `development` events) to keep noise out of quota.

**Current posture:** the free **Developer** tier is sufficient for initial rollout (single viewer, low volume). We move to **Team** when a second person needs dashboard access or volume grows. Session Replay and other metered add-ons are intentionally off to keep billing predictable.

---

## 6. Integration Overview

Implementation detail lives in `spec-sentry-integration.md`; the shape is:

- **One SDK set, one entrypoint.** Because the web app is a Capacitor PWA, `@sentry/capacitor` (with the `@sentry/angular` sibling) is initialized once in `main.ts`. On the web it runs the JS/Angular path; on device it additionally activates the native crash layer (`@sentry/cocoa`, `@sentry/android`). Sibling SDK versions are pinned exact.
- **Angular wiring.** `Sentry.createErrorHandler()` replaces the global `ErrorHandler`; `TraceService` + an app initializer add router context. HTTP failures are recorded as breadcrumbs (not separate issues).
- **Context.** Pseudonymous user id plus `mandant`, `role`, and active-module tags for triage and per-tenant filtering.
- **Releases & source maps.** The release name is derived from `package.json` `version`. CI injects debug IDs and uploads source maps (web) so stack traces resolve to TypeScript; native builds upload ProGuard/R8 mappings (Android) and dSYMs (iOS). `release` + `dist` match across web and native.
- **Environments.** One Sentry project, separated by `environment` tags (dev/staging/prod). Local dev is disabled / non-reporting.

### Roll-out phases
1. Capacitor PWA, errors only (free tier).
2. CI source maps + releases + alerting.
3. Native symbolication (iOS/Android).
4. *(Optional)* Cloud Functions backend via `@sentry/node`, stitched to frontend traces.

---

## 7. Operations

- **Alerting:** issue and spike alerts routed to email/Slack; tune thresholds after Phase 2.
- **Triage:** issues grouped automatically; assignment and resolution tracked in Sentry; release health shows crash-free sessions/users after native ships.
- **Access:** dashboard viewers limited by plan seat count; production data access follows least-privilege.
- **Cost watch:** review event volume and overage monthly; keep spending cap active.

---

## 8. Future Considerations

- **Crashlytics as a free native complement** for crash-free-user metrics and deep Firebase/BigQuery tie-in, if those dashboards prove valuable — runs alongside Sentry at no marginal cost.
- **Cloud Functions monitoring** (`@sentry/node`) for end-to-end client→backend traces (Phase 4).
- **Crashlytics web GA:** worth tracking, since it is built on Google Cloud Observability and could narrow the gap if we go deeper into Google Cloud — but it is private preview today, not something to architect around.
