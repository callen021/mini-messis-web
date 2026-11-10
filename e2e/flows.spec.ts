import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';

/**
 * The full coach + parent flow from docs/BUILD-PROMPT.md §7, against a LOCAL Supabase
 * (`npx supabase start` with email confirmations off, see supabase/config.toml). Two browser
 * contexts with their own storage: the coach signs up, builds the team, schedules and runs a game;
 * the parent signs up in parallel, joins by code, waits for approval and watches the score move.
 *
 * Skipped (not failed) when the dev server is not pointed at a local Supabase, so the smoke tests
 * still run with the CI placeholder env.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(SUPABASE_URL);
const PASSWORD = 'playwright-pass-1';
const PLAYERS = ['Ava', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
/** The demo coach from supabase/seed.sql, a platform admin (team creation is admin-only, D48). */
const ADMIN_COACH = { email: 'coach@example.com', password: 'password123' };

test.describe('coach and parent flows', () => {
  test.skip(!LOCAL, 'needs VITE_SUPABASE_URL pointing at a local Supabase (npx supabase start)');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  let coachCtx: BrowserContext;
  let parentCtx: BrowserContext;
  let coach: Page;
  let parent: Page;
  const run = Date.now().toString(36);
  const parentEmail = `parent-${run}@example.com`;
  const teamName = `Strikers ${run}`;
  let joinCode = '';

  test.beforeAll(async ({ browser }) => {
    [coachCtx, coach] = await fresh(browser);
    [parentCtx, parent] = await fresh(browser);
  });
  test.afterAll(async () => {
    await coachCtx?.close();
    await parentCtx?.close();
  });

  test('a new sign-up without a team is told to ask the coach for an invite link', async () => {
    const [ctx, page] = await fresh(coach.context().browser() as Browser);
    await signUp(page, 'Wandering Wes', `wes-${run}@example.com`);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible();
    await expect(page.getByText('Ask your coach for an invite link')).toBeVisible();
    await expect(page.getByRole('link', { name: /Create a team/ })).toHaveCount(0);
    await page.goto('/create-team');
    await expect(page).toHaveURL(/\/welcome$/);
    await ctx.close();
  });

  test('the coach (a platform admin, seeded locally) signs in', async () => {
    await coach.goto('/signin');
    await coach.getByLabel('Email').fill(ADMIN_COACH.email);
    await coach.getByLabel('Password').fill(ADMIN_COACH.password);
    await coach.getByRole('button', { name: 'Sign in' }).click();
    await expect(coach).toHaveURL(/\/field$/, { timeout: 20_000 });
  });

  test('coach creates a soccer team and gets the Field', async () => {
    // Team creation is platform-admin only (D48): the seeded coach is one.
    await coach.goto('/create-team');
    await expect(coach.getByRole('heading', { level: 1, name: 'Create a team' })).toBeVisible();
    await coach.getByLabel('Team name').fill(teamName);
    await coach.getByRole('button', { name: /^Soccer/ }).click();
    await coach.getByRole('button', { name: 'Create team' }).click();
    await expect(coach).toHaveURL(/\/field$/);
    // a coach's Field title is the editable team name (role textbox), not a heading
    await expect(coach.getByRole('textbox', { name: 'Team name' })).toHaveText(teamName);
  });

  test('coach adds eight players on the roster', async () => {
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Roster' }).click();
    for (const [i, name] of PLAYERS.entries()) {
      await coach.getByRole('button', { name: 'Add player' }).first().click();
      const sheet = coach.getByRole('dialog', { name: 'Add player' });
      await sheet.getByLabel('First name').fill(name);
      await sheet.getByLabel('Jersey number (optional)').fill(String(i + 1));
      await sheet.getByRole('button', { name: 'Add player' }).click();
      await expect(sheet).toBeHidden();
      await expect(coach.getByRole('textbox', { name: 'Player name' }).nth(i)).toHaveValue(name);
    }
    await expect(coach.getByRole('textbox', { name: 'Player name' })).toHaveCount(PLAYERS.length);
  });

  test('coach auto-fills every period on the Field', async () => {
    await coach.goto('/field');
    const cards = coach.locator('.qcard');
    await expect(cards.first().locator('.shirt')).toHaveCount(7);
    // every card has its own Auto-fill; the sticky toolbar's fills all periods at once
    await coach.locator('.actionbar').getByRole('button', { name: 'Auto-fill' }).click();
    await expect(coach.getByRole('status').filter({ hasText: /jerseys filled/ })).toBeVisible();
    await expect(cards.first().locator('.shirt.open')).toHaveCount(0);
    await expect(cards.last().locator('.shirt.open')).toHaveCount(0);
  });

  test('coach schedules a game from the Schedule tab', async () => {
    await coach.goto('/games');
    await expect(coach.getByRole('heading', { level: 1, name: 'Schedule' })).toBeVisible();
    await coach.getByRole('button', { name: 'Add' }).click();
    const choose = coach.getByRole('dialog', { name: 'Add to the schedule' });
    await choose.getByRole('button', { name: 'New game' }).click();
    const sheet = coach.getByRole('dialog', { name: 'New game' });
    await sheet.getByLabel('Opponent').fill('Tigers');
    await sheet.getByRole('button', { name: 'Save for later' }).click();
    await expect(sheet).toBeHidden();
    await expect(coach.getByText('vs Tigers')).toBeVisible();
    await expect(coach.getByText('Upcoming')).toBeVisible();
  });

  test('coach reads the join code from Members', async () => {
    await coach.goto('/settings/members');
    const code = coach.getByLabel(/^Join code/);
    await expect(code).toBeVisible();
    joinCode = (await code.textContent())?.trim() ?? '';
    expect(joinCode).toMatch(/^[A-Z2-9]{8}$/);
  });

  test('parent signs up, joins by code and waits for approval', async () => {
    await signUp(parent, 'Parent Pat', parentEmail);
    // the welcome page's code box opens /join/<code>, which looks the code up by itself
    await parent.getByLabel('Join code').fill(joinCode);
    await parent.getByRole('button', { name: 'Join team' }).click();
    await expect(parent).toHaveURL(new RegExp(`/join/${joinCode}$`));
    await expect(parent.getByRole('heading', { level: 1 })).toContainText(teamName);
    await parent.getByRole('switch', { name: 'Ava is my child' }).click();
    await parent.getByRole('button', { name: 'Request to join' }).click();
    await expect(parent.getByRole('heading', { level: 1, name: 'Almost in' })).toBeVisible();
    await expect(parent.getByText('Pending')).toBeVisible();
  });

  test('coach approves the parent; the parent gets in without reloading', async () => {
    await coach.reload();
    await expect(coach.getByText('Parent Pat')).toBeVisible();
    await coach.getByRole('button', { name: 'Approve…' }).click();
    const sheet = coach.getByRole('dialog', { name: 'Approve Parent Pat' });
    await expect(sheet.getByRole('switch', { name: 'Ava is their child' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await sheet.getByRole('button', { name: 'Approve as parent' }).click();
    await expect(sheet).toBeHidden();
    // the member row (a button for coaches) now carries the Parent badge
    await expect(coach.getByRole('button', { name: /Parent Pat/ })).toContainText('Parent');
    // Realtime on the parent's own membership row flips the pending page into the app.
    await expect(parent).toHaveURL(/\/field$/, { timeout: 15_000 });
  });

  test('parent sees the schedule but no coach controls', async () => {
    await parent.goto('/games');
    await expect(parent.getByRole('heading', { level: 1, name: 'Schedule' })).toBeVisible();
    await expect(parent.getByText('vs Tigers')).toBeVisible();
    await expect(parent.getByRole('button', { name: 'Add' })).toHaveCount(0);
  });

  test('coach starts the game; the parent sees it go live', async () => {
    await coach.goto('/games');
    await coach.getByRole('link', { name: /vs Tigers/ }).click();
    await expect(coach.getByRole('heading', { level: 1, name: 'vs Tigers' })).toBeVisible();
    await coach.getByRole('button', { name: 'Start game' }).click();
    await expect(coach.getByRole('button', { name: 'Finish game' })).toBeVisible();
    await expect(coach.getByLabel('Us 0, them 0')).toBeVisible();
    await expect(parent.getByText('In progress · vs Tigers')).toBeVisible({ timeout: 15_000 });
    await expect(parent.getByLabel('Us 0, them 0')).toBeVisible();
  });

  test('coach adds a goal; the parent sees the score update live', async () => {
    await coach.getByRole('button', { name: 'Add goal' }).click();
    const sheet = coach.getByRole('dialog', { name: 'Goal · vs Tigers' });
    await sheet.getByLabel('Scorer').selectOption({ label: '#1 Ava' });
    await sheet.getByRole('button', { name: 'Add our goal' }).click();
    await expect(sheet).toBeHidden();
    await expect(coach.getByLabel('Us 1, them 0')).toBeVisible();
    await expect(parent.getByLabel('Us 1, them 0')).toBeVisible({ timeout: 15_000 });
  });

  test('coach finishes the game and the Stats show the result', async () => {
    await coach.getByRole('button', { name: 'Finish game' }).click();
    const confirm = coach.getByRole('dialog', { name: 'Finish game vs Tigers?' });
    await confirm.getByRole('button', { name: 'Finish game' }).click();
    await expect(confirm).toBeHidden();
    await expect(coach.getByRole('button', { name: 'Finish game' })).toHaveCount(0);

    await coach.goto('/stats');
    await coach.getByRole('radio', { name: 'Season' }).click();
    const result = coach.getByRole('link', { name: /vs Tigers/ });
    await expect(result).toBeVisible();
    await expect(result.getByText('Win')).toBeVisible();
    await expect(result.getByLabel('Us 1, them 0')).toBeVisible();
    const avaRow = coach.locator('.prow', { has: coach.getByRole('link', { name: /^Ava/ }) });
    await expect(avaRow.getByLabel('Goals: 1')).toBeVisible();

    // the parent sees the same result, read-only
    await parent.goto('/stats');
    await parent.getByRole('radio', { name: 'Season' }).click();
    await expect(parent.getByRole('link', { name: /vs Tigers/ }).getByText('Win')).toBeVisible();
  });
});

async function fresh(browser: Browser): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext();
  return [ctx, await ctx.newPage()];
}

async function signUp(page: Page, name: string, email: string) {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { level: 1, name: 'Create account' })).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 20_000 });
}
