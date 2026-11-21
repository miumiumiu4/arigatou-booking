// 会話型の予約フォーム（?form=chat）を、テスト版でスマホの大きさで通しで確かめる。
// いつものフォームと同じ中身で送られること・本番の受け口へ送らないことを見る。
//   NODE_PATH=$(npm root -g) node welcome-test/test/chatform-e2e.cjs [--shots DIR]
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const url = pathToFileURL(path.join(__dirname, '../index.html')).href;
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;

(async () => {
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const page = await ctx.newPage(); global.__page = page;
  const prod = [], logged = [], errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/script\.google\.com/, r => {
    const u = r.request().url(), body = JSON.parse(r.request().postData() || '{}');
    if (u.includes('AKfycbwzgjuZ_')) { prod.push(body); return r.abort(); }
    if (body.event) { logged.push(body); return r.fulfill({ status: 200, body: '{}' }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'T1109-001' }) });
  });
  let n = 0;
  const snap = async name => { if (shots) await page.screenshot({ path: path.join(shots, String(++n).padStart(2, '0') + '_' + name + '.png') }); };
  const cf = page.locator('#cf');
  const tap = async label => { await cf.getByRole('button', { name: label, exact: true }).first().click(); };
  const type = async (v) => { await cf.locator('input').first().fill(v); await cf.getByRole('button', { name: '決定' }).click(); };

  await page.goto(url + '?src=klp&form=chat');
  await page.getByRole('button', { name: 'はい' }).click();
  // 会話で聞くのは必ず要る項目だけ（11/22 決定）。台数 → 天カセ → お名前…
  await tap('2台');
  await tap('ない');
  await type('テスト 太郎'); await type('てすと たろう');
  await type('abc'); assert.match(await cf.locator('.cf-err').innerText(), /電話番号/); await snap('phone_err');
  await type('０９０-0000-0000');
  await type('test@example.com');
  await tap('神奈川');
  await type('横浜市テスト1-2-3');
  await tap('戸建て');
  const day = k => new Date(Date.now() + 9 * 3600e3 + k * 864e5).toISOString().slice(0, 10);
  for (const [i, k, t] of [[1, 5, '9時〜12時'], [2, 6, '12時〜15時'], [3, 7, '15時〜18時']]) {
    await cf.locator('input[type=date]').fill(day(k));
    if (i === 1) await snap('date');
    await tap(t);
  }
  await tap('いる'); await tap('2匹');
  // 任意の項目は表でまとめて入れる
  await cf.locator('.cf-extra').waitFor();
  await snap('optional');
  await cf.getByRole('button', { name: 'お掃除機能付きを増やす' }).click();
  await cf.getByRole('button', { name: '3点セットを増やす' }).click();
  assert.equal(await page.locator('#hdrTotal').innerText(), '31,300'); // 8,900×2＋6,000＋7,500
  await cf.getByText('レンジフード（15,000円）').click();
  await cf.getByRole('combobox', { name: 'お支払い方法' }).selectOption('paypay');
  await cf.getByRole('combobox', { name: '当店を何でお知りになりましたか' }).selectOption('Googleで検索');
  await cf.getByRole('textbox', { name: '領収書の宛名（必要な方）' }).fill('テスト株式会社');
  await snap('optional_filled');
  await tap('確認へ進む');
  await cf.locator('.cf-confirm').waitFor();
  await page.waitForTimeout(700);
  { const hb = await page.locator('header').boundingBox(); assert.ok(hb.y >= -1 && hb.y < 60, '上の帯が画面の上に残っている: ' + hb.y); }
  const conf = await cf.locator('.cf-confirm').innerText();
  assert.match(conf, /46,300円/); assert.match(conf, /いる（2匹）/); assert.match(conf, /090-0000-0000/);
  await snap('confirm');
  // 直す：希望日だけ直して確認へ戻る
  await tap('希望日');
  for (const t of ['9時〜12時', '9時〜12時', '9時〜12時']) await tap(t);
  await cf.locator('.cf-confirm').waitFor();
  await tap('この内容で予約する');
  await page.getByText('ご予約を受け付けました。').waitFor();
  await page.waitForTimeout(500); await snap('done');

  const sent = await page.evaluate(() => window.__lastTestBooking);
  assert.equal(sent.name, 'テスト 太郎'); assert.equal(sent.phone, '090-0000-0000'); assert.equal(sent.area, '神奈川');
  assert.equal(sent.units, 2); assert.equal(sent.auto_units, 1); assert.equal(sent.set3_units, 1);
  assert.equal(sent.total, 46300); assert.equal(sent.housing, '戸建て'); assert.equal(sent.pet, 'あり'); assert.equal(sent.pet_count, '2');
  assert.equal(sent.payment, 'paypay');
  assert.equal(sent.date1, day(5) + ' 9時〜12時'); assert.equal(sent.date3, day(7) + ' 9時〜12時');
  assert.match(sent.note, /【領収書の宛名】テスト株式会社/); assert.match(sent.note, /【その他のお掃除】レンジフード/); assert.match(sent.note, /【きっかけ】Googleで検索/);
  assert.match(sent.src, /^welcome-test\?src=klp&?/);
  assert.equal(prod.length, 0, '本番の受け口へ送ってはいけない');
  assert.ok(logged.some(e => e.event === '申込完了' && /^会話フォーム /.test(e.note)));
  assert.ok(!JSON.stringify(logged).includes('test@example.com'), '計測に個人情報を入れない');
  assert.deepEqual(errs, []);

  // ?form=classic と、設定どおり（いまは false）のときは、いつものフォーム
  for (const q of ['?form=classic', '']) {
    await page.goto(url + q);
    await page.getByRole('button', { name: 'はい' }).click();
    await page.getByRole('button', { name: 'ご予約フォームへ進む' }).waitFor();
  }
  // 途中で「フォームでまとめて入力する」に切り替えても、答えがフォームに残る
  await page.goto(url + '?form=chat');
  await page.getByRole('button', { name: 'はい' }).click();
  await tap('3台'); await tap('ない');
  await type('切替 花子');
  await cf.getByRole('button', { name: 'フォームでまとめて入力する' }).click();
  assert.equal(await page.inputValue('#f_name'), '切替 花子');
  assert.equal(await page.locator('#o_units').innerText(), '3');
  assert.ok(await page.locator('#formPanel').isVisible());
  // 任意の表は「とくにない」で飛ばせる（必ず要る項目だけで確認画面まで行ける）
  await page.goto(url + '?form=chat');
  await page.getByRole('button', { name: 'はい' }).click();
  await tap('1台'); await tap('ない');
  await type('最短 次郎'); await type('さいたん じろう'); await type('09000000000'); await type('t@example.com');
  await tap('東京'); await type('テスト区1-1'); await tap('戸建て');
  for (const [k, t] of [[5, '9時〜12時'], [6, '9時〜12時'], [7, '9時〜12時']]) { await cf.locator('input[type=date]').fill(day(k)); await tap(t); }
  await tap('いない');
  await tap('とくにない（そのまま確認へ）');
  await cf.locator('.cf-confirm').waitFor();
  assert.match(await cf.locator('.cf-confirm').innerText(), /8,900円/);
  await browser.close();
  console.log('chatform e2e ok:', logged.filter(e => /会話|申込/.test(e.event)).map(e => e.event).join(' → '));
})().catch(async e => { console.error(e); try { const p = (global.__page); if (p) { console.error('CF:', await p.locator('#cf').innerText()); console.error('CHAT:', (await p.locator('#chat').innerText()).slice(-400)); } } catch (_) {} process.exit(1); });
