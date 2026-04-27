import { test, expect, chromium, type Page } from '@playwright/test';

const BASE_URL   = 'http://localhost:4201';
const EVENT_NAME = 'E2E Testevent';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function connectToChrome(): Promise<{ browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>, page: Page }> {
  const browser = await chromium.connectOverCDP('http://localhost:9222', { slowMo: 500 });
  const context = browser.contexts()[0];
  const page    = context.pages()[0] ?? await context.newPage();
  await page.bringToFront(); // ensure the controlled tab is visible
  return { browser, page };
}

// Returns the pixel height of one 30-min FullCalendar slot
async function slotHeight(page: Page): Promise<number> {
  const box = await page.locator('.fc-timegrid-slot-lane').first().boundingBox();
  return box?.height ?? 24;
}

// ── Test ─────────────────────────────────────────────────────────────────────

test('calendar: create, move, resize, delete event', async () => {
  const { browser, page } = await connectToChrome();
  try {

    // ── 1. Dashboard ──────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/private/dashboard/c-contentpage`);
    await expect(page).toHaveURL(/\/private\/dashboard/, { timeout: 10000 });

    // ── 2. Click 'Mehr…' on 'Nächste Anlässe' ────────────────────────────────
    await Promise.all([
      page.waitForURL(/\/calevent\/my\/c-calevents/, { timeout: 10000 }),
      page.locator('.events-more ion-button').click(),
    ]);

    // ── 3. Navigate 2 weeks forward and create an event ───────────────────────
    await page.locator('.fc-next-button').click();
    await page.locator('.fc-next-button').click();
    await page.waitForTimeout(500); // let FullCalendar re-render

    // Capture the week title — all subsequent operations must leave it unchanged
    const weekTitle = page.locator('.fc-toolbar-title');
    const targetWeek = await weekTitle.textContent();

    // Target column: today + 14 days
    const targetDate    = new Date();
    targetDate.setDate(targetDate.getDate() + 14);
    const targetDateStr = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD

    const dayCol  = page.locator(`.fc-timegrid-col[data-date="${targetDateStr}"]`);
    await dayCol.waitFor({ timeout: 5000 });

    // Scroll the 10:00 slot into view so its viewport Y is reliable
    const slot10 = page.locator('.fc-timegrid-slot[data-time="10:00:00"]').first();
    await slot10.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // Compute click position relative to the day column using evaluate,
    // so both rects are read in the same JS frame (consistent scroll state)
    const clickPos = await page.evaluate((dateStr) => {
      const col  = document.querySelector(`.fc-timegrid-col[data-date="${dateStr}"] .fc-timegrid-col-frame`);
      const slot = document.querySelector('.fc-timegrid-slot[data-time="10:00:00"]');
      if (!col || !slot) return null;
      const colRect  = col.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      return { x: colRect.x + colRect.width / 2, y: slotRect.y + slotRect.height / 2 };
    }, targetDateStr);
    if (!clickPos) throw new Error('Cannot locate target time slot');

    // Single click on the empty slot → store.add() → edit modal opens
    await page.mouse.click(clickPos.x, clickPos.y);
    await expect(page.locator('bk-calevent-edit-modal')).toBeVisible({ timeout: 5000 });

    // Fill event name (Ionic shadow-DOM input requires ionInput dispatch)
    const nameInput = page.locator('bk-calevent-edit-modal ion-input[name="name"]');
    await nameInput.click();
    await nameInput.locator('input').fill(EVENT_NAME);
    await nameInput.evaluate((el, v) =>
      el.dispatchEvent(new CustomEvent('ionInput', { detail: { value: v }, bubbles: true, composed: true })),
    EVENT_NAME);

    // Save
    const saveBtn = page.locator('bk-change-confirmation ion-button').filter({ hasText: /ok/i });
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await expect(page.locator('bk-calevent-edit-modal')).not.toBeVisible({ timeout: 5000 });

    // Browser stays on the same week ✓
    await expect(weekTitle).toHaveText(targetWeek!, { timeout: 3000 });

    // ── 4. Drag event 2 hours later ───────────────────────────────────────────
    const h = await slotHeight(page);
    const event = page.locator('.fc-event').filter({ hasText: EVENT_NAME });
    await event.waitFor({ timeout: 5000 });
    const eb = await event.boundingBox();
    if (!eb) throw new Error('Event not found after creation');

    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      eb.x + eb.width / 2,
      eb.y + eb.height / 2 + h * 4, // 4 × 30 min = 2 h
      { steps: 20 },
    );
    await page.mouse.up();
    await page.waitForTimeout(600); // let Firestore save + navigateCalendarTo settle

    // Browser stays on the same week ✓
    await expect(weekTitle).toHaveText(targetWeek!, { timeout: 3000 });

    // ── 5. Resize event +30 min ───────────────────────────────────────────────
    const movedEvent = page.locator('.fc-event').filter({ hasText: EVENT_NAME });
    await movedEvent.waitFor({ timeout: 5000 });
    const resizer    = movedEvent.locator('.fc-event-resizer-end');
    const rb         = await resizer.boundingBox();
    if (!rb) throw new Error('Resize handle not found');

    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      rb.x + rb.width / 2,
      rb.y + rb.height / 2 + h, // 1 × 30 min
      { steps: 10 },
    );
    await page.mouse.up();
    await page.waitForTimeout(600);

    // Browser stays on the same week ✓
    await expect(weekTitle).toHaveText(targetWeek!, { timeout: 3000 });

    // ── 6. Delete event ───────────────────────────────────────────────────────
    const finalEvent = page.locator('.fc-event').filter({ hasText: EVENT_NAME });
    await finalEvent.waitFor({ timeout: 5000 });
    await finalEvent.click();

    // ActionSheet: "Ereignis löschen"
    const deleteBtn = page.locator('.action-sheet-button').filter({ hasText: /Ereignis löschen/i });
    await deleteBtn.waitFor({ timeout: 5000 });
    await deleteBtn.click();

    await expect(finalEvent).not.toBeVisible({ timeout: 5000 });

    // Browser stays on the same week ✓
    await expect(weekTitle).toHaveText(targetWeek!, { timeout: 3000 });

  } finally {
    await browser.close(); // disconnect CDP without closing Chrome
  }
});
