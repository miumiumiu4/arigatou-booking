// ホームページ用の吹き出しページを、スマホの大きさで通しで確かめる。
// 予約の受付（GAS）と計測への送信は横取りして、本番には何も送らない。
//   NODE_PATH=$(npm root -g) node welcome/test/e2e.cjs [--shots DIR]
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const url = pathToFileURL(path.join(__dirname, '../index.html')).href;
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const booked = [], logged = [], errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/script\.google\.com/, r => {
    const body = JSON.parse(r.request().postData() || '{}');
    if (body.event) { logged.push(body); return r.fulfill({ status: 200, body: '{}' }); }
    booked.push(body);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'R1109-999' }) });
  });
  const snap = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: n.includes('form') }); };

  // 初めての方向けのあいさつ
  await page.goto(url + '?src=klp&utm_source=hp');
  await page.getByRole('button', { name: 'はい' }).waitFor();
  assert.match(await page.locator('#chat').innerText(), /ご覧いただきありがとうございます/);
  assert.doesNotMatch(await page.content(), /テスト用のページです|ご予約フォーム（テスト）/);
  await snap('1_greet');
  await page.getByRole('button', { name: 'はい' }).click();
  await page.getByRole('button', { name: 'ご予約フォームへ進む' }).click();
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  assert.match(await page.locator('#formMsg').innerText(), /お名前を入力してください/);
  await page.getByRole('button', { name: 'エアコン台数（壁掛け）を増やす' }).click();
  assert.equal(await page.locator('#hdrTotal').innerText(), '17,800');
  const d = new Date(Date.now() + 9 * 3600e3 + 5 * 864e5).toISOString().slice(0, 10);
  await page.fill('#f_name', 'テスト'); await page.fill('#f_kana', 'てすと');
  await page.fill('#f_phone', '0000000000'); await page.fill('#f_email', 'test@example.com');
  await page.selectOption('#f_area', '東京'); await page.fill('#f_address', 'テスト');
  await page.check('input[name=housing][value="戸建て"]');
  for (const n of ['date1', 'date2', 'date3']) await page.fill('#' + n, d);
  // ペット未選択なら止まる
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  assert.match(await page.locator('#formMsg').innerText(), /ペットの有無/);
  await page.check('input[name=pet][value="あり"]');
  assert.equal(await page.locator('#petCountRow').isVisible(), true);
  await page.fill('#f_petCount', '2');
  await page.getByRole('button', { name: '天井埋め込み（天カセ・業務用）を増やす' }).click();
  await page.getByRole('button', { name: 'ナノソル空間除菌コートを増やす' }).click();
  await page.check('input[name=extra][value^="お風呂換気扇"]');
  assert.equal(await page.locator('#hdrTotal').innerText(), '50,600'); // 17,800＋23,300＋2,500＋7,000
  await page.fill('#f_model', 'ダイキン AN22');
  await page.check('#f_nominate'); await page.fill('#f_nominateName', '田中');
  await page.fill('#f_coupon', 'CP1');
  await snap('2_form');
  assert.equal(booked.length, 0);
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  await page.getByText('ご予約を受け付けました。').waitFor();
  assert.match(await page.locator('#doneMsg').innerText(), /R1109-999/);
  assert.match(await page.locator('#doneMsg').innerText(), /紹介しませんか/);
  await page.waitForTimeout(800); await snap('3_done');

  assert.equal(booked.length, 1);
  const b = booked[0];
  assert.equal(b.units, 2); assert.equal(b.tenkase_units, 1); assert.equal(b.nanosol_units, 1); assert.equal(b.total, 50600);
  assert.match(b.breakdown, /天井埋め込み（天カセ） 1台=23,300円/); assert.match(b.breakdown, /お風呂換気扇分解=7,000円/); assert.equal(b.name, 'テスト');
  for (const re of [/【ふりがな】てすと/, /【ペット】あり 2匹/, /【天カセ】1台/, /【メーカー・型番】ダイキン AN22/, /【その他のお掃除】お風呂換気扇分解/, /【スタッフ指名（＋3,000円）】田中/, /【クーポンコード】CP1/, /^【希望日】第1 /])
    assert.match(b.note, re);
  assert.match(b.src, /^welcome\?/);
  const ev = logged.map(e => e.event);
  assert.deepEqual(ev, ['到着', 'はい', 'フォーム遷移', '申込完了']);
  assert.ok(logged.every(e => e.test === 'hp-chat' && e.page === 'welcome'));
  assert.ok(!JSON.stringify(logged).includes('test@example.com'));

  // 紹介リンクで来た方には「またお会いできて」
  await page.goto(url + '?ref=R1109-999');
  await page.getByRole('button', { name: 'はい' }).waitFor();
  assert.match(await page.locator('#chat').innerText(), /またお会いできて嬉しいです/);
  assert.deepEqual(errs, []);
  await browser.close();
  console.log('e2e ok:', ev.join(' → '));
})().catch(e => { console.error(e); process.exit(1); });
