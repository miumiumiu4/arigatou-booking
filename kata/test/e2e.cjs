// 型から作った C999（試験店）の試し用ページを、スマホの大きさで通しで確かめる。
// どこにも送らない（script.google.com への通信があれば失敗）。
//   NODE_PATH=$(npm root -g) node kata/test/e2e.cjs [--shots DIR]
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const url = pathToFileURL(path.join(__dirname, '../../shop/c999/test/index.html')).href;
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;

let page, errs = [];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  page = await ctx.newPage();
  const sent = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/^https?:/, r => { sent.push(r.request().url()); return r.abort(); });
  const snap = async (n, full) => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: !!full }); };

  await page.goto(url);
  await page.getByRole('button', { name: 'はい' }).waitFor();
  const body = await page.locator('body').innerText();
  assert.match(body, /テスト用のページです（C999 試験店）/);
  assert.match(await page.locator('header').innerText(), /【テスト】C999 試験店/);
  assert.doesNotMatch(body, /ありがとうエアコン|080-4177-2272|エイムポイント/);
  assert.match(await page.locator('footer').innerText(), /C999 試験店（エアコンお掃除） ☎ 000-0000-0000/);
  await snap('k1_greet');
  await page.getByRole('button', { name: 'はい' }).click();
  await page.getByRole('button', { name: 'ご予約フォームへ進む' }).click();
  await page.waitForTimeout(900);

  // 料金表：その会社の値。料金表に無い天カセ・おまとめ・指名・クーポン・紹介コードは出さない
  const form = await page.locator('#formPanel').innerText();
  assert.match(form, /9,900円\/台/);
  assert.match(form, /＋5,500円\/台/);
  assert.match(form, /8,000円\/台（別々に頼むより2,000円お得）/);
  assert.doesNotMatch(form, /天カセ|おまとめ|指名|クーポン|紹介コード|お風呂換気扇|5営業日|1〜2日以内/);
  assert.match(form, /レンジフード（16,000円）/);
  assert.equal(await page.locator('#hdrTotal').innerText(), '9,900');
  assert.deepEqual(await page.locator('#f_area option').allInnerTexts(), ['選択してください', '福岡', '熊本', 'その他（備考にご記入ください）']);
  assert.deepEqual(await page.locator('input[name=time1]').evaluateAll(a => a.map(x => x.value)), ['9時〜12時', '13時〜17時', '上記以外で相談したい']);
  assert.deepEqual(await page.locator('#f_payment option').evaluateAll(a => a.map(x => x.value)), ['onsite', 'paypay']);
  await page.getByRole('button', { name: 'エアコン台数（壁掛け）を増やす' }).click();
  await page.getByRole('button', { name: '3点セットを増やす' }).click();
  await page.check('input[name=extra]');
  assert.equal(await page.locator('#hdrTotal').innerText(), '43,800'); // 9,900×2＋8,000＋16,000

  const d = new Date(Date.now() + 9 * 3600e3 + 5 * 864e5).toISOString().slice(0, 10);
  await page.fill('#f_name', 'テスト'); await page.fill('#f_kana', 'てすと');
  await page.fill('#f_phone', '0000000000'); await page.fill('#f_email', 'test@example.com');
  await page.selectOption('#f_area', '福岡'); await page.fill('#f_address', 'テスト住所');
  await page.check('input[name=housing][value="戸建て"]');
  for (const n of ['date1', 'date2', 'date3']) await page.fill('#' + n, d);
  await page.check('input[name=pet][value="なし"]');
  await page.selectOption('#f_payment', 'paypay');
  await snap('k2_form', true);
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  await page.getByText('ご予約を受け付けました。').waitFor();
  assert.match(await page.locator('#doneMsg').innerText(), /T\d{4}-TEST1/);
  const booking = await page.evaluate(() => window.__lastTestBooking);
  assert.equal(booking.total, 43800);
  assert.match(booking.src, /^shop-c999-test/);
  assert.match(booking.breakdown, /エアコンクリーニング 2台=19,800円/);

  // ---- 予約後の案内係チャット ----
  const tc = page.locator('#thanksPanel');
  const waitText = async re => { await page.waitForFunction(r => new RegExp(r).test(document.querySelector('#thanksPanel .tc-log').innerText), re.source, { timeout: 8000 }); };
  await tc.getByRole('button', { name: /ブルこ/ }).waitFor();
  assert.equal(await tc.locator('.tc-card').count(), 4);
  await tc.getByRole('button', { name: /ブルこ/ }).click();
  await tc.getByRole('button', { name: 'キャンセル' }).waitFor();
  // その店の答え（設定の faq）
  await tc.getByRole('button', { name: 'キャンセル' }).click();
  await waitText(/前日まで無料・当日100%/);
  assert.doesNotMatch(await tc.innerText(), /前日50%/);
  await tc.getByRole('button', { name: 'はい' }).click();
  // 支払い：予約で選んだ方法をその店の言い方で
  await tc.getByRole('button', { name: '支払い' }).click();
  await waitText(/「作業当日に PayPay」を選んでいただいてます/);
  assert.doesNotMatch(await tc.innerText(), /PayPal/);
  await tc.getByRole('button', { name: 'はい' }).click();
  // 料金表から作った答え
  await tc.getByRole('button', { name: 'ほかの質問も見る' }).click();
  await tc.getByRole('button', { name: '3点セットは何が入っていますか？' }).click();
  await waitText(/1台8,000円です（別々だと10,000円）/);
  await tc.getByRole('button', { name: 'ほかの質問' }).click();
  // 出典の無い問（駐車場代・保証・天カセ）は答えずに人へ
  for (const q of ['駐車場はどうすればいい？', '保証はありますか？', '天カセもできますか']) {
    await tc.locator('.tc-ask input').waitFor();
    await tc.locator('.tc-ask input').fill(q);
    await tc.getByRole('button', { name: '送る' }).click();
    await tc.getByText('人とお話しする').waitFor();
    const t = await tc.innerText();
    assert.doesNotMatch(t, /コインパーキングの実費|7日|23,300/);
    assert.equal(await tc.locator('.tc-contact a[href="tel:00000000000"]').count(), 1);
    assert.match(await tc.locator('.tc-contact').innerText(), /お電話でも受け付けます/);
    await tc.getByRole('button', { name: 'ほかの質問' }).click();
  }
  await snap('k3_chat');
  // 共通の答え（掃除の一般的な説明）はそのまま
  await tc.locator('.tc-ask input').fill('エアコンの下は片づけた方がいい？');
  await tc.getByRole('button', { name: '送る' }).click();
  await waitText(/畳2畳ほどの作業スペース/);
  await tc.getByRole('button', { name: '合ってた' }).click();
  // おしまい：紹介リンクを出さない会社は「おしまい」だけ
  await tc.locator('.tc-ask input').waitFor();
  assert.equal(await tc.getByRole('button', { name: 'おしまい（特典あり）' }).count(), 0);
  await tc.getByRole('button', { name: 'おしまい', exact: true }).click();
  await tc.getByRole('button', { name: '星4つ' }).waitFor();
  assert.equal(await tc.locator('.share').count(), 0);
  assert.doesNotMatch(await tc.innerText(), /このリンク/);
  await snap('k4_bye');

  // ブルース（県の言葉）でも、その店の答えは店の文のまま
  await page.goto(url + '?thanks=test');
  await tc.getByRole('button', { name: /ブルース/ }).click();
  await tc.getByRole('button', { name: '九州・沖縄' }).click();
  await tc.getByRole('button', { name: '熊本' }).click();
  await tc.getByRole('button', { name: 'キャンセル' }).waitFor();
  await tc.getByRole('button', { name: 'キャンセル' }).click();
  await waitText(/前日まで無料・当日100%/);
  assert.equal(await tc.getByRole('button', { name: /English/ }).count(), 0);
  await snap('k5_bruce');

  assert.deepEqual(sent, [], 'どこかへ送ろうとした: ' + sent.join(' '));
  assert.deepEqual(errs, []);
  await browser.close();
  console.log('OK: C999 の試し用ページ（型から作った物）');
})().catch(async e => { console.error(e); console.error('画面のエラー:', errs); try { console.error(await page.locator('#thanksPanel').innerText()); } catch (_) {} process.exit(1); });
