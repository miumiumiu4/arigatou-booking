// テスト版（welcome-test/）の「空きの○×」（予約デスクと連動）を、スマホの大きさで通しで確かめる。
//   NODE_PATH=$(npm root -g) node welcome-test/test/aki-e2e.cjs [--shots DIR]
// 郵便番号の検索（zipcloud）は作りものの答えに差し替える。本番の予約の受け口へは1回も送らない。
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const url = pathToFileURL(path.join(__dirname, '../index.html')).href;
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: shots ? 2 : 1 });
  const page = await ctx.newPage();
  const prod = [], errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/script\.google\.com/, r => {
    if (r.request().url().includes('AKfycbwzgjuZ_')) { prod.push(r.request().url()); return r.abort(); }
    return r.fulfill({ status: 200, body: '{}' });
  });
  await page.route(/zipcloud\.ibsnet\.co\.jp/, r => {
    const cb = new URL(r.request().url()).searchParams.get('callback');
    return r.fulfill({ status: 200, contentType: 'text/javascript', body: cb + '(' + JSON.stringify({ status: 200, results: [{ address1: '神奈川県', address2: '横浜市緑区', address3: '長津田' }] }) + ');' });
  });
  const snap = async (n, full) => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: !!full }); };

  await page.goto(url);
  await page.getByRole('button', { name: 'はい' }).click();
  await page.getByRole('button', { name: 'ご予約フォームへ進む' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'エアコン台数（壁掛け）を増やす' }).click();
  await page.fill('#f_name', 'テスト'); await page.fill('#f_kana', 'てすと');
  await page.fill('#f_phone', '0000000000'); await page.fill('#f_email', 'test@example.com');
  await page.selectOption('#f_area', '神奈川');
  // 郵便番号を入れる前：案内だけ・希望日の欄は出ている
  assert.match(await page.locator('#akiBox').innerText(), /郵便番号/);
  assert.equal(await page.locator('#date1').isVisible(), true);
  await page.fill('#f_zip', '2260027');
  await page.locator('.akitbl').waitFor();
  assert.match(await page.locator('#akiBox').innerText(), /神奈川県横浜市緑区 の空き/);
  assert.equal(await page.locator('#date1').isVisible(), false, '表を使う時は希望日の欄を隠す');
  await page.locator('#akiBox').scrollIntoViewIfNeeded();
  await snap('aki1_table');
  // ○を選ばずに送ると止まる
  await page.fill('#f_address', 'テスト'); await page.check('input[name=housing][value="戸建て"]'); await page.check('input[name=pet][value="なし"]');
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  assert.match(await page.locator('#formMsg').innerText(), /○ を1つ選んで/);
  // ○を押す
  const first = page.locator('.akio').first();
  const d = await first.getAttribute('data-d'), k = await first.getAttribute('data-k');
  await first.click();
  assert.match(await page.locator('.akipicked').innerText(), /選んだ日時/);
  await page.locator('#akiBox').scrollIntoViewIfNeeded();
  await snap('aki2_picked');
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  await page.getByText('ご予約を受け付けました。').waitFor();
  const sent = await page.evaluate(() => window.__lastTestBooking);
  assert.ok(sent.date1.startsWith(d + ' '), sent.date1);
  assert.equal(sent.date2, ''); assert.equal(sent.date3, '');
  assert.match(sent.note, new RegExp('【空きから選択】' + d + ' [①②③]\\S+ 神奈川県横浜市緑区 AK-[A-Z0-9]{8}'));
  assert.match(sent.note, /【希望日】第1 /);
  await snap('aki3_done');

  // 「ほかの日を相談する」で今までの希望日欄に戻る
  await page.goto(url);
  await page.getByRole('button', { name: 'はい' }).click();
  await page.getByRole('button', { name: 'ご予約フォームへ進む' }).click();
  await page.waitForTimeout(600);
  await page.fill('#f_zip', '2260027');
  await page.locator('.akitbl').waitFor();
  await page.getByRole('button', { name: /ほかの日を相談する/ }).click();
  assert.equal(await page.locator('#date1').isVisible(), true);
  assert.equal(await page.locator('#date3').isVisible(), true);
  await page.locator('#akiBox').scrollIntoViewIfNeeded();
  await snap('aki4_manual');

  assert.equal(prod.length, 0, '本番の予約の受け口へは送らない');
  assert.deepEqual(errs, []);
  await browser.close();
  console.log('ok 空きの○×（作りもの）：表・選ぶ・送る中身・ほかの日を相談する');
})().catch(e => { console.error(e); process.exit(1); });
