import { type Browser, type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';

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
/** Team-setup controls save a moment after the tap (D88); wait for the request before reloading. */
const teamSaved = (page: Page) =>
  page.waitForResponse((r) => r.url().includes('/rest/v1/teams') && r.request().method() === 'PATCH');

test.describe('coach and parent flows', () => {
  test.skip(!LOCAL, 'needs VITE_SUPABASE_URL pointing at a local Supabase (npx supabase start)');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  let coachCtx: BrowserContext;
  let parentCtx: BrowserContext;
  let danaCtx: BrowserContext;
  let coach: Page;
  let parent: Page;
  /** A parent who joins with approval off (D91). */
  let danaPage: Page;
  const run = Date.now().toString(36);
  const parentEmail = `parent-${run}@example.com`;
  const teamName = `Strikers ${run}`;
  let joinCode = '';
  /** The player left on the bench once the clock-mode starters are set (D70 tests). */
  let benchPlayer = '';
  /** The formation at kickoff of the clock game, before the mid-game change (D108). */
  let kickoffFormation = '';

  test.beforeAll(async ({ browser }) => {
    [coachCtx, coach] = await fresh(browser);
    [parentCtx, parent] = await fresh(browser);
  });
  test.afterAll(async () => {
    await coachCtx?.close();
    await parentCtx?.close();
    await danaCtx?.close();
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

  test('a new team starts on the clock with red jerseys (D87); the coach switches to periods for the period-mode flows', async () => {
    // clock mode: one card of starters instead of period cards
    await expect(coach.getByRole('heading', { level: 2, name: 'Starters' })).toBeVisible();
    await coach.goto('/settings/team');
    const group = coach.getByRole('radiogroup', { name: 'Track playing time by' });
    await expect(group.getByRole('radio', { name: 'Clock' })).toHaveAttribute('aria-checked', 'true');
    await expect(coach.getByText('#E22400')).toHaveCount(4); // striker, midfield, defense, goalkeeper
    const saved = teamSaved(coach);
    await group.getByRole('radio', { name: 'Periods' }).click();
    await expect(coach.getByRole('status').filter({ hasText: 'Playing time by periods' })).toBeVisible();
    await saved;
    await coach.goto('/field');
    await expect(coach.locator('.qcard')).toHaveCount(4);
  });

  test('coach adds eight players on the roster', async () => {
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Roster' }).click();
    // staff controls sit behind Edit roster (D57)
    await coach.getByRole('button', { name: 'Edit roster' }).click();
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
    await coach.getByRole('button', { name: 'Done' }).click();
    // the directory view: one row per player, no inputs
    await expect(coach.getByRole('textbox', { name: 'Player name' })).toHaveCount(0);
    await expect(coach.locator('.group').getByRole('link', { name: /Ava/ })).toBeVisible();
  });

  test('the bench is a queue: roster order, two bench taps swap places, the order survives a reload (D79)', async () => {
    await coach.goto('/field');
    const card = coach.locator('.qcard').first();
    const names = () => card.locator('.bslot .shirt .name').allTextContents();
    await expect(card.locator('.bslot')).toHaveCount(PLAYERS.length);
    expect((await names()).map((n) => n.toLowerCase())).toEqual(PLAYERS.map((n) => n.toLowerCase()));
    // Ava (leftmost, next in line) and Cal change places
    await card.locator('.bslot .shirt').nth(0).click();
    await card.locator('.bslot .shirt').nth(2).click();
    await expect(coach.getByRole('status').filter({ hasText: 'swap places in line' })).toBeVisible();
    await expect(card.locator('.bslot .shirt .name').nth(0)).toHaveText('Cal', { ignoreCase: true });
    await expect(card.locator('.bslot .shirt .name').nth(2)).toHaveText('Ava', { ignoreCase: true });
    await coach.reload();
    await expect(coach.locator('.qcard').first().locator('.bslot .shirt .name').nth(0)).toHaveText('Cal', {
      ignoreCase: true,
    });
    // the other cards keep their own queues
    await expect(coach.locator('.qcard').nth(1).locator('.bslot .shirt .name').nth(0)).toHaveText('Ava', {
      ignoreCase: true,
    });
    // a bench player who goes on leaves the queue and the gap closes
    const first = coach.locator('.qcard').first();
    await first.locator('.bslot .shirt').nth(0).click(); // Cal
    await first.locator('.slot .shirt.open').first().click();
    await expect(first.locator('.bslot')).toHaveCount(PLAYERS.length - 1);
    await expect(first.locator('.bslot .shirt .name').nth(0)).toHaveText('Ben', { ignoreCase: true });
    // put the queue back to roster order for the tests that follow
    await first.locator('.slot .shirt').first().click();
    await coach.getByRole('button', { name: 'Open the spot' }).first().click();
    await expect(first.locator('.bslot .shirt .name').last()).toHaveText('Cal', { ignoreCase: true });
  });

  test('one period in period mode: a single card called Game and a Rotation column headed Game (D97)', async () => {
    await coach.goto('/settings/team');
    const dec = coach.getByRole('button', { name: /Decrease (Quarters|Halves|Periods)/ });
    // the count change also resizes the template through save_lineups; wait for that before reloading
    const synced = () => coach.waitForResponse((r) => r.url().includes('/rpc/save_lineups'));
    let saved = synced();
    await dec.click(); // 4 → 3
    await dec.click(); // 3 → 2
    await dec.click(); // 2 → 1
    await expect(coach.getByRole('group', { name: 'Periods' })).toContainText('1');
    await expect(coach.getByText('One field card for the whole game')).toBeVisible();
    await expect(coach.getByText(/1 half|1 quarter|halfs/)).toHaveCount(0);
    await saved;
    await coach.goto('/field');
    await expect(coach.locator('.qcard')).toHaveCount(1);
    await expect(coach.getByRole('heading', { level: 2, name: 'Game' })).toBeVisible();
    await expect(coach.getByText(/one period/)).toBeVisible();
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Rotation' }).click();
    await expect(coach.locator('.qlab').first()).toHaveText('Game');
    await expect(coach.getByText(/1 half|1 quarter|halfs/)).toHaveCount(0);
    // back to four quarters for the flows that follow
    await coach.goto('/settings/team');
    const inc = coach.getByRole('button', { name: /Increase (Quarters|Halves|Periods)/ });
    saved = synced();
    await inc.click();
    await inc.click();
    await inc.click();
    await expect(coach.getByRole('group', { name: 'Quarters' })).toContainText('4');
    await saved;
    await coach.goto('/field');
    await expect(coach.locator('.qcard')).toHaveCount(4);
  });

  test('Field empty state at 375px: open jerseys show the code and a plus, never "Select" (D63)', async () => {
    await coach.setViewportSize({ width: 375, height: 760 });
    await coach.goto('/field');
    const first = coach.locator('.qcard').first();
    await expect(first.locator('.shirt.open')).toHaveCount(7);
    await expect(coach.getByText('Select')).toHaveCount(0);
    const shirt = first.locator('.shirt.open').first();
    await expect(shirt.locator('.code')).toHaveText(/^[A-Z]{1,4}$/);
    await expect(shirt.locator('.plus')).toBeVisible();
    // the code sits inside the shirt box
    const box = await shirt.boundingBox();
    const code = await shirt.locator('.code').boundingBox();
    expect(box && code && code.x >= box.x - 1 && code.x + code.width <= box.x + box.width + 1).toBe(true);
    // the bench row is readable above the sticky action bar
    const bench = coach.locator('.benchrow').last();
    await bench.scrollIntoViewIfNeeded();
    const benchBox = await bench.boundingBox();
    const bar = await coach.locator('.actionbar').boundingBox();
    expect(benchBox && bar && benchBox.y + benchBox.height <= bar.y + 1).toBe(true);
    await coach.setViewportSize({ width: 412, height: 915 });
  });

  test('coach auto-fills every period on the Field', async () => {
    await coach.goto('/field');
    const cards = coach.locator('.qcard');
    await expect(cards.first().locator('.slot .shirt')).toHaveCount(7); // the bench row holds the other eight
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
    await sheet.getByLabel('Start time (optional)').fill('09:30');
    await sheet.getByLabel('Location / field (optional)').fill('Riverside Community Park, Field 3');
    await sheet.getByLabel('Address (optional)').fill('1200 Example Parkway, Springfield');
    await sheet.getByRole('radio', { name: 'Home' }).click();
    await sheet.getByRole('button', { name: 'Save for later' }).click();
    await expect(sheet).toBeHidden();
    await expect(coach.getByText('vs Tigers')).toBeVisible();
    await expect(coach.getByText('Today')).toBeVisible();
  });

  test('coach reads the join code from Members', async () => {
    await coach.goto('/settings/members');
    const code = coach.getByLabel(/^Join code/);
    await expect(code).toBeVisible();
    joinCode = (await code.textContent())?.trim() ?? '';
    expect(joinCode).toMatch(/^[A-Z2-9]{8}$/);
    // approval is off by default (D91); this run keeps the approval flow (D49) under test by turning it on
    const approve = coach.getByRole('switch', { name: 'Approve new parents before they join' });
    await expect(approve).toHaveAttribute('aria-checked', 'false');
    await approve.click();
    await expect(approve).toHaveAttribute('aria-checked', 'true');
    await expect(coach.getByRole('status').filter({ hasText: 'wait for your approval' })).toBeVisible();
  });

  test('parent opens the invite link, creates an account, picks a child and waits for approval', async () => {
    // signed out: the one-screen join (D49)
    await parent.goto(`/join/${joinCode}`);
    await expect(parent.getByRole('heading', { level: 1 })).toContainText(teamName);
    await parent.getByLabel('Your name').fill('Parent Pat');
    await parent.getByLabel('Email').fill(parentEmail);
    await parent.getByLabel('Password').fill(PASSWORD);
    await parent.getByRole('switch', { name: 'Ava is my child' }).click();
    await parent.getByLabel('Mobile number').fill('(555) 010-0001');
    await parent.getByRole('button', { name: 'Create account and join' }).click();
    await expect(parent.getByRole('heading', { level: 1, name: 'Almost in' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(parent.getByText('Pending')).toBeVisible();
  });

  test('a signed-in user who opens the link goes straight to the child picker', async () => {
    await parent.goto(`/join/${joinCode}`);
    await expect(parent.getByRole('heading', { level: 1 })).toContainText(teamName);
    await expect(parent.getByLabel('Email')).toHaveCount(0);
    await expect(parent.getByRole('switch', { name: 'Ava is my child' })).toBeVisible();
    await expect(parent.getByRole('button', { name: 'Ask to join' })).toBeVisible();
    await parent.goto('/pending');
    await expect(parent.getByRole('heading', { level: 1, name: 'Almost in' })).toBeVisible();
  });

  test('a typed code opens the same screen', async () => {
    const [ctx, page] = await fresh(parent.context().browser() as Browser);
    await signUp(page, 'Typing Tess', `tess-${run}@example.com`);
    await page.getByLabel('Join code').fill(joinCode);
    await page.getByRole('button', { name: 'Join team' }).click();
    await expect(page).toHaveURL(new RegExp(`/join/${joinCode}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(teamName);
    await expect(page.getByRole('button', { name: 'Ask to join' })).toBeVisible();
    await ctx.close();
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
    // Realtime on the parent's own membership row flips the pending page into the app, on
    // the child's tab (D53).
    await expect(parent).toHaveURL(/\/home$/, { timeout: 15_000 });
  });

  test("the parent's first tab is their child: next event, positions, season, skills, details", async () => {
    const nav = parent.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Ava' })).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(6); // Ava, Field, Team, Schedule, Stats + gear
    await expect(parent.getByRole('heading', { level: 1, name: 'Ava' })).toBeVisible();
    await expect(parent.getByText('Next up')).toBeVisible();
    await expect(parent.getByRole('link', { name: /vs Tigers/ })).toBeVisible();
    await expect(parent.getByText('Ava in the next game')).toBeVisible();
    await expect(parent.getByText('Personal bests', { exact: false })).toBeVisible();
    await expect(parent.getByLabel('Shirt size')).toBeVisible(); // a guardian may edit details
    await expect(parent.getByRole('link', { name: 'Whole team rotation' })).toBeVisible();
  });

  test("contact card: approval made the parent a contact; roster shows parents' names (D57)", async () => {
    // the coach: Ava's card lists Parent Pat with the invite phone, In app, call/text/email/vCard
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Roster' }).click();
    const avaRow = coach.locator('.group').getByRole('link', { name: /Ava/ });
    await expect(avaRow).toContainText('Parent');
    await avaRow.click();
    await expect(coach.getByRole('heading', { level: 1 })).toContainText('Ava');
    await expect(coach.getByText('Parents', { exact: true })).toBeVisible();
    await expect(coach.getByText('Parent Pat')).toBeVisible();
    await expect(coach.getByText('(555) 010-0001')).toBeVisible();
    await expect(coach.getByText('In app')).toBeVisible();
    await expect(coach.getByRole('link', { name: 'Call Parent Pat' })).toHaveAttribute(
      'href',
      'tel:+15550100001',
    );
    await expect(coach.getByRole('link', { name: 'Text Parent Pat' })).toHaveAttribute(
      'href',
      'sms:+15550100001',
    );
    await expect(coach.getByRole('button', { name: 'Add Parent Pat to contacts' })).toBeVisible();
    await expect(coach.getByRole('switch', { name: 'Share Parent Pat with team parents' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(coach.getByLabel('Shirt size')).toBeVisible();
    // back goes where we came from
    await coach.getByRole('link', { name: 'Team', exact: true }).first().click();
    await expect(coach).toHaveURL(/\/team$/);
    // the team sheet exists for staff
    await coach.goto('/team/sheet');
    await expect(coach.getByRole('heading', { level: 1, name: 'Team sheet' })).toBeVisible();
    await expect(coach.getByRole('cell', { name: /Parent Pat/ })).toBeVisible();
    await expect(coach.getByRole('button', { name: 'CSV' })).toBeVisible();

    // the parent: own card is editable, shares are visible, the team sheet is not
    await parent.goto('/team');
    await parent.getByRole('radio', { name: 'Roster' }).click();
    await expect(parent.getByRole('button', { name: 'Edit roster' })).toHaveCount(0);
    await parent.locator('.group').getByRole('link', { name: /Ben/ }).click();
    await expect(parent.getByRole('heading', { level: 1 })).toContainText('Ben');
    await expect(parent.getByText('Nothing shared with the team yet.')).toBeVisible();
    await expect(parent.getByLabel('Shirt size')).toHaveCount(0);
    await parent.goto('/team/sheet');
    await expect(parent).toHaveURL(/\/team$/);
  });

  test('with approval off (the default) a parent joins straight in; the link waits for a coach to confirm it (D91)', async () => {
    await coach.goto('/settings/members');
    const approve = coach.getByRole('switch', { name: 'Approve new parents before they join' });
    await approve.click();
    await expect(approve).toHaveAttribute('aria-checked', 'false');
    [danaCtx, danaPage] = await fresh(coach.context().browser() as Browser);
    const dana = danaPage;
    await dana.goto(`/join/${joinCode}`);
    await expect(dana.getByText(/on the team right away/)).toBeVisible();
    await dana.getByLabel('Your name').fill('Direct Dana');
    await dana.getByLabel('Email').fill(`dana-${run}@example.com`);
    await dana.getByLabel('Password').fill(PASSWORD);
    await dana.getByRole('switch', { name: 'Ben is my child' }).click();
    await dana.getByRole('button', { name: 'Create account and join' }).click();
    // no pending screen: straight to the child's tab, starred and first
    await expect(dana).toHaveURL(/\/home$/, { timeout: 20_000 });
    await expect(dana.getByRole('heading', { level: 1, name: 'Ben' })).toBeVisible();
    await expect(
      dana.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ben' }),
    ).toBeVisible();
    await expect(dana.getByText('Your coach will confirm your link to Ben')).toBeVisible();
    // withheld until then: the details (and the card's details section)
    await expect(dana.getByLabel('Shirt size')).toHaveCount(0);
    await expect(dana.getByText('Season', { exact: true })).toBeVisible(); // own-child stats are granted
    // the link is the staff's business now: opening the invite again changes nothing
    await dana.goto(`/join/${joinCode}`);
    await expect(dana.getByText('You’re already on this team')).toBeVisible();
    await dana.goto('/home');
  });

  test('Members shows who joined this week; one tap confirms the link and the parent sees the details live (D92)', async () => {
    // the Settings row carries the count of unconfirmed links
    await coach.goto('/settings');
    await expect(coach.getByRole('link', { name: /Members & join code/ })).toContainText(
      '1 child link to confirm',
    );
    await coach.goto('/settings/members');
    await expect(coach.getByText('New this week')).toBeVisible();
    const dana = coach.locator('.newmember').filter({ hasText: 'Direct Dana' });
    await expect(dana).toContainText('joined today');
    await expect(dana).toContainText('Ben · unconfirmed');
    // Parent Pat joined this week too, confirmed by approval
    await expect(coach.locator('.newmember').filter({ hasText: 'Parent Pat' })).toContainText(
      'Ava · confirmed',
    );
    await dana.getByRole('button', { name: 'Confirm Ben' }).click();
    await expect(coach.getByRole('status').filter({ hasText: 'Link to Ben confirmed' })).toBeVisible();
    await expect(dana).toContainText('Ben · confirmed');
    // Realtime on the parent's own link: the line goes, the details come
    await expect(danaPage.getByText('Your coach will confirm your link to Ben')).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(danaPage.getByLabel('Shirt size')).toBeVisible();
    await coach.goto('/settings');
    await expect(coach.getByRole('link', { name: /Members & join code/ })).not.toContainText('to confirm');
  });

  test('a scrolled player page at 375px keeps a solid strip behind the status bar (D63)', async () => {
    await parent.setViewportSize({ width: 375, height: 520 });
    await parent.goto('/team');
    await parent.getByRole('radio', { name: 'Roster' }).click();
    await parent.locator('.group').getByRole('link', { name: /Ava/ }).click();
    await expect(parent.getByRole('heading', { level: 1 })).toContainText('Ava');
    const strip = parent.locator('.statusbar-bg');
    await expect(strip).toHaveCount(1);
    await expect(strip).toHaveCSS('position', 'fixed');
    expect(await strip.evaluate((el) => getComputedStyle(el).top)).toBe('0px');
    await parent.evaluate(() => window.scrollTo(0, 300));
    await expect.poll(() => parent.evaluate(() => window.scrollY)).toBeGreaterThan(50);
    // still fixed at the top after scrolling, above the content
    expect(await strip.evaluate((el) => Number(getComputedStyle(el).zIndex))).toBeGreaterThan(10);
    await expect(parent.getByRole('button', { name: 'Team', exact: true })).toHaveCount(1);
    await parent.setViewportSize({ width: 412, height: 915 });
  });

  test('two player pages: the card from Roster, the skills page from Stats (D60)', async () => {
    // Roster → contact card: Parents and Details, no Skills
    await parent.goto('/team');
    await parent.getByRole('radio', { name: 'Roster' }).click();
    await parent.locator('.group').getByRole('link', { name: /Ava/ }).click();
    await expect(parent).toHaveURL(/\/players\/[0-9a-f-]+$/);
    await expect(parent.getByText('Parents', { exact: true })).toBeVisible();
    await expect(parent.getByText('Details', { exact: true })).toBeVisible();
    await expect(parent.getByText('Skills', { exact: true })).toHaveCount(0);
    // Stats → skills page: Skills only
    await parent.goto('/stats');
    await parent.getByRole('radio', { name: 'Season' }).click();
    await parent.locator('.statscroll').getByRole('link', { name: /Ava/ }).click();
    await expect(parent).toHaveURL(/\/players\/[0-9a-f-]+\/skills$/);
    await expect(parent.getByText('Skills', { exact: true })).toBeVisible();
    await expect(parent.getByText('Parents', { exact: true })).toHaveCount(0);
    await expect(parent.getByLabel('Shirt size')).toHaveCount(0);
  });

  test('back from a player page returns to the opener: Stats (with scroll), Roster, home (D61)', async () => {
    // Stats → Skills table, scrolled down (the coach's eight-row table in a short viewport so it scrolls)
    await coach.setViewportSize({ width: 375, height: 420 });
    await coach.goto('/stats');
    await coach.getByRole('radio', { name: 'Skills' }).click();
    await coach.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(() => coach.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await coach.locator('.matrix').getByRole('link', { name: 'Ava' }).click();
    await expect(coach).toHaveURL(/\/skills$/);
    await coach.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(coach).toHaveURL(/\/stats$/);
    await expect(coach.getByRole('radio', { name: 'Skills' })).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => coach.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await coach.setViewportSize({ width: 412, height: 915 });
    // Roster → card → back to Team
    await parent.goto('/team');
    await parent.getByRole('radio', { name: 'Roster' }).click();
    await parent.locator('.group').getByRole('link', { name: /Ava/ }).click();
    await parent.getByRole('button', { name: 'Team', exact: true }).click();
    await expect(parent).toHaveURL(/\/team$/);
    // home → skills history → back to home
    await parent.goto('/home');
    await parent.getByRole('link', { name: 'Full skills history' }).click();
    await expect(parent).toHaveURL(/\/skills$/);
    await parent.getByRole('button', { name: 'Ava', exact: true }).click();
    await expect(parent).toHaveURL(/\/home$/);
    await parent.setViewportSize({ width: 412, height: 915 });
  });

  test('recording skills: a session for the team, then a tap on a cell (D62)', async () => {
    await coach.goto('/stats');
    await coach.getByRole('radio', { name: 'Skills' }).click();
    await coach.getByRole('button', { name: 'Record results' }).click();
    const session = coach.getByRole('dialog', { name: 'Record results' });
    const first = await session.getByRole('combobox', { name: 'Test' }).inputValue();
    expect(first).toBeTruthy();
    await session.getByRole('spinbutton', { name: 'Ava value' }).fill('12');
    await session.getByRole('spinbutton', { name: 'Ben value' }).fill('9');
    await session.getByRole('button', { name: 'Save 2 results' }).click();
    await expect(session).toBeHidden();
    await expect(coach.getByRole('status').filter({ hasText: '2 results saved' })).toBeVisible();
    const avaRow = coach.locator('.matrix tr', { hasText: 'Ava' });
    await expect(avaRow.locator('td').nth(1)).toContainText('12');
    // tap Cal's empty cell for the same test
    const calRow = coach.locator('.matrix tr', { hasText: 'Cal' });
    await calRow.locator('td').nth(1).getByRole('button').click();
    const single = coach.getByRole('dialog', { name: /Record a result · Cal/ });
    await expect(single.getByRole('combobox', { name: 'Test' })).toBeEnabled();
    await single.getByRole('spinbutton').first().fill('7');
    await single.getByRole('button', { name: 'Save result' }).click();
    await expect(single).toBeHidden();
    await expect(calRow.locator('td').nth(1)).toContainText('7');
    // the parent's skills page shows Ava's new result without a reload of anything else
    await parent.goto('/home');
    await expect(parent.getByText(/Best 12/)).toBeVisible();
  });

  test('team board: announcement, unread dot, banner, comment (D58)', async () => {
    await coach.goto('/board');
    await expect(coach.getByRole('heading', { level: 1, name: 'Team board' })).toBeVisible();
    await coach.getByLabel('New post').fill('Bring water bottles Saturday — the fountain is broken.');
    await coach.getByRole('switch', { name: 'Announcement' }).click();
    await coach.getByRole('button', { name: 'Post' }).click();
    await expect(coach.getByText('Announcement', { exact: true })).toBeVisible();

    // the parent: dot in the header, banner on the home tab, then the board clears the dot
    await parent.goto('/home');
    await expect(parent.getByRole('link', { name: 'Team board, new posts' })).toBeVisible({
      timeout: 15_000,
    });
    const banner = parent.getByRole('status').filter({ hasText: 'Bring water bottles' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Dismiss announcement' }).click();
    await expect(banner).toHaveCount(0);
    await parent.getByRole('link', { name: 'Team board, new posts' }).click();
    await expect(parent.getByRole('heading', { level: 1, name: 'Team board' })).toBeVisible();
    await expect(parent.getByRole('link', { name: 'Team board', exact: true })).toBeVisible();
    await expect(parent.getByRole('switch', { name: 'Announcement' })).toHaveCount(0); // parents cannot announce
    await parent.getByLabel(/^Comment on post by/).fill('Got it, thanks!');
    await parent.getByRole('button', { name: 'Send' }).click();
    await expect(parent.getByText('Got it, thanks!')).toBeVisible();

    // the coach sees the comment arrive without reloading
    await expect(coach.getByText('Got it, thanks!')).toBeVisible({ timeout: 15_000 });
    await parent.goto('/games');
  });

  test('parent sees the schedule but no coach controls', async () => {
    await parent.goto('/games');
    await expect(parent.getByRole('heading', { level: 1, name: 'Schedule' })).toBeVisible();
    await expect(parent.getByText('vs Tigers')).toBeVisible();
    await expect(parent.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  });

  test('parent game detail: rows wrap at 375px with no overlap (layout regression, D55)', async () => {
    await parent.setViewportSize({ width: 375, height: 760 });
    await parent.goto('/games');
    await parent.getByRole('link', { name: /vs Tigers/ }).click();
    await expect(parent.getByRole('heading', { level: 1, name: 'vs Tigers' })).toBeVisible();
    const rows = parent.locator('.row.detail');
    await expect(rows).toHaveCount(4); // When, Where, Address, Home / away
    const when = rows.filter({ hasText: 'When' });
    await expect(when.locator('.val')).toHaveText(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{4} · 9:30 AM$/);
    for (let i = 0; i < 4; i++) {
      const row = rows.nth(i);
      const lbl = await row.locator('.lbl').boundingBox();
      const val = await row.locator('.val').boundingBox();
      const box = await row.boundingBox();
      expect(lbl && val && box).toBeTruthy();
      if (!lbl || !val || !box) continue;
      // no overlap: the value is to the right of the label, or wrapped fully below it
      const sideBySide = val.x >= lbl.x + lbl.width - 1;
      const below = val.y >= lbl.y + lbl.height - 1;
      expect(sideBySide || below, `row ${i}: label and value overlap`).toBe(true);
      expect(val.x + val.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
    const overflow = await parent.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await test.info().attach('game-detail-parent-375', {
      body: await parent.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await parent.setViewportSize({ width: 412, height: 915 });
    await parent.goto('/games'); // the live-game checks that follow expect the schedule
  });

  test("RSVP: the parent says Ava can't make it from Home; the coach sees the count, the tagged jersey and the attendance list; the switch overrides it (D107)", async () => {
    await parent.goto('/home');
    // unanswered: the prompt, the amber tag, the two buttons; the schedule shows an amber dot (the game is today)
    await expect(parent.getByText('Is Ava going?')).toBeVisible();
    await expect(parent.getByText('Reply needed')).toBeVisible();
    await parent.goto('/games');
    await expect(parent.locator('.rsvpmark')).toHaveAttribute('aria-label', 'Ava: reply needed');
    await parent.goto('/home');
    const out = parent.getByRole('button', { name: 'Can’t make it' });
    await expect(out).toBeVisible();
    await out.click();
    // answered: one status line with a Change link instead of the buttons
    await expect(parent.getByText('Ava can’t make it')).toBeVisible();
    await expect(parent.getByRole('button', { name: 'Change' })).toBeVisible();
    await expect(out).toHaveCount(0);
    await parent.getByRole('button', { name: 'Change' }).click();
    await expect(parent.getByRole('button', { name: 'Can’t make it' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await parent.goto('/home');
    // the schedule row shows a cross by the date, named for screen readers
    await parent.goto('/games');
    await expect(parent.locator('.rsvpmark')).toHaveAttribute('aria-label', 'Ava: can’t make it');
    // the coach: the row count, the attendance list, the Field
    await coach.goto('/games');
    await expect(coach.locator('.rsvpcount')).toHaveText('7 in · 1 out');
    await coach.getByRole('link', { name: /vs Tigers/ }).click();
    await expect(coach.getByRole('heading', { level: 1, name: 'vs Tigers' })).toBeVisible();
    const outGroup = coach.locator('.attgroup').nth(1);
    await expect(outGroup).toContainText('Ava');
    await expect(outGroup).toContainText('by parent');
    await coach.goto('/field');
    // Ava was auto-filled into the plan: she keeps her spot with the red OUT tag and the note names her
    await expect(coach.locator('.shirt.heldout').first()).toBeVisible();
    await expect(
      coach.getByRole('status').filter({ hasText: 'A parent says Ava can’t make it' }),
    ).toBeVisible();
    await expect(coach.locator('.benchlabel').first()).toContainText('Out: Ava (parent)');
    await expect(coach.locator('.benchq .shirt', { hasText: 'Ava' })).toHaveCount(0);
    // the rotation view lists her out with the parent note; the switch overrides the reply
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Rotation' }).click();
    await expect(coach.getByText('Parent: can’t make it')).toBeVisible();
    await coach.getByRole('switch', { name: /Ava is out/ }).click();
    await expect(coach.getByText('Parent: can’t make it')).toHaveCount(0);
    await coach.goto('/games');
    await expect(coach.locator('.rsvpcount')).toHaveText('8 in · 0 out');
    await coach.getByRole('link', { name: /vs Tigers/ }).click();
    await expect(coach.locator('.attgroup').nth(0)).toContainText('by coach');
    // the parent sees the coach's answer
    await parent.goto('/home');
    await expect(parent.getByText('Ava is going')).toBeVisible();
    await parent.goto('/games');
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

  test("once the game has started the parent's reply is locked; the coach can still change it (D107)", async () => {
    await parent.goto('/home');
    await parent.getByText('In progress · vs Tigers').click();
    await expect(parent.getByRole('heading', { level: 1, name: 'vs Tigers' })).toBeVisible();
    // locked: the status line without Change, no buttons
    await expect(parent.getByText('Ava is going')).toBeVisible();
    await expect(parent.getByRole('button', { name: 'Change' })).toHaveCount(0);
    await expect(parent.getByRole('button', { name: 'Going' })).toHaveCount(0);
    await expect(parent.getByText('Replies closed: the game has started.')).toBeVisible();
    await coach
      .getByRole('radiogroup', { name: 'Ava: attendance' })
      .getByRole('radio', { name: 'Out' })
      .click();
    await expect(coach.locator('.attgroup').nth(1)).toContainText('Ava');
    await coach
      .getByRole('radiogroup', { name: 'Ava: attendance' })
      .getByRole('radio', { name: 'In' })
      .click();
    await expect(coach.locator('.attgroup').nth(0)).toContainText('Ava');
    await parent.goto('/games');
  });

  test('coach adds a goal; the parent sees the score update live', async () => {
    await coach.getByRole('button', { name: 'Add goal' }).click();
    const sheet = coach.getByRole('dialog', { name: 'Goal · vs Tigers' });
    await pickPlayer(sheet, 'Scorer', '#1 Ava');
    await sheet.getByRole('button', { name: 'Add our goal' }).click();
    await expect(sheet).toBeHidden();
    await expect(coach.getByLabel('Us 1, them 0')).toBeVisible();
    await expect(parent.getByLabel('Us 1, them 0')).toBeVisible({ timeout: 15_000 });
  });

  test("stats visibility: a parent sees other children's goals as 'Goal', own child by name (D56)", async () => {
    // a second goal by Ben, who is not the parent's child
    await coach.getByRole('button', { name: 'Add goal' }).click();
    const sheet = coach.getByRole('dialog', { name: 'Goal · vs Tigers' });
    await pickPlayer(sheet, 'Scorer', '#2 Ben');
    await sheet.getByRole('button', { name: 'Add our goal' }).click();
    await expect(sheet).toBeHidden();
    await expect(coach.getByLabel('Us 2, them 0')).toBeVisible();

    await parent.goto('/games');
    await parent.getByRole('button', { name: /In progress · vs Tigers/ }).click();
    await expect(parent.getByRole('heading', { level: 1, name: 'vs Tigers' })).toBeVisible();
    const log = parent.locator('.section', { hasText: 'Goals · 2' }).locator('xpath=following-sibling::*[1]');
    await expect(log).toContainText('Ava');
    await expect(log.locator('.row', { hasText: /Q[0-9]Goal/ })).toHaveCount(1); // Ben's goal, name withheld
    await expect(log).not.toContainText('Ben');

    await parent.goto('/stats');
    await parent.getByRole('radio', { name: 'Season' }).click();
    const rows = parent.locator('.statscroll .prow:not(.stathead)');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Ava');

    // the coach opens stats to the whole team
    await coach.goto('/settings');
    await coach
      .getByRole('radiogroup', { name: 'Parents can see stats for' })
      .getByRole('radio', { name: 'Team' })
      .click();
    await expect(coach.getByRole('status').filter({ hasText: 'whole team' })).toBeVisible();
    await parent.reload();
    await parent.getByRole('radio', { name: 'Season' }).click();
    await expect(parent.locator('.statscroll .prow:not(.stathead)')).toHaveCount(PLAYERS.length);
    await parent.goto(`/games`);
    await parent.getByRole('button', { name: /In progress · vs Tigers/ }).click();
    const log2 = parent
      .locator('.section', { hasText: 'Goals · 2' })
      .locator('xpath=following-sibling::*[1]');
    await expect(log2.locator('.row', { hasText: /Q[0-9]Ben/ })).toHaveCount(1);
    await coach.goto('/games');
    await coach.getByRole('button', { name: /In progress · vs Tigers/ }).click();
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
    await expect(result.getByLabel('Us 2, them 0')).toBeVisible();
    const avaRow = coach.locator('.prow', { has: coach.getByRole('link', { name: /^Ava/ }) });
    await expect(avaRow.getByLabel('Goals: 1')).toBeVisible();

    // the parent sees the same result, read-only
    await parent.goto('/stats');
    await parent.getByRole('radio', { name: 'Season' }).click();
    await expect(parent.getByRole('link', { name: /vs Tigers/ }).getByText('Win')).toBeVisible();
  });

  /* ---------- clock-based playing time (D65–D76) ---------- */

  test('period mode keeps four quarter cards, each with its own bench row and swap taps (D77)', async () => {
    await coach.goto('/field');
    await expect(coach.locator('.qcard')).toHaveCount(4);
    await expect(coach.locator('.qcard h2').first()).toHaveText('Q1');
    await expect(coach.locator('.benchrow')).toHaveCount(4);
    const card = coach.locator('.qcard').first();
    const first = card.locator('.slot .shirt').first();
    const name = (await first.locator('.name').textContent())?.trim() ?? '';
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    const benchShirt = card.locator('.bslot .shirt').first();
    const benchName = (await benchShirt.locator('.name').textContent())?.trim() ?? '';
    await benchShirt.click();
    await expect(card.locator('.slot .shirt').first().locator('.name')).toHaveText(benchName, {
      ignoreCase: true,
    });
    await expect(card.locator('.bslot .shirt').first().locator('.name')).toHaveText(name, {
      ignoreCase: true,
    });
    // the other quarters are untouched
    await expect(
      coach.locator('.qcard').nth(1).locator('.slot .shirt').first().locator('.name'),
    ).not.toHaveText(benchName, { ignoreCase: true });
  });

  test('coach switches the team to the clock in Team setup (D65)', async () => {
    await coach.goto('/settings/team');
    const saved = teamSaved(coach);
    await coach
      .getByRole('radiogroup', { name: 'Track playing time by' })
      .getByRole('radio', { name: 'Clock' })
      .click();
    await expect(coach.getByRole('status').filter({ hasText: 'Playing time by the clock' })).toBeVisible();
    await expect(coach.getByRole('group', { name: 'Halves' })).toContainText('2');
    await saved;
    const saved2 = teamSaved(coach);
    const len = coach.getByLabel('Half length in minutes');
    await len.fill('20');
    await len.blur();
    await expect(coach.getByRole('status').filter({ hasText: '20-minute half' })).toBeVisible();
    await saved2;
  });

  test('clock-mode Field at 375px: one field of starters, a bench row of small jerseys (D70)', async () => {
    await coach.setViewportSize({ width: 375, height: 760 });
    await coach.goto('/field');
    await expect(coach.locator('.qcard')).toHaveCount(1);
    await expect(coach.getByRole('heading', { level: 2, name: 'Starters' })).toBeVisible();
    const benchRow = coach.getByRole('group', { name: 'Bench' });
    await expect(benchRow).toContainText('Bench · 1');
    const fieldShirt = await coach.locator('.slot .shirt').first().boundingBox();
    const benchShirt = await coach.locator('.bslot .shirt').first().boundingBox();
    // smaller than a field jersey, but big enough for five to a row at 375px (D85)
    expect(fieldShirt && benchShirt && benchShirt.width < fieldShirt.width).toBe(true);
    expect(benchShirt && benchShirt.height >= 44 && benchShirt.width >= 56 && benchShirt.width <= 76).toBe(
      true,
    );
    // no horizontal scroll
    const overflow = await coach.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('select-then-target on the template: field then bench swaps the two, with a hint line', async () => {
    const first = coach.locator('.slot .shirt').first();
    const name = (await first.locator('.name').textContent())?.trim() ?? '';
    expect(name).not.toBe('');
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(coach.getByText(`Tap a player to swap with ${name}`, { exact: false })).toBeVisible();
    const benchShirt = coach.locator('.bslot .shirt').first();
    const benchName = (await benchShirt.locator('.name').textContent())?.trim() ?? '';
    await benchShirt.click();
    await expect(coach.locator('.slot .shirt').first().locator('.name')).toHaveText(benchName, {
      ignoreCase: true,
    });
    await expect(coach.locator('.bslot .shirt').first().locator('.name')).toHaveText(name, {
      ignoreCase: true,
    });
    benchPlayer = name;
    await coach.setViewportSize({ width: 412, height: 915 });
  });

  test('coach starts a clock game; both devices read the same clock and the parent is read-only', async () => {
    await coach.goto('/games');
    await coach.getByRole('button', { name: 'Add' }).click();
    await coach
      .getByRole('dialog', { name: 'Add to the schedule' })
      .getByRole('button', { name: 'New game' })
      .click();
    const sheet = coach.getByRole('dialog', { name: 'New game' });
    await sheet.getByLabel('Opponent').fill('Lions');
    await sheet.getByRole('button', { name: 'Start game now' }).click();
    await expect(sheet).toBeHidden();
    await coach.goto('/field');
    await expect(coach.getByRole('heading', { level: 2, name: 'H1' })).toBeVisible();
    // the clock never ran: the chip is amber and, for staff, a button (D108)
    await expect(coach.locator('.gclock.warn')).toBeVisible();
    await expect(coach.getByRole('button', { name: /Clock not started, 20:00/ })).toBeVisible();
    await coach.getByRole('button', { name: 'Start clock' }).click();
    await expect(coach.locator('.gclock.run')).toBeVisible();
    await expect(coach.getByRole('button', { name: 'Pause' })).toBeVisible();
    // the parent's phone: same period, running clock, no controls
    await parent.goto('/field');
    await expect(parent.getByRole('heading', { level: 2, name: 'H1' })).toBeVisible();
    await expect(parent.locator('.gclock.run')).toBeVisible({ timeout: 15_000 });
    await expect(parent.getByRole('button', { name: /Start clock|Pause|End H1|Undo/ })).toHaveCount(0);
    await expect(parent.locator('.slot .shirt').first()).toBeDisabled();
    await expect(parent.getByRole('group', { name: 'Bench' })).toContainText('Bench · 1');
    await expect(parent.getByRole('button', { name: /Start the clock/ })).toHaveCount(0);
  });

  test('the game bar at 375px: formation chip, clock and score never overlap, light and dark (D108)', async () => {
    await coach.setViewportSize({ width: 375, height: 812 });
    for (const scheme of ['light', 'dark'] as const) {
      await coach.emulateMedia({ colorScheme: scheme });
      await coach.goto('/field');
      await expect(coach.locator('.gclock')).toBeVisible();
      await expect(noHeaderOverlap(coach), `header overlap (${scheme})`).resolves.toEqual([]);
    }
    await coach.emulateMedia({ colorScheme: null });
    await coach.setViewportSize({ width: 412, height: 915 });
    await coach.goto('/field');
  });

  test('a substitution on the running clock shows on both devices; undo reverses it', async () => {
    const benchShirt = coach.locator('.bslot .shirt').first();
    const benchName = (await benchShirt.locator('.name').textContent())?.trim() ?? '';
    const target = coach.locator('.slot .shirt').first();
    const offName = (await target.locator('.name').textContent())?.trim() ?? '';
    await benchShirt.click();
    await target.click();
    const toastEl = coach.getByRole('status').filter({ hasText: `on for ${offName}` });
    await expect(toastEl).toBeVisible();
    await expect(toastEl).toHaveCSS('opacity', '1'); // settled, not mid-animation
    // the toast sits above the sticky toolbar, never over a control (D80)
    const toastBox = await toastEl.boundingBox();
    const barBox = await coach.locator('.actionbar').boundingBox();
    expect(toastBox && barBox && toastBox.y + toastBox.height <= barBox.y + 1).toBe(true);
    await expect(coach.locator('.slot .shirt').first().locator('.name')).toHaveText(benchName, {
      ignoreCase: true,
    });
    await expect(parent.locator('.slot .shirt').first().locator('.name')).toHaveText(benchName, {
      ignoreCase: true,
      timeout: 15_000,
    });
    await expect(parent.locator('.bslot .shirt').last().locator('.name')).toHaveText(offName, {
      ignoreCase: true,
    }); // joined the right end of the queue (D79)
    await coach.getByRole('button', { name: 'Undo' }).click();
    await expect(coach.getByRole('status').filter({ hasText: 'Substitution undone' })).toBeVisible();
    await expect(coach.locator('.slot .shirt').first().locator('.name')).toHaveText(offName, {
      ignoreCase: true,
    });
    await expect(parent.locator('.slot .shirt').first().locator('.name')).toHaveText(offName, {
      ignoreCase: true,
      timeout: 15_000,
    });
  });

  test('a formation change while the clock is paused keeps the same players, the keeper in goal and the minutes (D108)', async () => {
    await expect(coach.getByLabel(/19:[45]\d left, running/)).toBeVisible({ timeout: 20_000 });
    await coach.getByRole('button', { name: 'Pause' }).click();
    await expect(coach.getByLabel(/left, paused/)).toBeVisible();
    const select = coach.getByRole('combobox', { name: 'Formation' });
    await expect(select).toBeVisible();
    const current = await select.inputValue();
    kickoffFormation = current;
    const options = await select.locator('option').allTextContents();
    const target = options.find((o) => o !== current) ?? '';
    const namesBefore = (await coach.locator('.slot .shirt .name').allTextContents()).map((n) => n.trim());
    const gkBefore = (
      await coach
        .locator('.slot .shirt')
        .filter({ has: coach.locator('.code', { hasText: /^GK$/ }) })
        .locator('.name')
        .textContent()
    )?.trim();
    await select.selectOption(target);
    await expect(coach.getByRole('status').filter({ hasText: `Formation ${target}` })).toBeVisible();
    await expect(select).toHaveValue(target);
    const namesAfter = (await coach.locator('.slot .shirt .name').allTextContents()).map((n) => n.trim());
    expect([...namesAfter].sort()).toEqual([...namesBefore].sort());
    await expect(
      coach
        .locator('.slot .shirt')
        .filter({ has: coach.locator('.code', { hasText: /^GK$/ }) })
        .locator('.name'),
    ).toHaveText(gkBefore ?? '', { ignoreCase: true });
    // the parent's field follows; the game page logs the change; the Rotation view counts no extra shift
    await expect(parent.locator('.pill', { hasText: target })).toBeVisible({ timeout: 15_000 });
    await coach.goto('/games');
    await coach.getByRole('button', { name: /In progress · vs Lions/ }).click();
    await expect(coach.getByText(`Formation ${current} → ${target}`)).toBeVisible();
    await expect(coach.getByText(/1 shift · on the field at/).first()).toBeVisible();
    await coach.goto('/field');
    await coach.getByRole('button', { name: 'Resume' }).click();
    await expect(coach.locator('.gclock.run')).toBeVisible();
  });

  test('pause, end the half: the second half starts at zero with the same players', async () => {
    // let the clock run a few seconds so the first half has a length to correct against later
    await expect(coach.getByLabel(/19:5[0-6] left, running/)).toBeVisible({ timeout: 20_000 });
    await coach.getByRole('button', { name: 'Pause' }).click();
    await expect(coach.getByLabel(/left, paused/)).toBeVisible();
    await coach.getByRole('button', { name: 'End H1' }).click();
    const confirm = coach.getByRole('dialog', { name: /End H1 at/ });
    await confirm.getByRole('button', { name: 'End H1' }).click();
    await expect(coach.getByRole('heading', { level: 2, name: 'H2' })).toBeVisible();
    await expect(coach.getByLabel('20:00 left, paused')).toBeVisible();
    await expect(coach.locator('.slot .shirt.open')).toHaveCount(0);
    await expect(coach.getByRole('button', { name: 'Suggest starters' })).toBeVisible();
    await expect(parent.getByRole('heading', { level: 2, name: 'H2' })).toBeVisible({ timeout: 15_000 });
  });

  test('a goal in clock mode is stamped with the half and the minute (D74)', async () => {
    await coach.setViewportSize({ width: 375, height: 760 }); // one-handed (D96)
    await coach.getByRole('button', { name: 'Start clock' }).click();
    await coach.getByRole('button', { name: /Add a goal/ }).click();
    const sheet = coach.getByRole('dialog', { name: 'Goal · vs Lions' });
    await expect(sheet.getByRole('radiogroup', { name: 'Half' })).toHaveCount(0); // the period comes from the clock
    // the stamp ticks inside the sheet; the sheet itself never re-renders with the clock (D95, D96)
    await expect(sheet.getByText(/^H2 · \d+:\d\d$/)).toBeVisible();
    await pickPlayer(sheet, 'Scorer', '#1 Ava');
    const focused = () => coach.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
    expect(await focused()).toBe('#1 Ava');
    await coach.waitForTimeout(3000);
    await expect(sheet).toBeVisible();
    expect(await focused()).toBe('#1 Ava'); // focus never moved on its own
    await pickPlayer(sheet, 'Assist', '#2 Ben');
    await expect(
      sheet.getByRole('radiogroup', { name: 'Assist' }).getByRole('radio', { name: '#1 Ava' }),
    ).toBeDisabled();
    await sheet.getByRole('button', { name: 'Add our goal' }).click();
    await expect(sheet).toBeHidden();
    await coach.goto('/games');
    await coach.getByRole('button', { name: /In progress · vs Lions/ }).click();
    const log = coach.locator('.section', { hasText: 'Goals · 1' }).locator('xpath=following-sibling::*[1]');
    await expect(log.locator('.qtag')).toHaveText(/^H2 1'$/);
    await expect(coach.getByText('Playing time · live')).toBeVisible();
  });

  test('Rotation in clock mode: minutes bars and the on-field dot, parents read-only (D72)', async () => {
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Rotation' }).click();
    await expect(coach.locator('.minrow.onfield')).toHaveCount(7);
    await expect(coach.locator('.minbar').first()).toBeVisible();
    await expect(coach.getByText(/Playing time · vs Lions/)).toBeVisible();
    await parent.goto('/team');
    await parent.getByRole('radio', { name: 'Rotation' }).click();
    await expect(parent.locator('.minrow')).toHaveCount(PLAYERS.length);
    await expect(parent.getByRole('switch')).toHaveCount(0);
    await expect(parent.locator('.minrow').first()).toContainText('Ava'); // own child first
  });

  test('finishing keeps the starters as the template; Stats show minutes (D73, D76)', async () => {
    await coach.goto('/field');
    await expect(coach.locator('.slot .shirt .name')).toHaveCount(7);
    const starters = await coach.locator('.slot .shirt .name').allTextContents();
    await coach.goto('/games');
    await coach.getByRole('button', { name: /In progress · vs Lions/ }).click();
    await coach.getByRole('button', { name: 'Finish game' }).click();
    const confirm = coach.getByRole('dialog', { name: 'Finish game vs Lions?' });
    await expect(confirm).toContainText('starting lineup stays your plan');
    await confirm.getByRole('button', { name: 'Finish game' }).click();
    await expect(confirm).toBeHidden();
    await coach.goto('/field');
    await expect(coach.getByRole('heading', { level: 2, name: 'Starters' })).toBeVisible();
    await expect(coach.locator('.slot .shirt .name')).toHaveCount(7);
    // the same players as the kickoff, in the kickoff shape, not the formation changed mid-game (D108)
    expect((await coach.locator('.slot .shirt .name').allTextContents()).sort()).toEqual(
      [...starters].sort(),
    );
    await expect(coach.getByRole('combobox', { name: 'Formation' })).toHaveValue(kickoffFormation);
    await coach.goto('/stats');
    await coach.getByRole('radio', { name: 'Season' }).click();
    await expect(coach.locator('.stathead .stat', { hasText: 'MIN' })).toBeVisible();
    await expect(coach.locator('.stathead .stat', { hasText: 'QP' })).toHaveCount(0);
    const avaRow = coach.locator('.prow', { has: coach.getByRole('link', { name: /^Ava/ }) });
    await expect(avaRow.getByLabel(/Minutes played: \d+/)).toBeVisible();
  });

  test('corrections after the game: add a stint for the bench player, with the checks (D75)', async () => {
    await coach.goto('/stats');
    await coach.getByRole('radio', { name: 'Season' }).click();
    await coach.getByRole('link', { name: /vs Lions/ }).click();
    await expect(coach.getByText('Playing time', { exact: true })).toBeVisible();
    const row = coach.locator('.group').getByRole('button', { name: new RegExp(`^${benchPlayer}`) });
    await expect(row).toContainText('0 min');
    await row.click();
    const sheet = coach.getByRole('dialog', { name: `${benchPlayer} · playing time` });
    await sheet.getByRole('button', { name: 'Add a stint' }).click();
    const to = sheet.getByLabel('To (m:ss)');
    await to.fill('99:00');
    await sheet.getByRole('button', { name: 'Save stint' }).click();
    await expect(coach.getByRole('status').filter({ hasText: 'inside the period' })).toBeVisible();
    await to.fill('0:01');
    await sheet.getByRole('button', { name: 'Save stint' }).click();
    await expect(coach.getByRole('status').filter({ hasText: 'Stint added' })).toBeVisible();
    await expect(sheet.getByRole('group', { name: /H1 · [A-Z]+ 0:00 to 0:01/ })).toBeVisible();
    await coach.keyboard.press('Escape');
    await expect(row).toContainText('1 shift');
  });

  test('removing a player removes a parent whose only child it was; the confirmation names them (D93)', async () => {
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Roster' }).click();
    await coach.getByRole('button', { name: 'Edit roster' }).click();
    await coach.getByRole('button', { name: 'Remove Ben' }).click();
    const confirm = coach.getByRole('dialog', { name: 'Ben' });
    await expect(confirm).toContainText('Direct Dana loses access to the team');
    await confirm.getByRole('button', { name: 'Remove player' }).click();
    await expect(coach.getByRole('status').filter({ hasText: 'Player removed' })).toBeVisible();
    // Dana is out in the same transaction; Parent Pat (Ava) stays
    await danaPage.reload();
    await expect(danaPage).toHaveURL(/\/welcome$/, { timeout: 20_000 });
    await parent.goto('/home');
    await expect(parent.getByRole('heading', { level: 1, name: 'Ava' })).toBeVisible({ timeout: 20_000 });
  });

  test('a new season: roster review, parents of leavers lose access, clean template, past season read-only, admin switches back (D94)', async () => {
    await coach.goto('/settings');
    await coach.getByRole('link', { name: /Start new season/ }).click();
    await expect(coach.getByRole('heading', { level: 1, name: 'Start new season' })).toBeVisible();
    await coach.getByLabel('Name').fill('Spring next');
    await coach.getByRole('button', { name: /Next/ }).click();
    // Ava is not returning: Parent Pat's only child
    await coach.getByRole('switch', { name: 'Ava returning' }).click();
    await coach.getByRole('button', { name: 'Start Spring next' }).click();
    const confirm = coach.getByRole('dialog', { name: 'Start Spring next?' });
    await expect(confirm).toContainText('1 not returning (Ava)');
    await expect(confirm).toContainText('Parent Pat loses access to the team');
    await confirm.getByRole('button', { name: 'Start Spring next' }).click();
    await expect(coach).toHaveURL(/\/field$/, { timeout: 20_000 });
    // a clean template on the Field, Ava gone from the roster
    await expect(coach.locator('.qcard').first().locator('.slot .shirt.open')).toHaveCount(7);
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Roster' }).click();
    await expect(coach.locator('.group').getByRole('link', { name: /Ava/ })).toHaveCount(0);
    // Stats: the new season is empty; the past season is still there, read-only
    await coach.goto('/stats');
    await coach.getByRole('radio', { name: 'Season' }).click();
    await expect(coach.getByText(/0 games in Spring next/)).toBeVisible();
    await coach.getByLabel('Season', { exact: true }).selectOption({ index: 1 }); // newest first: the past season
    await expect(coach.getByText(/past season, read-only/)).toBeVisible();
    await expect(coach.getByRole('link', { name: /vs Lions/ })).toBeVisible();
    await coach.getByRole('link', { name: /vs Lions/ }).click();
    await expect(coach.getByText('Past season · read-only', { exact: false })).toBeVisible();
    await expect(coach.getByRole('button', { name: /Add goal|Add score/ })).toHaveCount(0);
    // Parent Pat is out; the admin can switch the season back
    await parent.goto('/home');
    await expect(parent).toHaveURL(/\/welcome$/, { timeout: 20_000 });
    await coach.goto('/admin');
    await coach
      .getByRole('link', { name: new RegExp(teamName) })
      .first()
      .click();
    await expect(coach.getByText('Seasons')).toBeVisible();
    await coach.getByRole('button', { name: 'Make current' }).first().click();
    const sheet = coach.getByRole('dialog', { name: /the current season\?/ });
    await sheet.getByRole('button', { name: 'Make current' }).click();
    await expect(coach.getByRole('status').filter({ hasText: 'is current' })).toBeVisible();
    await coach.goto('/stats');
    await expect(coach.getByText(/2 games in \d{4} season/)).toBeVisible();
  });

  test('switching back to periods brings back the four quarter cards, untouched', async () => {
    await coach.goto('/settings/team');
    const saved = teamSaved(coach);
    await coach
      .getByRole('radiogroup', { name: 'Track playing time by' })
      .getByRole('radio', { name: 'Periods' })
      .click();
    await expect(coach.getByRole('status').filter({ hasText: 'Playing time by periods' })).toBeVisible();
    await saved;
    await coach.goto('/field');
    await expect(coach.locator('.qcard')).toHaveCount(4);
    await expect(coach.locator('.benchrow')).toHaveCount(4);
  });

  test('basketball quick scoring: Them at once, Us asks who scored, Team, Undo, the clock nudge, no scrolling at 375px (D108)', async () => {
    await coach.goto('/create-team');
    await coach.getByLabel('Team name').fill(`Hoops ${run}`);
    await coach.getByRole('button', { name: /^Basketball/ }).click();
    await coach.getByRole('button', { name: 'Create team' }).click();
    await expect(coach).toHaveURL(/\/field$/);
    await coach.goto('/team');
    await coach.getByRole('radio', { name: 'Roster' }).click();
    await coach.getByRole('button', { name: 'Edit roster' }).click();
    for (const [i, name] of ['Ada', 'Bea', 'Cam', 'Dev', 'Eve', 'Fin'].entries()) {
      await coach.getByRole('button', { name: 'Add player' }).first().click();
      const sheet = coach.getByRole('dialog', { name: 'Add player' });
      await sheet.getByLabel('First name').fill(name);
      await sheet.getByLabel('Jersey number (optional)').fill(String(i + 1));
      await sheet.getByRole('button', { name: 'Add player' }).click();
      await expect(sheet).toBeHidden();
    }
    await coach.getByRole('button', { name: 'Done' }).click();
    // the score tap with nothing scheduled: a sheet with New game only (D108)
    await coach.setViewportSize({ width: 375, height: 812 });
    await coach.goto('/field');
    await coach.getByRole('button', { name: /Start a game and record points/ }).click();
    const start = coach.getByRole('dialog', { name: 'Start a game' });
    await expect(start.getByRole('button', { name: /^Start vs/ })).toHaveCount(0);
    await start.getByRole('button', { name: 'New game' }).click();
    const form = coach.getByRole('dialog', { name: 'Start a game to record the score' });
    await form.getByLabel('Opponent').fill('Hawks');
    await form.getByRole('button', { name: 'Start game' }).click();
    await expect(form).toBeHidden();
    await expect(coach.locator('.gclock.warn')).toBeVisible();
    await coach.getByRole('button', { name: 'Auto-fill' }).click();
    await expect(coach.locator('.slot .shirt.open')).toHaveCount(0);
    await expect(coach.getByRole('group', { name: 'Quick scoring' })).toBeVisible();
    // the whole page fits: no vertical scrolling at 375 × 812
    const fits = await coach.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      inner: window.innerHeight,
    }));
    expect(fits.scroll, `page scrolls: ${fits.scroll} > ${fits.inner}`).toBeLessThanOrEqual(fits.inner + 1);
    await expect(noHeaderOverlap(coach), 'basketball header overlap').resolves.toEqual([]);
    await test.info().attach('basketball-live-375', {
      body: await coach.screenshot(),
      contentType: 'image/png',
    });
    // Them: one tap. The first score with the clock never run asks once.
    await coach.getByRole('button', { name: 'Them +3, three-pointer' }).click();
    const nudge = coach.getByRole('dialog', { name: 'Start the clock?' });
    await expect(nudge).toBeVisible();
    await nudge.getByRole('button', { name: 'Not now' }).click();
    await expect(coach.getByLabel('Score 0 to 3. Add a score')).toBeVisible();
    await expect(coach.locator('.qslast')).toContainText('Hawks +3');
    // Us: who scored? → a jersey
    await coach.getByRole('button', { name: 'Us +2, field goal' }).click();
    await expect(coach.getByText('Who scored the +2?')).toBeVisible();
    await expect(coach.locator('.slot .shirt.pickable')).toHaveCount(5);
    const first = coach.locator('.slot .shirt').first();
    const scorer = (await first.locator('.name').textContent())?.trim() ?? '';
    await first.click();
    await expect(coach.getByLabel('Score 2 to 3. Add a score')).toBeVisible();
    await expect(coach.locator('.qslast')).toContainText(new RegExp(`${scorer} \\+2`, 'i'));
    await expect(coach.getByRole('dialog', { name: 'Start the clock?' })).toHaveCount(0);
    await expect(coach.locator('.slot .shirt.pickable')).toHaveCount(0);
    // Undo removes the last entry
    await coach.locator('.qslast').getByRole('button', { name: 'Undo' }).click();
    await expect(coach.getByLabel('Score 0 to 3. Add a score')).toBeVisible();
    // Team: points with no scorer (the 400 ms double-tap guard applies to every score tap)
    await coach.waitForTimeout(500);
    await coach.getByRole('button', { name: 'Us +1, free throw' }).click();
    await coach.getByRole('button', { name: 'Team', exact: true }).click();
    await expect(coach.getByLabel('Score 1 to 3. Add a score')).toBeVisible();
    await expect(coach.locator('.qslast')).toContainText('Team +1');
    // Cancel leaves scoring mode; an ordinary jersey tap still selects for a swap
    await coach.getByRole('button', { name: 'Us +3, three-pointer' }).click();
    await coach.getByRole('button', { name: 'Cancel' }).click();
    await expect(coach.locator('.slot .shirt.pickable')).toHaveCount(0);
    await first.click();
    await expect(coach.getByText(new RegExp(`Tap a player to swap with ${scorer}`, 'i'))).toBeVisible();
    await first.click();
    // the amber chip starts the clock
    await coach.locator('.gclock.warn').click();
    await expect(coach.locator('.gclock.run')).toBeVisible();
    await coach.emulateMedia({ colorScheme: 'dark' });
    await expect(noHeaderOverlap(coach), 'basketball header overlap (dark)').resolves.toEqual([]);
    await test.info().attach('basketball-live-375-dark', {
      body: await coach.screenshot(),
      contentType: 'image/png',
    });
    await coach.emulateMedia({ colorScheme: null });
    await coach.setViewportSize({ width: 412, height: 915 });
  });
});

/** Pairs of header chips whose boxes overlap, or chips outside the card: empty when the bar is clean (D108). */
async function noHeaderOverlap(page: Page): Promise<string[]> {
  const sels = ['.qhead h2', '.qhead .openpill', '.qhead .sel', '.qhead .pill', '.gclock', '.qhead .score'];
  const boxes: { sel: string; x: number; y: number; w: number; h: number }[] = [];
  for (const sel of sels) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    const b = await loc.boundingBox();
    if (b && b.width > 0 && b.height > 0) boxes.push({ sel, x: b.x, y: b.y, w: b.width, h: b.height });
  }
  const card = await page.locator('.qcard').first().boundingBox();
  const bad: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    if (!a) continue;
    if (card && a.x + a.w > card.x + card.width + 1) bad.push(`${a.sel} past the card edge`);
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (!b) continue;
      const apart =
        a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
      if (!apart) bad.push(`${a.sel} × ${b.sel}`);
    }
  }
  return bad;
}

/** Pick a player button in the goal sheet (D96); bench players sit behind a toggle. */
async function pickPlayer(sheet: Locator, group: string, name: string) {
  const radio = sheet.getByRole('radiogroup', { name: group }).getByRole('radio', { name });
  if ((await radio.count()) === 0) await sheet.getByRole('button', { name: /Show bench players/ }).click();
  await radio.click();
}

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
