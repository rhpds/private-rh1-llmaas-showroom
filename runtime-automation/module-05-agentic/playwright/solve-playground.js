// module-05/playwright/solve-playground.js
// Navigate RHOAI Gen AI Studio → select MCP servers → Try in Playground
// → authorize MCP servers → send chat messages
//
// Environment variables (from Ansible extravars / showroom userdata):
//   RHOAI_URL      — https://data-science-gateway.apps.xxx.com
//   USERNAME       — student Keycloak username (e.g. llmuser-lfkzj)
//   PASSWORD       — student password
//   USER_NS        — student namespace (e.g. llmuser-lfkzj)

const { chromium } = require('playwright');

const RHOAI_URL  = process.env.RHOAI_URL;
const USERNAME   = process.env.USERNAME;
const PASSWORD   = process.env.PASSWORD;
const USER_NS    = process.env.USER_NS;

if (!RHOAI_URL || !USERNAME || !PASSWORD || !USER_NS) {
  console.error('FAILED: Missing required environment variables (RHOAI_URL, USERNAME, PASSWORD, USER_NS)');
  process.exit(1);
}

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
    console.log('Navigating to RHOAI:', RHOAI_URL);
    await page.goto(RHOAI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Handle OCP OAuth → Keycloak RHBK login
    if (page.url().includes('oauth') || page.url().includes('login')) {
      console.log('Handling OCP OAuth login...');

      // Check for Keycloak RHBK identity provider
      const rhbkLink = page.getByRole('link', { name: /Sandbox user.*RHBK/i });
      if (await rhbkLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await rhbkLink.click();
        await page.waitForLoadState('domcontentloaded');
      }

      await page.getByLabel('Username').fill(USERNAME);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForURL(/data-science-gateway/, { timeout: 30000 });
      console.log('Logged in successfully');
    }

    // Navigate to AI asset endpoints
    console.log('Navigating to AI asset endpoints...');
    await page.waitForTimeout(2000);

    // Click "AI asset endpoints" in the nav
    const aiAssetsLink = page.getByRole('link', { name: /AI asset endpoints/i });
    if (await aiAssetsLink.isVisible({ timeout: 10000 }).catch(() => false)) {
      await aiAssetsLink.click();
    } else {
      // Try via Gen AI Studio nav item
      const genAiStudio = page.getByRole('link', { name: /Gen AI Studio/i });
      if (await genAiStudio.isVisible({ timeout: 5000 }).catch(() => false)) {
        await genAiStudio.click();
        await page.waitForTimeout(1000);
        await page.getByRole('link', { name: /AI asset endpoints/i }).click({ timeout: 10000 });
      }
    }
    await page.waitForTimeout(2000);

    // Change project to student workspace namespace
    console.log('Changing project to Workspace', USER_NS);
    const projectSelector = page.locator('[data-testid="project-selector"], select[aria-label*="project"], [aria-label*="Project"]').first();
    if (await projectSelector.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectSelector.click();
      await page.waitForTimeout(500);
      // Select the workspace namespace
      const nsOption = page.getByRole('option', { name: new RegExp(USER_NS, 'i') });
      if (await nsOption.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nsOption.click();
        await page.waitForTimeout(1000);
      }
    }

    // Navigate to MCP servers tab
    console.log('Navigating to MCP servers...');
    const mcpTab = page.getByRole('tab', { name: /MCP servers/i })
      .or(page.getByRole('link', { name: /MCP servers/i }))
      .or(page.getByText('MCP servers').first());
    if (await mcpTab.isVisible({ timeout: 10000 }).catch(() => false)) {
      await mcpTab.click();
      await page.waitForTimeout(1500);
    }

    // Select both MCP servers via checkboxes
    console.log('Selecting MCP servers...');
    const checkboxes = await page.getByRole('checkbox').all();
    for (const cb of checkboxes) {
      if (!await cb.isChecked()) {
        await cb.click();
        await page.waitForTimeout(300);
      }
    }

    // Click "Try in Playground"
    console.log('Clicking Try in Playground...');
    const playgroundBtn = page.getByRole('button', { name: /Try in Playground/i });
    await playgroundBtn.waitFor({ state: 'visible', timeout: 10000 });
    await playgroundBtn.click();
    await page.waitForTimeout(3000);

    // Authorize MCP servers — click lock icons
    console.log('Authorizing MCP servers...');
    const lockButtons = await page.getByRole('button', { name: /authoriz|lock/i }).all();
    for (const btn of lockButtons) {
      await btn.click();
      await page.waitForTimeout(500);
      // Close the popup if it appears
      const closeBtn = page.getByRole('button', { name: /close/i });
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // Send chat messages
    const chatInput = page.getByRole('textbox', { name: /message|chat|send/i })
      .or(page.locator('textarea[placeholder*="message"]'))
      .or(page.locator('textarea').first());

    const messages = [
      `List all pods in the wksp-${USER_NS} namespace.`,
      `Post a message to the #rh1-2026 channel: "Hi from ${USERNAME}"`,
    ];

    for (const msg of messages) {
      console.log('Sending:', msg);
      await chatInput.waitFor({ state: 'visible', timeout: 10000 });
      await chatInput.fill(msg);
      await page.waitForTimeout(500);
      // Press Enter or click send
      await chatInput.press('Enter');
      // Wait for response (model thinking time)
      await page.waitForTimeout(15000);
    }

    console.log('SUCCESS: Playground chat interactions completed');
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
