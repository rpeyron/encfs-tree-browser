import { test } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = join(__dirname, '..', 'docs', 'screenshots');
const fixturesDir = resolve(__dirname, '..', '..', 'encfs-names-ts', 'test', 'fixtures', 'encfs-tests', 'direct-nochain');

test.describe('EncFS Tree Browser Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Standard viewport: 1280x720
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to app
    await page.goto('http://localhost:5173');

    // Wait for app to load
    await page.waitForSelector('.app-container');
  });

  test('1. Browse view', async ({ page }) => {
    // Select first builtin sample config
    await page.selectOption('select.config-select', { index: 1 });

    // Wait for config to load
    await page.waitForTimeout(500);

    // Enter a dummy password
    await page.fill('.config-password', 'test123');

    // Wait for tabs to appear
    await page.waitForTimeout(500);

    // Check if Browse tab exists and click it
    const browseTab = page.locator('button:has-text("🌳 Browse")');
    if (await browseTab.isVisible()) {
      await browseTab.click();
      await page.waitForTimeout(500);
    }

    // Screenshot
    await page.screenshot({
      path: join(screenshotsDir, 'browse-view.png'),
      fullPage: false
    });
  });

  test('2. Convert tab with results', async ({ page }) => {
    // Select nochain sample config
    const options = await page.locator('select.config-select option').allTextContents();
    const nochainIndex = options.findIndex(opt => opt.toLowerCase().includes('nochain'));
    if (nochainIndex >= 0) {
      await page.selectOption('select.config-select', { index: nochainIndex });
    } else {
      await page.selectOption('select.config-select', { index: 1 });
    }
    await page.waitForTimeout(500);

    // Ensure we're on Convert tab (default)
    const convertTab = page.locator('button:has-text("⚡ Convert")');
    if (await convertTab.isVisible()) {
      await convertTab.click();
      await page.waitForTimeout(300);
    }

    // Load sample encoded file list
    const sampleButton = page.locator('button:has-text("📄 Sample Encoded")');
    if (await sampleButton.isVisible()) {
      await sampleButton.click();
      await page.waitForTimeout(300);
    }

    // Click Decode button
    await page.click('button:has-text("🔓 Decode")');
    await page.waitForTimeout(800);

    // Switch to Tree view
    const treeViewBtn = page.locator('button:has-text("🌳 Tree")');
    if (await treeViewBtn.isVisible()) {
      await treeViewBtn.click();
      await page.waitForTimeout(500);
    }

    // Expand all nodes
    const toggles = page.locator('.tree-node-toggle');
    const count = await toggles.count();
    for (let i = 0; i < count; i++) {
      await toggles.nth(i).click().catch(() => {});
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);

    // Screenshot
    await page.screenshot({
      path: join(screenshotsDir, 'convert-view.png'),
      fullPage: false
    });
  });

  test('3. Configuration modal', async ({ page }) => {
    // Open Add config modal
    await page.click('select.config-select');
    await page.selectOption('select.config-select', '__add__');

    // Wait for modal
    await page.waitForSelector('.modal-backdrop');
    await page.waitForTimeout(300);

    // Screenshot
    await page.screenshot({
      path: join(screenshotsDir, 'config-modal.png'),
      fullPage: false
    });
  });

  test('4. Browse view with agent', async ({ page }) => {
    // Navigate to agent URL
    await page.goto('http://localhost:8765');
    await page.waitForSelector('.app-container').catch(() => {});
    await page.waitForTimeout(500);

    // Select nochain config
    const options = await page.locator('select.config-select option').allTextContents();
    const nochainIndex = options.findIndex(opt => opt.toLowerCase().includes('nochain'));
    if (nochainIndex >= 0) {
      await page.selectOption('select.config-select', { index: nochainIndex });
    } else {
      await page.selectOption('select.config-select', { index: 1 });
    }
    await page.waitForTimeout(500);

    // Enter password
    await page.fill('.config-password', 'test');
    await page.waitForTimeout(500);

    // Click Browse tab
    const browseTab = page.locator('button:has-text("🌳 Browse")');
    if (await browseTab.isVisible()) {
      await browseTab.click();
      await page.waitForTimeout(500);
    }

    // Click Browse disk button (agent mode)
    const browseDiskBtn = page.locator('.agent-explorer-wrap button.step-btn');
    if (await browseDiskBtn.isVisible()) {
      await browseDiskBtn.click();
      await page.waitForTimeout(800);

      // Type the path to direct-nochain fixtures
      const pathInput = page.locator('input.agent-explorer-path, input.step-path');
      await pathInput.waitFor({ state: 'visible' });
      await pathInput.clear();
      await pathInput.fill(fixturesDir);
      console.log(`Filled path input with: ${fixturesDir}`);
      await page.waitForTimeout(1500);

      // Click Use this directory
      const useBtn = page.locator('button:has-text("Use this directory")');
      await useBtn.waitFor({ state: 'visible', timeout: 5000 });
      await useBtn.click();
      await page.waitForTimeout(2000);

      // Expand some nodes
      const toggles = page.locator('.tree-node-toggle');
      const count = Math.min(await toggles.count(), 3);
      for (let i = 0; i < count; i++) {
        await toggles.nth(i).click().catch(() => {});
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(500);
    }

    // Screenshot
    await page.screenshot({
      path: join(screenshotsDir, 'browse-agent-view.png'),
      fullPage: false
    });
  });
});
