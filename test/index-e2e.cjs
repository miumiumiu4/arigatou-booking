// 今までの予約ページ（index.html）に足した項目を、スマホの大きさで確かめる。受付への送信は横取りする。
//   NODE_PATH=$(npm root -g) node test/index-e2e.cjs [--shots DIR]
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const url = pathToFileURL(path.join(__dirname, '../index.html')).href;
const shotsAt = process.argv.indexOf('--shots'); const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
  const booked = [], errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.route(/script\.google\.com/, r => { booked.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"R1109-998"}' }); });
  await p.goto(url);
  assert.equal(await p.locator('#e_total').innerText(), '8,900');
  await p.locator('button[data-k=units][data-d="1"]').click();               // 2台 17,800
  await p.locator('button[data-k=tenkase][data-d="1"]').click();             // +23,300
  await p.locator('button[data-k=tenkase][data-d="1"]').click();             // +22,300
  await p.check('input[name=extra][value^="レンジフード"]');                  // +15,000
  await p.check('#nominate'); await p.fill('input[name=nominate_name]', '田中'); // +3,000
  assert.equal(await p.locator('#e_total').innerText(), '81,400');
  const d = new Date(Date.now() + 9 * 3600e3 + 5 * 864e5).toISOString().slice(0, 10);
  for (const [n, v] of [['name', 'テスト'], ['kana', 'てすと'], ['phone', '0000000000'], ['email', 't@example.com'], ['address', 'テスト'], ['model', 'ダイキン'], ['coupon', 'CP2']]) await p.fill(`[name=${n}]`, v);
  await p.selectOption('[name=area]', '東京'); await p.check('input[name=housing][value="戸建て"]');
  for (const n of ['date1', 'date2', 'date3']) await p.fill(`[name=${n}]`, d);
  await p.click('#submit');
  assert.match(await p.locator('#msg').innerText(), /ペットの有無/); assert.equal(booked.length, 0);
  await p.check('input[name=pet][value="あり"]'); await p.fill('input[name=pet_count]', '1');
  if (shots) await p.screenshot({ path: path.join(shots, 'index_form.png'), fullPage: true });
  await p.click('#submit');
  await p.getByText('ご予約を受け付けました').waitFor();
  const x = booked[0];
  assert.equal(x.total, 81400); assert.equal(x.tenkase_units, 2); assert.doesNotMatch(await p.content(), /ナノソル/);
  for (const re of [/【ふりがな】てすと/, /【ペット】あり 1匹/, /【天カセ】2台/, /【メーカー・型番】ダイキン/, /レンジフード/, /【スタッフ指名（＋3,000円）】田中/, /【クーポンコード】CP2/, /^【希望日】/]) assert.match(x.note, re);
  assert.match(x.breakdown, /天井埋め込み（天カセ） 2台=45,600円/);
  assert.deepEqual(errs, []);
  await b.close(); console.log('index e2e ok', x.total);
})().catch(e => { console.error(e); process.exit(1); });
