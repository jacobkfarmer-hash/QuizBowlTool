import { expect, test } from '@playwright/test';
import { tossup, bonus } from '../tests/fixtures';
test.beforeEach(async ({ page }) => {
  let serial = 0;
  await page.route('https://www.qbreader.org/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('random-tossup')) { const category = url.searchParams.get('categories')!; const difficulty = Number(url.searchParams.get('difficulties')); await route.fulfill({ json: { tossups: Array.from({ length: 2 }, () => ({ ...tossup, _id: `tu-${++serial}`, category, difficulty })) } }); }
    else if (url.pathname.endsWith('random-bonus')) await route.fulfill({ json: { bonuses: [{ ...bonus, _id: `bonus-${++serial}`, difficulty: Number(url.searchParams.get('difficulties')) }] } });
    else if (url.pathname.endsWith('check-answer')) await route.fulfill({ json: url.searchParams.get('givenAnswer') === 'liquid' ? { directive: 'prompt', directedPrompt: 'What liquid?' } : { directive: url.searchParams.get('givenAnswer') === 'wrong' ? 'reject' : 'accept' } });
    else await route.abort();
  });
});
test('Match: progressive read → buzz freeze → prompt → power → all bonus parts → persisted results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Match Play a full solo round with bonuses.' }).click();
  await page.getByRole('spinbutton', { name: 'Custom tossup count' }).fill('1');
  await page.getByLabel('Presentation', { exact: true }).selectOption('text');
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.getByRole('button', { name: /Buzz/ })).toBeEnabled();
  await expect(page.getByTestId('question-text')).not.toContainText('liquid water');
  await page.waitForTimeout(550);
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Your answer', { exact: true })).toBeFocused();
  const frozen = await page.getByTestId('question-text').innerText();
  await page.waitForTimeout(400);
  expect(await page.getByTestId('question-text').innerText()).toBe(frozen);
  await expect(page.locator('.official-answer')).toHaveCount(0);
  await page.getByLabel('Your answer', { exact: true }).fill('liquid');
  await page.keyboard.press('Enter');
  await expect(page.getByText('What liquid?', { exact: true })).toBeVisible();
  await page.getByLabel('Clarify your answer').fill('water');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('score')).toHaveText('15');
  await page.getByRole('button', { name: 'Continue to bonus' }).click();
  await expect(page.getByRole('button', { name: 'Begin bonus' })).toBeVisible();
  await page.getByRole('button', { name: 'Begin bonus' }).click();
  for (const [i, answer] of ['water', 'oxygen', 'sodium chloride'].entries()) {
    await expect(page.getByLabel('Your answer', { exact: true })).toBeVisible();
    if (i === 0) await expect(page.getByTestId('question-text')).not.toContainText('O2');
    await page.getByLabel('Your answer', { exact: true }).fill(answer);
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: i === 2 ? 'Finish bonus' : 'Next part' }).click();
  }
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByTestId('stat-line')).toHaveText('1 / 0 / 0');
  await expect(page.getByText('30', { exact: true })).toBeVisible();
  await expect(page.getByText('45', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'History & stats' }).click();
  await page.getByRole('button', { name: 'View results' }).click();
  await expect(page.getByTestId('stat-line')).toHaveText('1 / 0 / 0');
});
test('Practice: bonuses off makes no bonus requests; neg resumes locked out; finishes with a neg', async ({ page }) => {
  let bonusRequests = 0; page.on('request', r => { if (r.url().includes('random-bonus')) bonusRequests++; });
  await page.goto('/');
  await page.getByRole('spinbutton', { name: 'Custom tossup count' }).fill('1');
  await page.getByLabel('Presentation', { exact: true }).selectOption('text');
  await page.getByLabel('Text reading speed (WPM)').fill('450');
  await page.getByRole('button', { name: /Start session/ }).click();
  await expect(page.getByRole('button', { name: /Buzz/ })).toBeEnabled();
  await page.keyboard.press('Space');
  await page.getByLabel('Your answer', { exact: true }).fill('wrong');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('score')).toHaveText('-5');
  await page.getByRole('button', { name: /Resume question/ }).click();
  await expect(page.getByRole('button', { name: /Buzz/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Finish session' }).click();
  await expect(page.getByTestId('stat-line')).toHaveText('0 / 0 / 1');
  expect(bonusRequests).toBe(0);
  await expect(page.getByText('PPB', { exact: true })).toHaveCount(0);
});
test('setup validation, saved presets, theme and narrow-screen layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  for (const d of [2, 3, 4]) await page.getByRole('spinbutton', { name: `Difficulty ${d} weight` }).fill('0');
  await expect(page.getByRole('button', { name: /Start session/ })).toBeDisabled();
  await page.getByRole('spinbutton', { name: 'Difficulty 3 weight' }).fill('100');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  page.once('dialog', d => d.accept('My custom preset')); await page.getByRole('button', { name: 'Save preset', exact: true }).click();
  await expect(page.getByLabel('Saved presets')).toContainText('My custom preset');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('two tossups use the next pool draw and a refreshed buzz checkpoint recovers without losing points', async ({ page }) => {
  await page.goto('/'); await page.getByRole('spinbutton', { name: 'Custom tossup count' }).fill('2'); await page.getByLabel('Presentation', { exact: true }).selectOption('text');
  await page.getByRole('button', { name: /Start session/ }).click(); await expect(page.getByRole('button', { name: /Buzz/ })).toBeEnabled(); await page.keyboard.press('Space'); await page.getByLabel('Your answer', { exact: true }).fill('water'); await page.keyboard.press('Enter'); await page.getByRole('button', { name: /Next tossup/ }).click();
  await expect(page.getByText('TOSSUP 2 / 2', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: /Buzz/ })).toBeEnabled(); await page.keyboard.press('Space'); await expect(page.getByLabel('Your answer', { exact: true })).toBeVisible(); await page.waitForTimeout(150); await page.reload();
  await page.getByRole('button', { name: /Resume session/ }).click(); await expect(page.getByLabel('Your answer', { exact: true })).toBeFocused(); await expect(page.getByTestId('score')).toHaveText('15'); await page.getByRole('button', { name: 'Give up', exact: true }).click(); await page.getByRole('button', { name: /Finish session/ }).click(); await expect(page.getByTestId('stat-line')).toHaveText('1 / 0 / 0');
});
