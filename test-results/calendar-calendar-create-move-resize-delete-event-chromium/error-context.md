# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calendar.spec.ts >> calendar: create, move, resize, delete event
- Location: e2e/calendar.spec.ts:24:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('bk-calevent-edit-modal')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('bk-calevent-edit-modal')

```

# Test source

```ts
  1   | import { test, expect, chromium, type Page } from '@playwright/test';
  2   | 
  3   | const BASE_URL   = 'http://localhost:4201';
  4   | const EVENT_NAME = 'E2E Testevent';
  5   | 
  6   | // ── Helpers ─────────────────────────────────────────────────────────────────
  7   | 
  8   | async function connectToChrome(): Promise<{ browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>, page: Page }> {
  9   |   const browser = await chromium.connectOverCDP('http://localhost:9222', { slowMo: 500 });
  10  |   const context = browser.contexts()[0];
  11  |   const page    = context.pages()[0] ?? await context.newPage();
  12  |   await page.bringToFront(); // ensure the controlled tab is visible
  13  |   return { browser, page };
  14  | }
  15  | 
  16  | // Returns the pixel height of one 30-min FullCalendar slot
  17  | async function slotHeight(page: Page): Promise<number> {
  18  |   const box = await page.locator('.fc-timegrid-slot-lane').first().boundingBox();
  19  |   return box?.height ?? 24;
  20  | }
  21  | 
  22  | // ── Test ─────────────────────────────────────────────────────────────────────
  23  | 
  24  | test('calendar: create, move, resize, delete event', async () => {
  25  |   const { browser, page } = await connectToChrome();
  26  |   try {
  27  | 
  28  |     // ── 1. Dashboard ──────────────────────────────────────────────────────────
  29  |     await page.goto(`${BASE_URL}/private/dashboard/c-contentpage`);
  30  |     await expect(page).toHaveURL(/\/private\/dashboard/, { timeout: 10000 });
  31  | 
  32  |     // ── 2. Click 'Mehr…' on 'Nächste Anlässe' ────────────────────────────────
  33  |     await Promise.all([
  34  |       page.waitForURL(/\/calevent\/my\/c-calevents/, { timeout: 10000 }),
  35  |       page.locator('.events-more ion-button').click(),
  36  |     ]);
  37  | 
  38  |     // ── 3. Navigate 2 weeks forward and create an event ───────────────────────
  39  |     await page.locator('.fc-next-button').click();
  40  |     await page.locator('.fc-next-button').click();
  41  |     await page.waitForTimeout(500); // let FullCalendar re-render
  42  | 
  43  |     // Capture the week title — all subsequent operations must leave it unchanged
  44  |     const weekTitle = page.locator('.fc-toolbar-title');
  45  |     const targetWeek = await weekTitle.textContent();
  46  | 
  47  |     // Target column: today + 14 days
  48  |     const targetDate    = new Date();
  49  |     targetDate.setDate(targetDate.getDate() + 14);
  50  |     const targetDateStr = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD
  51  | 
  52  |     const dayCol  = page.locator(`.fc-timegrid-col[data-date="${targetDateStr}"]`);
  53  |     await dayCol.waitFor({ timeout: 5000 });
  54  | 
  55  |     // Scroll the 10:00 slot into view so its viewport Y is reliable
  56  |     const slot10 = page.locator('.fc-timegrid-slot[data-time="10:00:00"]').first();
  57  |     await slot10.scrollIntoViewIfNeeded();
  58  |     await page.waitForTimeout(200);
  59  | 
  60  |     // Compute click position relative to the day column using evaluate,
  61  |     // so both rects are read in the same JS frame (consistent scroll state)
  62  |     const clickPos = await page.evaluate((dateStr) => {
  63  |       const col  = document.querySelector(`.fc-timegrid-col[data-date="${dateStr}"] .fc-timegrid-col-frame`);
  64  |       const slot = document.querySelector('.fc-timegrid-slot[data-time="10:00:00"]');
  65  |       if (!col || !slot) return null;
  66  |       const colRect  = col.getBoundingClientRect();
  67  |       const slotRect = slot.getBoundingClientRect();
  68  |       return { x: colRect.x + colRect.width / 2, y: slotRect.y + slotRect.height / 2 };
  69  |     }, targetDateStr);
  70  |     if (!clickPos) throw new Error('Cannot locate target time slot');
  71  | 
  72  |     // Single click on the empty slot → store.add() → edit modal opens
  73  |     await page.mouse.click(clickPos.x, clickPos.y);
> 74  |     await expect(page.locator('bk-calevent-edit-modal')).toBeVisible({ timeout: 5000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  75  | 
  76  |     // Fill event name (Ionic shadow-DOM input requires ionInput dispatch)
  77  |     const nameInput = page.locator('bk-calevent-edit-modal ion-input[name="name"]');
  78  |     await nameInput.click();
  79  |     await nameInput.locator('input').fill(EVENT_NAME);
  80  |     await nameInput.evaluate((el, v) =>
  81  |       el.dispatchEvent(new CustomEvent('ionInput', { detail: { value: v }, bubbles: true, composed: true })),
  82  |     EVENT_NAME);
  83  | 
  84  |     // Save
  85  |     const saveBtn = page.locator('bk-change-confirmation ion-button').filter({ hasText: /ok/i });
  86  |     await expect(saveBtn).toBeVisible({ timeout: 5000 });
  87  |     await saveBtn.click();
  88  |     await expect(page.locator('bk-calevent-edit-modal')).not.toBeVisible({ timeout: 5000 });
  89  | 
  90  |     // Browser stays on the same week ✓
  91  |     await expect(weekTitle).toHaveText(targetWeek!, { timeout: 3000 });
  92  | 
  93  |     // ── 4. Drag event 2 hours later ───────────────────────────────────────────
  94  |     const h = await slotHeight(page);
  95  |     const event = page.locator('.fc-event').filter({ hasText: EVENT_NAME });
  96  |     await event.waitFor({ timeout: 5000 });
  97  |     const eb = await event.boundingBox();
  98  |     if (!eb) throw new Error('Event not found after creation');
  99  | 
  100 |     await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
  101 |     await page.mouse.down();
  102 |     await page.mouse.move(
  103 |       eb.x + eb.width / 2,
  104 |       eb.y + eb.height / 2 + h * 4, // 4 × 30 min = 2 h
  105 |       { steps: 20 },
  106 |     );
  107 |     await page.mouse.up();
  108 |     await page.waitForTimeout(600); // let Firestore save + navigateCalendarTo settle
  109 | 
  110 |     // Browser stays on the same week ✓
  111 |     await expect(weekTitle).toHaveText(targetWeek!, { timeout: 3000 });
  112 | 
  113 |     // ── 5. Resize event +30 min ───────────────────────────────────────────────
  114 |     const movedEvent = page.locator('.fc-event').filter({ hasText: EVENT_NAME });
  115 |     await movedEvent.waitFor({ timeout: 5000 });
  116 |     const resizer    = movedEvent.locator('.fc-event-resizer-end');
  117 |     const rb         = await resizer.boundingBox();
  118 |     if (!rb) throw new Error('Resize handle not found');
  119 | 
  120 |     await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  121 |     await page.mouse.down();
  122 |     await page.mouse.move(
  123 |       rb.x + rb.width / 2,
  124 |       rb.y + rb.height / 2 + h, // 1 × 30 min
  125 |       { steps: 10 },
  126 |     );
  127 |     await page.mouse.up();
  128 |     await page.waitForTimeout(600);
  129 | 
  130 |     // Browser stays on the same week ✓
  131 |     await expect(weekTitle).toHaveText(targetWeek!, { timeout: 3000 });
  132 | 
  133 |     // ── 6. Delete event ───────────────────────────────────────────────────────
  134 |     const finalEvent = page.locator('.fc-event').filter({ hasText: EVENT_NAME });
  135 |     await finalEvent.waitFor({ timeout: 5000 });
  136 |     await finalEvent.click();
  137 | 
  138 |     // ActionSheet: "Ereignis löschen"
  139 |     const deleteBtn = page.locator('.action-sheet-button').filter({ hasText: /Ereignis löschen/i });
  140 |     await deleteBtn.waitFor({ timeout: 5000 });
  141 |     await deleteBtn.click();
  142 | 
  143 |     await expect(finalEvent).not.toBeVisible({ timeout: 5000 });
  144 | 
  145 |     // Browser stays on the same week ✓
  146 |     await expect(weekTitle).toHaveText(targetWeek!, { timeout: 3000 });
  147 | 
  148 |   } finally {
  149 |     await browser.close(); // disconnect CDP without closing Chrome
  150 |   }
  151 | });
  152 | 
```