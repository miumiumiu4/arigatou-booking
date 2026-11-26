// welcome/index.html（本番）から welcome-test/index.html（テスト版）を作る。
//   node welcome-test/build.mjs          … 作り直す
//   node welcome-test/build.mjs --check  … 作り直した結果と今のファイルが同じか確かめる（違えば終了コード1）
// 本番のページは一切書き換えない。見た目と動きは本番と同じで、変えるのは下の「置き換え」だけ。
// 本番の形が変わって置き換えが当たらなくなったら、ここで止まって知らせる（黙って本番へ送る版を作らない）。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../welcome/index.html'), 'utf8');
const { TEST_GAS_URL, AKI_URL = '' } = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
// 空きの○×（予約デスクと連動）の試し：AKI_URL は C999 などのデスクのウェブアプリ。本番の予約 GAS は入れられない
if (AKI_URL && (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(AKI_URL) || PROD_GAS_RE().test(AKI_URL))) {
  throw new Error('config.json の AKI_URL がおかしい: ' + AKI_URL);
}
function PROD_GAS_RE() { return /https:\/\/script\.google\.com\/macros\/s\/AKfycbwzgjuZ_[A-Za-z0-9_-]+\/exec/; }
const AKI_PART = readFileSync(join(here, 'aki-part.js'), 'utf8').replace('__AKI_URL__', JSON.stringify(AKI_URL)).replace('__AKI_PROD_RE__', PROD_GAS_RE().toString());
const PROD_GAS = /https:\/\/script\.google\.com\/macros\/s\/AKfycbwzgjuZ_[A-Za-z0-9_-]+\/exec/;
if (TEST_GAS_URL && (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(TEST_GAS_URL) || PROD_GAS.test(TEST_GAS_URL))) {
  throw new Error('config.json の TEST_GAS_URL がおかしい（本番の受け口は入れられない）: ' + TEST_GAS_URL);
}

const BAND_CSS = `
  .testband { background: #ffd400; color: #1f2328; font-weight: 700; font-size: 14px; line-height: 1.5; padding: 8px 16px; text-align: center; }
  .testband small { display: block; font-weight: 400; font-size: 12px; }
  .testsent { margin-top: 12px; text-align: left; font-size: 12px; }
  .testsent pre { white-space: pre-wrap; word-break: break-all; background: #f6f8fa; padding: 8px; border-radius: 8px; max-height: 50vh; overflow: auto; }
  /* 空きの○×（予約デスクと連動・テスト版だけ） */
  .bk .akibox { background: #eef7ff; border: 2px solid #4a90d9; border-radius: 12px; padding: 4px 12px 12px; margin-top: 12px; }
  .bk .akihead { font-weight: 800; font-size: 16px; margin: 8px 0 4px; }
  .bk .akidemo { background: #ffd400; border-radius: 8px; padding: 4px 8px; font-size: 12px; font-weight: 700; margin: 4px 0; }
  .bk .akihint, .bk .akinote { font-size: 13px; color: var(--muted); margin: 6px 0; }
  .bk .akitbl { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; border-radius: 8px; overflow: hidden; }
  .bk .akitbl th, .bk .akitbl td { border: 1px solid var(--line); text-align: center; padding: 4px 2px; font-size: 13px; }
  .bk .akitbl thead th { background: #f3f6fa; font-weight: 700; font-size: 12px; line-height: 1.3; }
  .bk .akitbl thead th small { font-weight: 400; color: var(--muted); }
  .bk .akitbl tbody th { font-weight: 700; white-space: nowrap; }
  .bk .akitbl th.sun { color: #e03131; } .bk .akitbl th.sat { color: #1c7ed6; }
  .bk .akio { width: 100%; min-height: 40px; border: 2px solid #e8590c; background: #fff; color: #e8590c; font-weight: 900; font-size: 18px; border-radius: 8px; cursor: pointer; padding: 0; }
  .bk .akio.on { background: #e8590c; color: #fff; font-size: 13px; }
  .bk .akix { color: #adb5bd; background: #f8f9fa; }
  .bk .akipager { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; gap: 8px; }
  .bk .akipager button { border: 1px solid #c5ccd4; background: #fff; border-radius: 8px; padding: 6px 10px; font-size: 13px; }
  .bk .akipager button:disabled { opacity: .35; }
  .bk .akiarrnote { background: #fff4e6; border-left: 4px solid #c2410c; padding: 6px 8px; margin: 6px 0; font-size: 14px; }
  .bk .akiarr { font-weight: 800; color: #c2410c; font-size: 15px; }
  .bk .akitbl thead th .akiarr { font-size: 12px; }
  .bk .akipicked { background: #fdeee2; border-radius: 8px; padding: 8px 10px; margin-top: 8px; font-size: 14px; }
  .bk .akilink { display: block; width: 100%; margin-top: 8px; background: none; border: 1px dashed #4a90d9; color: #1c5fa8; border-radius: 8px; padding: 8px; font-size: 13px; }
`;
const MODE = TEST_GAS_URL ? '送った内容は【テスト】のシートに入ります。本番の予約台帳には入りません。' : '送っても、どこにも保存されません（画面で確かめるだけ）。本番の予約台帳には入りません。';
const BAND = `<div class="testband" role="note">テスト用のページです<small>${MODE}確認メールも届きません。</small></div>\n  `;

const FAKE = `
  // ---------- テスト版だけ：送り先 ----------
  // TEST_GAS_URL が空なら、どこにも送らずに受付番号 T…-TEST を返す（画面だけで確かめる）
  var testSeq = 0;
  function testSend(data) {
    window.__lastTestBooking = data;
    // 空きの○を選んでいれば、先に席取りメモ（aki-part.js）
    return akiBeforeSend(data).then(function () {
      if (CONFIG.GAS_URL) return fetch(CONFIG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
      var d = new Date(), id = 'T' + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-TEST' + (++testSeq);
      // 試験用のデスク（C999）に仮押さえが入った時は、その受付番号（C999-K-…）を出す（11/26 テスト）
      if (aki.lastJobId) { id = aki.lastJobId; aki.lastJobId = ''; }
      return new Promise(function (ok) { setTimeout(function () { ok({ text: function () { return Promise.resolve(JSON.stringify({ ok: true, id: id })); } }); }, 400); });
    });
  }
  function testShowSent() {
    var box = document.createElement('details');
    box.className = 'testsent';
    box.innerHTML = '<summary>【テスト】送った中身を見る</summary><pre></pre>';
    box.querySelector('pre').textContent = JSON.stringify(window.__lastTestBooking, null, 2);
    $('doneMsg').appendChild(box);
  }
`;

// [何を, 何に, 何回当たるはずか]
const R = [
  ['<title>', '<title>【テスト】', 1],
  // 空きの○×（予約デスクと連動）：表の置き場所・入力の確かめ・送る中身・席取りメモ
  ['<div class="dateblk">\n          <label for="date1">', '<div id="akiBox" class="akibox" aria-live="polite"></div>\n        <div class="dateblk">\n          <label for="date1">', 1],
  ["      var el = $(id), v = (el.value || '').trim();", "      if (akiSkip(id)) continue;\n      var el = $(id), v = (el.value || '').trim();", 1],
  ["    if (!document.querySelector('input[name=housing]:checked'))", "    var akiE = akiFormError(); if (akiE) return akiE;\n    if (!document.querySelector('input[name=housing]:checked'))", 1],
  ["  $('f_nominate').addEventListener('change',", "  akiInit();\n  $('f_nominate').addEventListener('change',", 1],
  ["    data.time = '各希望日に記載';", "    akiApply(data);\n    data.time = '各希望日に記載';", 1],
  ["    note = '【希望日】第1 ' + data.date1", "    if (aki.picked && akiUsingTable()) note = akiMark() + '\\n' + note;\n    note = '【希望日】第1 ' + data.date1", 1],
  ['<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex,nofollow">', 1],
  ['</style>', BAND_CSS + '</style>', 1],
  ['<body>\n  <header>', '<body>\n  ' + BAND + '<header>', 1],
  ['<span class="name">ありがとうエアコン</span>', '<span class="name">【テスト】ありがとうエアコン</span>', 1],
  [PROD_GAS, JSON.stringify(TEST_GAS_URL).slice(1, -1), 1],
  ["test: q.get('test') || 'hp-chat', page: 'welcome',", "test: q.get('test') || 'hp-chat-test', page: 'welcome-test',", 1],
  ["src: 'welcome' + (cfg.source", "src: 'welcome-test' + (cfg.source", 1],
  ["fetch(CONFIG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })", 'testSend(data)', 1],
  ["$('waitPanel').hidden = false;", "testShowSent();\n        $('waitPanel').hidden = false;", 1],
  ["  // ---------- 画面 ----------", FAKE + AKI_PART + "\n  // ---------- 画面 ----------", 1],
  // テストの受付番号（T…）でも、本番と同じく紹介リンクの箱を出す
  ['if (/^R\\d{4}-\\d+$/.test(String(j.id)))', 'if (/^[RT]\\d{4}-(TEST)?\\d+$/.test(String(j.id)))', 1],
  ["<br>確認メールをお送りしました。作業日", "<br>（テスト版なので確認メールは届きません）作業日", 1],
  ['送信後すぐに確認メールが届き、', '（テスト版は確認メールが届きません）', 1],
];

let out = src;
for (const [from, to, n] of R) {
  const hits = typeof from === 'string' ? out.split(from).length - 1 : (out.match(new RegExp(from.source, 'g')) || []).length;
  if (hits !== n) throw new Error(`置き換えが ${hits} 回当たった（${n} 回のはず）: ${String(from).slice(0, 80)}`);
  out = typeof from === 'string' ? out.split(from).join(to) : out.replace(from, to);
}
out = '<!-- このファイルは welcome-test/build.mjs が welcome/index.html から作る。直接直さない。 -->\n' + out;
if (PROD_GAS.test(out)) throw new Error('本番の受け口の URL が残っている');

const dest = join(here, 'index.html');
if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = readFileSync(dest, 'utf8'); } catch {}
  if (cur !== out) { console.error('welcome-test/index.html が welcome/index.html と合っていない。node welcome-test/build.mjs で作り直す'); process.exit(1); }
  console.log('OK: welcome-test は welcome と合っている');
} else {
  writeFileSync(dest, out);
  console.log('作った: welcome-test/index.html（送り先: ' + (TEST_GAS_URL || '画面だけ') + '）');
}
