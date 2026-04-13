// module-05/playwright/solve-playground.js
// Navigate RHOAI Gen AI Studio → AI asset endpoints → MCP servers
// → select both → Try in Playground → authorize → send chat messages
//
// Environment variables (from showroom userdata via Ansible extravars):
//   RHOAI_URL    — https://data-science-gateway.apps.xxx.com
//   USERNAME     — student username (e.g. llmuser-lfkzj)
//   PASSWORD     — student password
//   USER_NS      — student namespace (e.g. llmuser-lfkzj)

const { chromium } = require('playwright');

const RHOAI_URL = process.env.RHOAI_URL;
const USERNAME  = process.env.USERNAME;
const PASSWORD  = process.env.PASSWORD;
const USER_NS   = process.env.USER_NS;

if (!RHOAI_URL || !USERNAME || !PASSWORD || !USER_NS) {
  console.error('FAILED: Missing required env vars (RHOAI_URL, USERNAME, PASSWORD, USER_NS)');
  process.exit(1);
}

// Workspace project name shown in RHOAI — "Workspace llmuser-lfkzj"
const WORKSPACE_PROJECT = `Workspace ${USER_NS}`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  try {
    // ── 1. Navigate to RHOAI ─────────────────────────────────────────────────
    console.log('Navigating to RHOAI:', RHOAI_URL);
    await page.goto(RHOAI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // ── 2. Login via OCP OAuth (Keycloak SSO) ────────────────────────────────
    if (page.url().includes('oauth') || page.url().includes('login') || page.url().includes('sso')) {
      console.log('Login page detected, authenticating...');

      // Fill username and password — use ID-based selectors which are stable
      const usernameField = page.locator('#username, #inputUsername, [name="username"]').first();
      await usernameField.waitFor({ state: 'visible', timeout: 15000 });
      await usernameField.fill(USERNAME);
      await page.locator('#password, #inputPassword, [name="password"]').first().fill(PASSWORD);
      await page.locator('input[type="submit"], button[type="submit"]').first().click();
      await page.waitForURL(/data-science-gateway/, { timeout: 30000 });
      console.log('Logged in successfully');
    }

    await page.waitForTimeout(2000);

    // ── 3. Open "Gen AI studio" section in left nav ───────────────────────────
    console.log('Clicking Gen AI studio...');
    await page.getByRole('button', { name: /Gen AI studio/i })
      .or(page.getByText('Gen AI studio').first())
      .first()
      .click();
    await page.waitForTimeout(1000);

    // ── 4. Click "AI asset endpoints" sub-menu item ───────────────────────────
    console.log('Clicking AI asset endpoints...');
    await page.getByRole('link', { name: /AI asset endpoints/i })
      .or(page.getByText('AI asset endpoints').first())
      .first()
      .click();
    await page.waitForTimeout(2000);

    // ── 5. Change project to student workspace ────────────────────────────────
    // The project dropdown is next to the "AI asset endpoints" title — starts with "grafana"
    console.log('Changing project for user:', USER_NS);
    // Click the project toggle button (initially shows "grafana")
    const projectBtn = page.locator('button').filter({ hasText: /^grafana$|^Workspace/i }).first();
    if (await projectBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      console.log('Found project dropdown, clicking...');
      await projectBtn.click();
      await page.waitForTimeout(800);

      // Search box appears — type user ID to filter
      const searchBox = page.getByPlaceholder(/Project name/i)
        .or(page.locator('input[placeholder*="roject"]').first());
      if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await searchBox.fill(USER_NS);
        await page.waitForTimeout(600);
      }

      // Click first visible option
      const firstOption = page.locator('li[role="option"] button, [role="option"]').first();
      if (await firstOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        const optText = await firstOption.textContent().catch(() => '');
        console.log('Selecting project option:', optText.trim().substring(0, 40));
        await firstOption.click();
        await page.waitForTimeout(2000);
      }
    } else {
      console.log('WARNING: Project dropdown not found — continuing with current project');
    }

    // ── 6. Click "MCP servers" tab ────────────────────────────────────────────
    console.log('Clicking MCP servers tab...');
    const mcpTab = page.getByRole('tab', { name: 'MCP servers' })
      .or(page.locator('button[role="tab"]:has-text("MCP servers")'));
    await mcpTab.waitFor({ state: 'visible', timeout: 10000 });
    await mcpTab.click();
    await page.waitForTimeout(2000);
    console.log('MCP servers tab active');

    // ── 7. Select both MCP server checkboxes ─────────────────────────────────
    console.log('Selecting all MCP servers...');
    // Click the header "select all" checkbox first
    const headerCheckbox = page.locator('thead input[type="checkbox"], th input[type="checkbox"]').first();
    if (await headerCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (!await headerCheckbox.isChecked()) {
        await headerCheckbox.click();
        await page.waitForTimeout(500);
      }
    } else {
      // Check individual checkboxes
      const checkboxes = await page.locator('tbody input[type="checkbox"]').all();
      for (const cb of checkboxes) {
        if (!await cb.isChecked()) {
          await cb.click();
          await page.waitForTimeout(300);
        }
      }
    }
    await page.waitForTimeout(500);

    // ── 8. Click "Try in Playground" button ───────────────────────────────────
    console.log('Clicking Try in Playground...');
    // Screenshot to debug what state the page is in
    await page.screenshot({ path: '/tmp/playwright-before-playground-btn.png' });
    console.log('Page URL:', page.url());

    // The button shows "Try in Playground (N)" after selecting checkboxes
    const tryBtn = page.getByRole('button', { name: /Try in Playground/i })
      .or(page.locator('button:has-text("Playground")'))
      .or(page.locator('[data-testid*="playground"], [aria-label*="Playground"]').first());

    if (await tryBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tryBtn.first().click();
    } else {
      // Try scanning all buttons on the page for playground-related text
      const allButtons = await page.getByRole('button').all();
      let clicked = false;
      for (const btn of allButtons) {
        const txt = await btn.textContent().catch(() => '');
        if (txt && /playground/i.test(txt)) {
          console.log('Found playground button:', txt.trim());
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        await page.screenshot({ path: '/tmp/playwright-no-playground-btn.png' });
        throw new Error('Try in Playground button not found — check screenshot');
      }
    }
    await page.waitForTimeout(4000);

    // ── 9. Authorize both MCP servers (click lock icons) ─────────────────────
    console.log('Authorizing MCP servers...');
    // Lock buttons are in the right panel under "MCP servers" section
    const lockBtns = page.locator('[aria-label*="uthoriz"], [title*="uthoriz"], button:has([data-icon="lock"])');
    const lockCount = await lockBtns.count();
    console.log('Found', lockCount, 'lock buttons');
    for (let i = 0; i < lockCount; i++) {
      await lockBtns.nth(i).click();
      await page.waitForTimeout(500);
      // Close any popup
      const closeBtn = page.getByRole('button', { name: /close/i });
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    }
    await page.waitForTimeout(1000);

    // ── 10. Send chat messages ─────────────────────────────────────────────────
    const chatInput = page.locator('[placeholder*="message"], [placeholder*="Message"], textarea').first();
    await chatInput.waitFor({ state: 'visible', timeout: 10000 });

    const messages = [
      `List all pods in the wksp-${USER_NS} namespace.`,
      `Post a message to the #rh1-2026 channel: "Hi from ${USERNAME}"`,
    ];

    for (const msg of messages) {
      console.log('Sending chat:', msg.substring(0, 50) + '...');
      await chatInput.fill(msg);
      await page.waitForTimeout(300);
      await chatInput.press('Enter');
      // Wait for model response (may take time)
      await page.waitForTimeout(20000);
    }

    console.log('SUCCESS: All playground chat interactions completed');
    process.exit(0);
  } catch (err) {
    await page.screenshot({ path: '/tmp/playwright-debug-module05.png' }).catch(() => {});
    console.error('FAILED:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
