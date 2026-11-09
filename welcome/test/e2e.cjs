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
  const booked = [], logged = [], errs = [], asked = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/script\.google\.com/, r => {
    const body = JSON.parse(r.request().postData() || '{}');
    if (body.event) { logged.push(body); return r.fulfill({ status: 200, body: '{}' }); }
    if (body.action === 'ask') { asked.push(body); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, kind: 'none' }) }); } // 裏側（faqbot）は台帳外と答えさせる
    booked.push(body);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'R1109-999' }) });
  });
  const snap = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: n.includes('form') }); };

  // 初めての方向けのあいさつ
  await page.goto(url + '?src=klp&utm_source=hp');
  await page.getByRole('button', { name: 'はい' }).waitFor();
  assert.match(await page.locator('#chat').innerText(), /ご覧いただきありがとうございます/);
  assert.doesNotMatch(await page.content(), /テスト用のページです|ご予約フォーム（テスト）|ナノソル/);
  await snap('1_greet');
  await page.getByRole('button', { name: 'はい' }).click();
  await page.getByRole('button', { name: 'ご予約フォームへ進む' }).click();
  await page.waitForTimeout(900);
  { // フォームの見出しが上の帯に隠れていない
    const hb = await page.locator('header').boundingBox(), fb = await page.locator('#formPanel h2').boundingBox();
    assert.ok(fb.y >= hb.y + hb.height, `見出し ${fb.y} が帯 ${hb.y + hb.height} に隠れている`);
  }
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  assert.match(await page.locator('#formMsg').innerText(), /お名前を入力してください/);
  await page.getByRole('button', { name: 'エアコン台数（壁掛け）を増やす' }).click();
  assert.equal(await page.locator('#hdrTotal').innerText(), '17,800');
  const d = new Date(Date.now() + 9 * 3600e3 + 5 * 864e5).toISOString().slice(0, 10);
  await page.fill('#f_name', 'テスト'); await page.fill('#f_kana', 'てすと');
  await page.fill('#f_phone', '0000000000'); await page.fill('#f_email', 'test@example.com');
  await page.selectOption('#f_area', '東京'); await page.fill('#f_address', 'テスト住所');
  await page.check('input[name=housing][value="戸建て"]');
  for (const n of ['date1', 'date2', 'date3']) await page.fill('#' + n, d);
  // ペット未選択なら止まる
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  assert.match(await page.locator('#formMsg').innerText(), /ペットの有無/);
  await page.check('input[name=pet][value="あり"]');
  assert.equal(await page.locator('#petCountRow').isVisible(), true);
  await page.fill('#f_petCount', '2');
  await page.getByRole('button', { name: '天井埋め込み（天カセ・業務用）を増やす' }).click();
  // 天カセ 2台なら 23,300＋22,300（2台目から1,000円引き）
  await page.getByRole('button', { name: '天井埋め込み（天カセ・業務用）を増やす' }).click();
  assert.equal(await page.locator('#hdrTotal').innerText(), '63,400'); // 17,800＋45,600
  await page.getByRole('button', { name: '天井埋め込み（天カセ・業務用）を減らす' }).click();
  await page.check('input[name=extra][value^="お風呂換気扇"]');
  assert.equal(await page.locator('#hdrTotal').innerText(), '48,100'); // 17,800＋23,300＋7,000
  await page.fill('#f_model', 'ダイキン AN22');
  await page.check('#f_nominate'); await page.fill('#f_nominateName', '田中');
  assert.equal(await page.locator('#hdrTotal').innerText(), '51,100');
  await page.fill('#f_coupon', 'CP1');
  await page.fill('#f_receiptName', '株式会社テスト');
  await snap('2_form');
  assert.equal(booked.length, 0);
  await page.getByRole('button', { name: 'この内容で予約する' }).click();
  await page.getByText('ご予約を受け付けました。').waitFor();
  assert.match(await page.locator('#doneMsg').innerText(), /R1109-999/);
  // 紹介リンクは会話の最後へ移った
  assert.doesNotMatch(await page.locator('#doneMsg').innerText(), /紹介しませんか/);
  await page.waitForTimeout(800); await snap('3_done');

  // ---- 送信後の案内係チャット ----
  const tc = page.locator('#thanksPanel');
  const lastIn = () => tc.locator('.tc-log .row.in .bubble').last();
  const waitText = async re => { await page.waitForFunction(r => new RegExp(r).test(document.querySelector('#thanksPanel .tc-log').innerText), re.source, { timeout: 8000 }); };
  await tc.getByRole('button', { name: /ブルやん/ }).waitFor();
  assert.equal(await tc.locator('.tc-card').count(), 4);
  for (const n of ['ブルやん', 'ブルこ', 'ブルさま', 'ブルース']) assert.ok(await tc.getByRole('button', { name: new RegExp(n) }).isVisible());
  assert.match(await tc.innerText(), /AI の案内係ロボが答えています/);
  await snap('4_pick');
  await tc.getByRole('button', { name: /ブルやん/ }).click();
  await tc.getByRole('button', { name: '駐車場' }).waitFor();
  assert.match(await tc.innerText(), /ブルやんです/);
  assert.equal(await tc.locator('.tc-quick .btn').count(), 9);
  // ① ボタン：さっきの予約に合わせて答える（敷地内に駐車可を選んだ）
  await tc.getByRole('button', { name: '駐車場' }).click();
  await tc.getByRole('button', { name: 'はい' }).waitFor();
  const B03 = (await page.evaluate(() => THANKS_DATA.items.find(i => i.id === 'B03').a.buruyan));
  assert.ok((await tc.innerText()).includes(B03[0]));
  assert.match(await tc.innerText(), /敷地内に停められるって書いてくれてたな/);
  await snap('5_answer');
  await tc.getByRole('button', { name: 'はい' }).click();
  await tc.getByRole('button', { name: 'キャンセル' }).waitFor();
  // ② 自由入力（電話番号は伏せてから扱う）。「ペット」は人に回す形 → 連絡先
  await tc.locator('.tc-ask input').fill('090-1234-5678 ペットがいます');
  await tc.getByRole('button', { name: '送る' }).click();
  await waitText(/ペットがおっても大丈夫やで[\s\S]*ペット2匹おるって書いてくれてたな/);
  await tc.getByRole('button', { name: 'いいえ' }).click();
  await tc.getByText('人とお話しする').waitFor();
  assert.match(await tc.innerText(), /「ペットがいても大丈夫ですか？」のことでお答えします/);
  assert.match(await tc.innerText(), /○○ ペットがいます/);
  assert.doesNotMatch(await tc.innerText(), /090-1234/);
  assert.match(await tc.locator('.tc-contact').innerText(), /R1109-999/);
  assert.equal(await tc.locator('.tc-contact a[href="tel:08041772272"]').count(), 1);
  assert.equal(await tc.locator('.tc-contact a[href="https://lin.ee/rD0Xlot"]').count(), 1);
  await snap('6_contact');
  // 料金の質問は、この画面の内訳を読み上げる
  await tc.getByRole('button', { name: 'ほかの質問' }).click();
  await tc.getByRole('button', { name: 'ほかの質問も見る' }).click();
  await tc.getByRole('button', { name: '私の料金はいくらですか？' }).click();
  await waitText(/概算 51,100円/);
  await tc.getByRole('button', { name: 'いいえ' }).waitFor();
  // 解決しない → 人へ
  await tc.getByRole('button', { name: 'いいえ' }).click();
  await tc.getByText('人とお話しする').waitFor();
  // 3点セット：答えのあとに「追加したい」ボタン。台数を書くと受付番号つきの文になる（予約は書き換えない）
  await tc.getByRole('button', { name: 'ほかの質問' }).click();
  await tc.getByRole('button', { name: 'ほかの質問も見る' }).click();
  await tc.getByRole('button', { name: '3点セットは何が入っていますか？' }).click();
  await tc.getByRole('button', { name: '3点セットを追加したい' }).click();
  await tc.locator('.tc-info input').fill('２');
  await tc.getByRole('button', { name: '決める' }).click();
  await waitText(/受付番号 R1109-999 の3点セットの追加：2台/);
  assert.match(await tc.innerText(), /防カビ抗菌コート・室外機クリーニング・ドレンホース洗浄の3つ/);
  // トイレ掃除のプレゼント：きっかけの話をしてから答える（11/10 三浦さん「ここはめちゃ重要」）
  await tc.getByRole('button', { name: 'ほかの質問' }).click();
  await tc.getByRole('button', { name: 'トイレ掃除のプレゼント' }).click();
  await tc.getByRole('button', { name: 'はい' }).waitFor();
  assert.match(await tc.innerText(), /トイレ掃除はな、ちょっと語らせて。[\s\S]*埼玉の主婦[\s\S]*トイレ掃除をプレゼントしています/);
  await tc.getByRole('button', { name: 'はい' }).click();
  // 未確定の問は答えを出さずに人へ（今の台帳には無いので、試しの問を足して確かめる）
  await page.evaluate(() => THANKS_DATA.items.push({ id: 'Z99', q: 'ためしの未確定の問', aliases: ['ためしの未確定'], open: false }));
  await tc.locator('.tc-ask input').fill('ためしの未確定の問です');
  await tc.getByRole('button', { name: '送る' }).click();
  await tc.getByText('人とお話しする').waitFor();
  // 事務マニュアルから足した答え（片づけ）は、人へ回さずに答える
  await tc.getByRole('button', { name: 'ほかの質問' }).click();
  await tc.locator('.tc-ask input').waitFor();
  await tc.locator('.tc-ask input').fill('エアコンの下は片づけた方がいい？');
  await tc.getByRole('button', { name: '送る' }).click();
  await waitText(/畳2畳ほどの作業スペース/);
  await tc.getByRole('button', { name: 'はい' }).click();
  // 台帳にない質問が2回続いたら人へ（裏側も「台帳外」と返したとき）
  await tc.getByRole('button', { name: 'ほかの質問' }).click();
  await tc.locator('.tc-ask input').waitFor();
  await tc.locator('.tc-ask input').fill('おすすめの晩ごはんは');
  await tc.getByRole('button', { name: '送る' }).click();
  await waitText(/ピンと来えへんかった/);
  await tc.locator('.tc-ask input').waitFor();
  await tc.locator('.tc-ask input').fill('好きな色は');
  await tc.getByRole('button', { name: '送る' }).click();
  await waitText(/守備範囲ちゃうわ/);
  await tc.getByText('人とお話しする').waitFor();
  // おしまい：紹介リンクと星
  await tc.getByRole('button', { name: 'おしまい' }).click();
  await tc.getByText('ご家族やお知り合いに紹介しませんか').waitFor();
  assert.match(await tc.locator('.share input').inputValue(), /\?ref=R1109-999$/);
  await tc.locator('.share .link button').click();
  await tc.getByRole('button', { name: '星4つ' }).click();
  await tc.getByText('ありがとうございました。').waitFor();
  await snap('7_bye');

  // 裏側へは台帳外の自由入力だけ。お名前・住所・電話・メール・予約の中身は送らない
  assert.deepEqual(asked.map(x => x.text), /FAQBOT_URL: "https/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')) ? ['おすすめの晩ごはんは', '好きな色は'] : []);
  assert.ok(!JSON.stringify(asked).match(/テスト|田中|株式会社|ダイキン|@/));
  assert.equal(booked.length, 1);
  const b = booked[0];
  assert.equal(b.units, 2); assert.equal(b.tenkase_units, 1); assert.equal(b.total, 51100);
  assert.match(b.breakdown, /天井埋め込み（天カセ） 1台=23,300円/); assert.match(b.breakdown, /お風呂換気扇分解=7,000円/); assert.equal(b.name, 'テスト');
  for (const re of [/【ふりがな】てすと/, /【ペット】あり 2匹/, /【天カセ】1台/, /【メーカー・型番】ダイキン AN22/, /【その他のお掃除】お風呂換気扇分解/, /【スタッフ指名（＋3,000円）】田中/, /【クーポンコード】CP1/, /【領収書の宛名】株式会社テスト/, /^【希望日】第1 /])
    assert.match(b.note, re);
  assert.match(b.src, /^welcome\?/);
  assert.equal(b.receipt_name, undefined); // 宛名は備考の1行だけで送る
  const hp = logged.filter(e => e.test === 'hp-chat'), th = logged.filter(e => e.test === 'thanks-chat');
  const ev = hp.map(e => e.event);
  assert.deepEqual(ev, ['到着', 'はい', 'フォーム遷移', '申込完了']);
  assert.equal(hp.length + th.length, logged.length);
  assert.ok(logged.every(e => e.page === 'welcome'));
  const tev = th.map(e => e.event + (e.note ? ':' + e.note : ''));
  assert.deepEqual(tev.slice(0, 5), ['キャラ表示', 'キャラ選択:buruyan', '質問:ボタン:B03', '解決:はい:B03', '質問:入力:B04:○○ ペットがいます']);
  for (const want of ['質問:ボタン:C01', '解決:いいえ:C01', '人へ:いいえ:C01', '質問:ボタン:C07', '追加したい:3点セット', '質問:ボタン:F02', '人へ:未確定:Z99', '質問:入力:なし:おすすめの晩ごはんは', '人へ:2回わからない', 'おしまい:R1109-999:buruyan', '紹介コピー:R1109-999', '星:R1109-999:4:buruyan'])
    assert.ok(tev.includes(want), want + ' が記録に無い: ' + tev.join(' / '));
  // 個人情報が記録・チャットに出ない
  const all = JSON.stringify(logged);
  for (const pii of ['test@example.com', 'テスト住所', '0000000000', '090-1234', 'てすと']) assert.ok(!all.includes(pii), pii);

  // 紹介リンクで来た方には「またお会いできて」
  await page.goto(url + '?ref=R1109-999');
  await page.getByRole('button', { name: 'はい' }).waitFor();
  assert.match(await page.locator('#chat').innerText(), /またお会いできて嬉しいです/);

  // ?thanks=test：送らずに送信後の画面。毎回キャラ選びから始まり、前に選んだ子に「前回」の印。帯のボタンで選び直せる
  logged.length = 0;
  await page.goto(url + '?thanks=test');
  await page.locator('#thanksPanel .tc-card.last').waitFor();
  assert.equal(await page.locator('#thanksPanel .tc-card').count(), 4);
  assert.match(await page.locator('#thanksPanel .tc-card.last').innerText(), /前回[\s\S]*ブルやん/);
  await page.locator('#thanksPanel').getByRole('button', { name: /ブルやん/ }).click();
  await page.locator('#thanksPanel').getByRole('button', { name: '駐車場' }).waitFor();
  assert.match(await page.locator('#thanksPanel').innerText(), /ブルやんです/);
  assert.equal(booked.length, 1);
  await page.getByRole('button', { name: '案内係を変える' }).click();
  // ブルース：生まれ故郷を選ぶと、その県の言葉で話す。料金などの元文は標準語のまま。県は計測に送らない
  await page.locator('#thanksPanel').getByRole('button', { name: /ブルース/ }).click();
  await page.locator('#thanksPanel').getByRole('button', { name: '秋田' }).click();
  await page.locator('#thanksPanel').getByRole('button', { name: '支払い' }).waitFor();
  assert.match(await page.locator('#thanksPanel').innerText(), /すっかり秋田弁になってしまったんだ/);
  await page.locator('#thanksPanel').getByRole('button', { name: '支払い' }).click();
  await page.locator('#thanksPanel').getByRole('button', { name: 'はい' }).waitFor();
  assert.match(await page.locator('#thanksPanel').innerText(), /ば選んでけでだな。[\s\S]*お支払いは、作業が終わってからです。/);
  assert.ok(!JSON.stringify(logged).includes('秋田'));
  await snap('8_bruce_akita');
  // 領収書：宛名を書き忘れた人には記入欄。宛名は計測に送らず、受付番号つきの文にして確認メールへの返信で送ってもらう
  await page.locator('#thanksPanel').getByRole('button', { name: 'はい' }).click();
  await page.locator('#thanksPanel').getByRole('button', { name: 'ほかの質問も見る' }).click();
  await page.locator('#thanksPanel').getByRole('button', { name: '領収書はもらえますか？' }).click();
  await page.locator('#thanksPanel .tc-info input').waitFor();
  assert.match(await page.locator('#thanksPanel').innerText(), /書き忘れた方は、こちらに書いてください/);
  await page.locator('#thanksPanel .tc-info input').fill('株式会社ブル');
  await page.locator('#thanksPanel').getByRole('button', { name: '決める' }).click();
  await page.locator('#thanksPanel').getByRole('link', { name: 'メールが使えない時は LINE で送る' }).waitFor();
  assert.match(await page.locator('#thanksPanel').innerText(), /受付番号 R0000-0 の領収書の宛名：株式会社ブル/);
  assert.match(await page.locator('#thanksPanel').innerText(), /確認メール.「返信」/);
  assert.ok(!JSON.stringify(logged).includes('株式会社ブル'));
  assert.ok(logged.some(e => e.event === '書き足し' && e.note === '領収書の宛名'));
  assert.ok(logged.length && logged.every(e => e.test === 'thanks-chat-test'));
  assert.ok(logged.some(e => e.event === 'キャラ選択' && e.note === 'bruce'));
  assert.deepEqual(errs, []);
  await browser.close();
  console.log('e2e ok:', ev.join(' → '));
})().catch(e => { console.error(e); process.exit(1); });
