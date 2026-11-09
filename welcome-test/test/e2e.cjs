// テスト版（welcome-test/）を、スマホの大きさで通しで確かめる。
// 本番の予約の受け口へは1回も送らないこと、計測は hp-chat-test で分かれることを確かめる。
//   NODE_PATH=$(npm root -g) node welcome-test/test/e2e.cjs [--shots DIR]
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const url = pathToFileURL(path.join(__dirname, '../index.html')).href;
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const prod = [], testRecv = [], logged = [], errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/script\.google\.com/, r => {
    const u = r.request().url(), body = JSON.parse(r.request().postData() || '{}');
    if (u.includes('AKfycbwzgjuZ_')) { prod.push(body); return r.abort(); }
    if (body.event) { logged.push(body); return r.fulfill({ status: 200, body: '{}' }); }
    testRecv.push(body);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'T1109-001' }) });
  });
  const snap = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: n.includes('form') || n.includes('done') }); };

  await page.goto(url + '?src=klp');
  await page.getByRole('button', { name: 'はい' }).waitFor();
  assert.match(await page.locator('.testband').innerText(), /テスト用のページです/);
  assert.match(await page.title(), /^【テスト】/);
  assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex,nofollow');
  await snap('t1_greet');
  await page.getByRole('button', { name: 'はい' }).click();
  await page.getByRole('button', { name: 'ご予約フォームへ進む' }).click();
  await page.waitForTimeout(900);
  {
    const hb = await page.locator('header').boundingBox(), fb = await page.locator('#formPanel h2').boundingBox();
    assert.ok(fb.y >= hb.y + hb.height, `見出し ${fb.y} が帯 ${hb.y + hb.height} に隠れている`);
  }
  await page.getByRole('button', { name: 'エアコン台数（壁掛け）を増やす' }).click();
  assert.equal(await page.locator('#hdrTotal').innerText(), '17,800');
  const d = new Date(Date.now() + 9 * 3600e3 + 5 * 864e5).toISOString().slice(0, 10);
  await page.fill('#f_name', 'テスト'); await page.fill('#f_kana', 'てすと');
  await page.fill('#f_phone', '0000000000'); await page.fill('#f_email', 'test@example.com');
  await page.selectOption('#f_area', '東京'); await page.fill('#f_address', 'テスト');
  await page.check('input[name=housing][value="戸建て"]');
  for (const n of ['date1', 'date2', 'date3']) await page.fill('#' + n, d);
  await page.check('input[name=pet][value="なし"]');
  await snap('t2_form');
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  await page.getByText('ご予約を受け付けました。').waitFor();
  const done = await page.locator('#doneMsg').innerText();
  if (cfg.TEST_GAS_URL) {
    assert.match(done, /T1109-001/); assert.equal(testRecv.length, 1);
  } else {
    assert.match(done, /T\d{4}-TEST1/); assert.equal(testRecv.length, 0, '画面だけのときはどこにも送らない');
  }
  assert.match(done, /紹介しませんか/);
  assert.match(done, /送った中身を見る/);
  assert.match(done, /テスト版なので確認メールは届きません/);
  const sent = await page.evaluate(() => window.__lastTestBooking);
  assert.equal(sent.units, 2); assert.equal(sent.total, 17800); assert.match(sent.src, /^welcome-test\?/);
  await page.locator('.testsent summary').click();
  await page.waitForTimeout(600); await snap('t3_done');

  assert.equal(prod.length, 0, '本番の受け口へ送ってはいけない');
  assert.ok(logged.length >= 3 && logged.every(e => e.test === 'hp-chat-test' && e.page === 'welcome-test'), '計測はテスト用の名前で分ける');
  assert.ok(!JSON.stringify(logged).includes('test@example.com'));
  assert.deepEqual(errs, []);
  await browser.close();
  console.log('e2e ok（テスト版・送り先: ' + (cfg.TEST_GAS_URL ? 'テスト用シート' : '画面だけ') + '）:', logged.map(e => e.event).join(' → '));
})().catch(e => { console.error(e); process.exit(1); });
