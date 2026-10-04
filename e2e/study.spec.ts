import { expect, test, type Page } from '@playwright/test';
import { tossup } from '../tests/fixtures';

const terms = ['A Streetcar Named Desire', 'Tennessee Williams'];
const question = 'Stanley throws a radio through a window. A Chinese paper lantern covers a bulb. A silver cigarette case is engraved. (*) Allan Grey committed suicide. Blanche DuBois visits her sister. Tennessee Williams wrote this play.';
async function mockSources(page: Page) {
  await page.route('https://www.qbreader.org/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('query')) {
      expect(url.searchParams.get('difficulties')).toBe('2,3,4');
      const query = url.searchParams.get('queryString')!;
      const target = query === 'Streetcar Named Desire' ? terms[0] : query;
      const direct = url.searchParams.get('searchType') === 'answer';
      const q = target === terms[0] ? question : 'The Glass Menagerie features Laura Wingfield. Cat on a Hot Tin Roof features Big Daddy. His sister Rose inspired Laura. (*) A Streetcar Named Desire features Blanche DuBois. Summer and Smoke features Alma Winemiller. Name this American playwright.';
      await route.fulfill({ json: { tossups: { count: direct ? 12 : 0, questionArray: direct ? Array.from({ length: 12 }, (_, i) => ({ ...tossup, _id: `${target}-${i}`, question: q, answer: target, category: 'Literature', subcategory: 'American Literature' })) : [] }, bonuses: { count: 0, questionArray: [] } } });
    } else if (url.pathname.endsWith('check-answer')) await route.fulfill({ json: { directive: 'reject' } });
    else if (url.pathname.endsWith('random-tossup')) await route.fulfill({ json: { tossups: [tossup] } });
    else await route.abort();
  });
}
async function createDeck(page: Page) {
  let queries = 0;
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/query')) queries++; });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Create Deck', exact: true }).click();
  await page.getByLabel('Deck name', { exact: true }).fill('Literature Canon');
  await page.getByLabel('Answer terms').fill(`${terms.join('\n')}\n\n${terms[0]}`);
  await expect(page.getByRole('status')).toHaveText('2 unique imported terms');
  await page.getByRole('button', { name: 'Analyze QBReader', exact: true }).click();
  await expect(page.getByText('Analysis complete. Review or save your deck.')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.study-review-card')).toHaveCount(2);
  await expect(page.locator('.study-review-card').first()).toContainText('Play:');
  await expect(page.locator('.study-review-card').first()).toContainText('12 relevant questions/items');
  await page.getByRole('button', { name: 'Save Deck', exact: true }).click();
  await expect(page.getByText('Deck saved to your library.')).toBeVisible();
  const fetched = queries;
  await page.locator('.study-review-card').first().getByRole('button', { name: 'Regenerate clue' }).click();
  await expect(page.locator('.study-review-card').first().getByRole('button', { name: 'Regenerate clue' })).toBeEnabled();
  expect(queries).toBe(fetched);
}

test('create → review → save → wrong/correct → repeat/trouble → history survives refresh', async ({ page }) => {
  await mockSources(page); await createDeck(page);
  await page.getByRole('button', { name: 'Set 1', exact: false }).click();
  await expect(page.getByLabel('Your answer', { exact: true })).toBeFocused();
  const clue = await page.getByTestId('flashcard-clue').innerText();
  await page.getByLabel('Your answer', { exact: true }).fill('Death of a Salesman');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('study-feedback')).toContainText('❌ 0/1');
  await expect(page.getByTestId('flashcard-clue')).toHaveText(clue);
  await page.getByLabel('Your answer', { exact: true }).fill('streetcar named desire');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('study-feedback')).toContainText('✅ 1/2');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('flashcard-clue')).toContainText('Author:');
  await expect(page.getByLabel('Your answer', { exact: true })).toBeFocused();
  await page.getByLabel('Your answer', { exact: true }).fill('Tennessee Williams');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Set Complete — 2 cards' })).toBeVisible();
  await expect(page.locator('.study-summary')).toContainText('50%');
  await page.getByRole('button', { name: 'Practice Trouble Cards' }).click();
  await expect(page.getByTestId('study-feedback')).not.toContainText('0/1');
  await page.getByLabel('Your answer', { exact: true }).fill(terms[0]); await page.keyboard.press('Enter');
  await expect(page.getByTestId('study-feedback')).toContainText('✅ 1/1');
  await expect(page.getByRole('heading', { name: 'Set Complete — 1 cards' })).toBeVisible();
  await page.getByRole('button', { name: 'Repeat Set' }).click();
  await expect(page.getByTestId('study-feedback')).toContainText('Enter to submit');
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Study', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Literature Canon' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume study' }).click();
  await expect(page.getByTestId('flashcard-clue')).toContainText('Play:');
  await page.getByRole('button', { name: 'Leave study' }).click();
  await page.getByRole('button', { name: '← Deck library' }).click();
  await page.getByRole('button', { name: 'Study stats', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Literature', exact: true })).toBeVisible();
  await expect(page.locator('.metric-strip')).toContainText('67%');
  await expect(page.locator('.metric-strip')).toContainText('4');
});

test('CSV upload, manual editing, combined sets, random filters and mobile layout', async ({ page }) => {
  await mockSources(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Create Deck', exact: true }).click();
  await page.getByLabel('Deck name', { exact: true }).fill('CSV deck');
  await page.getByLabel('Upload TXT or CSV').setInputFiles({ name: 'terms.csv', mimeType: 'text/csv', buffer: Buffer.from(`answer,category,type\n${terms[0]},History,Author\n${terms[1]},Literature,Author`) });
  await expect(page.getByRole('status')).toHaveText('2 unique imported terms');
  await page.getByRole('button', { name: 'Analyze QBReader' }).click();
  await expect(page.getByText('Analysis complete. Review or save your deck.')).toBeVisible({ timeout: 30000 });
  await page.locator('.study-review-card').first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Clue text', { exact: true }).fill('Play: Paper lantern; Allan Grey; Blanche DuBois; Stanley Kowalski; Tennessee Williams.');
  await page.getByLabel('Aliases (one per line)').fill('Streetcar');
  await page.getByRole('button', { name: 'Save card', exact: true }).click();
  await page.getByRole('button', { name: 'Save Deck', exact: true }).click();
  await page.getByText('Deck settings & regeneration', { exact: true }).click();
  await page.getByLabel('Cards per set', { exact: true }).selectOption('custom');
  await page.getByLabel('Custom set size').fill('1');
  await expect(page.getByRole('button', { name: 'Set 2', exact: false })).toBeVisible();
  await page.getByLabel('Through set').fill('2'); await page.getByRole('button', { name: 'Practice range' }).click();
  await expect(page.locator('.study-card-meta')).toContainText('1 / 2');
  await page.getByLabel('Your answer', { exact: true }).fill('Streetcar'); await page.keyboard.press('Enter');
  await expect(page.getByTestId('study-feedback')).toContainText('✅ 1/1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Leave study' }).click(); await page.getByRole('button', { name: '← Deck library' }).click();
  const random = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Random library practice' }) });
  await random.getByLabel('Category', { exact: true }).selectOption('Literature');
  await random.getByLabel('Answer type', { exact: true }).selectOption('Play');
  await expect(random).toContainText('1 unique matching cards');
  await page.getByRole('button', { name: 'Start random practice' }).click();
  await expect(page.locator('.study-card-meta')).toContainText('1 / 1');
  await page.getByLabel('Your answer', { exact: true }).fill('streetcar'); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Set Complete — 1 cards' })).toBeVisible();
  await page.getByRole('button', { name: 'Another Random Set' }).click();
  await expect(page.getByTestId('flashcard-clue')).toContainText('Play:');
});

test('no matches and insufficient evidence stay reviewable and do not invent clues', async ({ page }) => {
  await mockSources(page);
  await page.route('https://www.qbreader.org/api/query?*', route => route.fulfill({ json: { tossups: { count: 0, questionArray: [] }, bonuses: { count: 0, questionArray: [] } } }));
  await page.goto('/'); await page.getByRole('navigation').getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Create Deck', exact: true }).click();
  await page.getByLabel('Deck name', { exact: true }).fill('Sparse'); await page.getByLabel('Answer terms').fill('Unknown obscure term');
  await page.getByRole('button', { name: 'Analyze QBReader' }).click();
  await expect(page.getByText('No matching questions', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('No supported clue text yet. Retry analysis, edit this card, or remove it.')).toBeVisible();
  await page.getByRole('button', { name: 'Save Deck', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All Sets' })).toHaveCount(0);
});

test('400-term generation remains cancellable and retains partial progress after refresh', async ({ page }) => {
  await mockSources(page); await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Create Deck', exact: true }).click();
  await page.getByLabel('Deck name', { exact: true }).fill('Large draft');
  await page.getByLabel('Answer terms').fill(Array.from({ length: 400 }, (_, i) => `Study Target ${i}`).join('\n'));
  await expect(page.getByRole('status')).toHaveText('400 unique imported terms');
  await page.getByRole('button', { name: 'Analyze QBReader' }).click();
  await expect.poll(async () => Number(await page.getByRole('progressbar').getAttribute('value'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Stop analysis' }).click();
  await expect(page.getByText('Analysis stopped. Generated cards are saved; continue when ready.')).toBeVisible();
  await expect(page.locator('.study-heading')).toContainText('400 cards');
  await expect(page.locator('.study-review-card')).toHaveCount(20);
  await expect(page.locator('.study-review-card').first()).toContainText('Ready');
  await page.reload(); await page.getByRole('navigation').getByRole('button', { name: 'Study', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Large draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue draft' }).click();
  await expect(page.locator('.study-heading')).toContainText('400 cards');
  await expect(page.locator('.study-review-card').first()).toContainText('Ready');
  await expect(page.getByRole('button', { name: 'Continue / retry failed terms' })).toBeVisible();
});
