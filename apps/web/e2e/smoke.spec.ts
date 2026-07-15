import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('logged-out experience renders without fabricated content', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Twitter/);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('[data-testid="tweet-card"]')).toHaveCount(0);
});

test('logged-out experience has no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('@visual logged-out desktop shell preserves the 2020 split layout', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop fidelity baseline');
  await page.goto('/');
  const benefits = page.locator('.landing-benefits');
  const join = page.locator('.landing-join');
  await expect(benefits).toBeVisible();
  await expect(join).toBeVisible();
  const [benefitsBox, joinBox, screenshot] = await Promise.all([
    benefits.boundingBox(),
    join.boundingBox(),
    page.screenshot({ fullPage: true }),
  ]);
  expect(benefitsBox?.width).toBeCloseTo(720, 0);
  expect(joinBox?.x).toBeCloseTo(720, 0);
  expect(joinBox?.width).toBeCloseTo(720, 0);
  expect(screenshot.byteLength).toBeGreaterThan(40_000);
});
