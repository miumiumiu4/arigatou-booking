// 加盟者・各社用の「型」：会社ごとの設定1枚（kata/companies/<id>.json）から、その会社の
// 吹き出し予約ページ＋予約後の案内係チャットを作る。
//   node kata/build.mjs          … 全社ぶん作り直す
//   node kata/build.mjs c999     … 1社だけ
//   node kata/build.mjs --check  … 作り直した結果と今のファイルが同じか確かめる（違えば終了コード1）
//
// 元は本番の welcome/（ありがとうエアコン）。welcome/ は一切書き換えない。
// 変えるのは「会社ごとに差し替える所」だけ（設計書 3-2 の表）。キャラ4人・会話の流れ・画面の作りは共通。
// 本番の形が変わって置き換えが当たらなくなったら、ここで止まって知らせる（黙ってありがとうエアコンの値が残った版を作らない）。
//
// 作るもの
//   shop/common/thanks.js      … 案内係チャット（welcome/thanks.js に、会社ごとの答えを使う直しを入れたもの。全社共通）
//   shop/<id>/thanks-data.js   … その会社の FAQ（出典のある答えだけ。無い問は「人へつなぐ」になる）
//   shop/<id>/test/index.html  … 試し用ページ（どの会社も必ず作る。本番の帳簿には入らない）
//   shop/<id>/index.html       … 本番ページ（設定で honban: true かつ 予約の届け先 がある会社だけ）
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = p => readFileSync(join(root, p), 'utf8');
const CHECK = process.argv.includes('--check');
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));

// ---------- 共通の元 ----------
const SRC_HTML = read('welcome/index.html');
const SRC_THANKS = read('welcome/thanks.js');
const BASE = (() => { const w = {}; vm.runInNewContext(read('welcome/thanks-data.js'), { window: w }); return w.THANKS_DATA; })();

// ありがとうエアコンだけの値。会社のページに1つでも残っていたら止める
const ARIGATOU_ONLY = [
  /ありがとうエアコン/, /エイムポイント/, /080-?4177-?2272/, /rD0Xlot/, /AKfycbwzgjuZ_/, /AKfycbyJF8nIuQ5/, /AW-10882393108/,
  /arigatou_ref/, /arigatou_from/
];
const NG_WORDS = /お疲れ様|おつかれさま|無理/;

// FAQ のうち「会社ごとに差し替える」問（金額・約束・支払い・保証・その店だけのサービス）。
// 設定の faq に答えが無ければ、その問は出さずに「人へつなぐ」になる（その会社の出典が無い答えは出さない）
const OWN = {
  A01: '何時ごろ来ますか？（到着の時間帯）', A02: '作業は何分くらい？（作業時間の目安）', A03: '作業中、家にいないといけない？（立ち会い）',
  A04: '予約はいつ確定？連絡はどう来る？', A05: '雨の日でも作業する？（天気での日にち変更）', B03: '駐車場はどうすればいい？（駐車場代）',
  C02: '当日に追加料金はある？（例外を必ず一緒に）', C03: 'お掃除機能付きの加算（料金表から自動）', C04: '支払いはいつ、どうやって？',
  C06: '2台目から安くなる？', C07: '3点セットの中身と値段（料金表から自動）', D01: 'キャンセル料', D02: '日にちを変えたいとき',
  D03: '台数やオプションをあとから増やせる？', E01: '保証はある？', E02: '作業のあと、においや水漏れが気になったら？',
  F01: '洗濯機やお風呂も頼める？', F02: 'その店だけのプレゼント・特典（ありがとうエアコンはトイレ掃除）',
  F04: '天カセに対応している？（料金表から自動）', F05: 'スタッフの指名（料金表から自動）'
};
// 料金表から自動で作る問（設定の faq に書けば、そちらが優先）
const AUTO = ['C03', 'C07', 'F04', 'F05'];
// 予約の中身に合わせた答え（thanks.js の MINE）のうち、その会社の数字が要るもの。設定が無ければ使わない
const QUICK_ORDER = ['F02', 'B01', 'A02', 'C04', 'B03', 'D01', 'D02', 'A01', 'B02', 'E03', 'C05', 'F06', 'B05'];
const QUICK_LABEL = Object.fromEntries(BASE.quick);
Object.assign(QUICK_LABEL, { B02: '電源と水道', E03: '掃除の頻度', C05: '領収書', F06: 'このチャットは人？', B05: '小さい子ども' });
const CHARS = ['buruyan', 'buruko', 'burusama'];
const PRICE_KEYS = ['unit', 'auto', 'tenkase', 'set3', 'coat', 'outdoor', 'drain', 'omatome'];

// ---------- 小道具 ----------
const yen = n => Number(n).toLocaleString('ja-JP');
const escH = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsStr = s => JSON.stringify(String(s)).slice(1, -1).replace(/'/g, "\\'");
function fail(id, msg) { throw new Error(`[${id}] ${msg}`); }
// [何を, 何に, 何回当たるはずか]
function swap(id, src, rules, label) {
  let out = src;
  for (const [from, to, n] of rules) {
    const hits = typeof from === 'string' ? out.split(from).length - 1 : (out.match(new RegExp(from.source, from.flags.includes('g') ? from.flags : from.flags + 'g')) || []).length;
    if (hits !== n) fail(id, `${label}: 置き換えが ${hits} 回当たった（${n} 回のはず）: ${String(from).slice(0, 90)}`);
    out = typeof from === 'string' ? out.split(from).join(to) : out.replace(from, to);
  }
  return out;
}

// ---------- 設定を読んで確かめる ----------
function loadCompany(file) {
  const id = file.replace(/\.json$/, '');
  const c = JSON.parse(readFileSync(join(here, 'companies', file), 'utf8'));
  if (!/^c\d{3}$/.test(id)) fail(id, 'ファイル名は会社番号（c001.json など）');
  if (c.id !== id) fail(id, `id が "${c.id}"（ファイル名と同じ "${id}" にする）`);
  for (const k of ['shop_name', 'shop_full', 'company', 'phone', 'price_note']) if (!c[k] || typeof c[k] !== 'string') fail(id, `${k} が無い`);
  if (!/^0\d{1,4}-\d{1,4}-\d{3,4}$/.test(c.phone)) fail(id, `phone の形が違う: ${c.phone}`);
  const url = (k, v) => { if (v && !/^https:\/\/[^\s"'<>]+$/.test(v)) fail(id, `${k} は https:// で始まる URL: ${v}`); };
  url('line_url', c.line_url); url('evlog_url', c.evlog_url); url('logo', c.logo);
  const gas = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
  for (const k of ['booking_url', 'test_booking_url']) if (c[k] && !gas.test(c[k])) fail(id, `${k} は Apps Script の /exec の URL`);
  if (c.booking_url && c.booking_url === c.test_booking_url) fail(id, '本番と試しの届け先が同じ（試しの予約が本番の帳簿に入ってしまう）');
  if (c.mail_to && !/^[^@\s"'<>]+@[^@\s"'<>]+\.[^@\s"'<>]+$/.test(c.mail_to)) fail(id, 'mail_to の形が違う');
  const p = c.prices || {};
  if (!Number.isInteger(p.unit) || p.unit <= 0) fail(id, 'prices.unit（壁掛け1台）が要る');
  for (const k of [...PRICE_KEYS, 'tenkase_2nd_discount', 'nominate']) if (p[k] != null && (!Number.isInteger(p[k]) || p[k] < 0)) fail(id, `prices.${k} は 0 以上の整数か null`);
  if (p.tenkase_2nd_discount && !p.tenkase) fail(id, 'tenkase が無いのに tenkase_2nd_discount がある');
  for (const e of c.extras || []) if (!e.name || !Number.isInteger(e.price) || /[（）"<>]/.test(e.name)) fail(id, `extras の形が違う: ${JSON.stringify(e)}`);
  if (!Array.isArray(c.areas) || !c.areas.length || c.areas.some(a => !a.group || !Array.isArray(a.prefs) || !a.prefs.length)) fail(id, 'areas（対応エリア）が要る');
  if (!Array.isArray(c.time_slots) || !c.time_slots.length) fail(id, 'time_slots が要る');
  if (!Array.isArray(c.payments) || !c.payments.length || c.payments.some(x => !/^[a-z]+$/.test(x.value || '') || !x.label || !x.say)) fail(id, 'payments は [{value, label, say}]');
  for (const [k, v] of Object.entries(c.faq || {})) {
    if (!OWN[k]) fail(id, `faq.${k} は会社ごとに差し替える問ではない（差し替えられるのは ${Object.keys(OWN).join(' ')}）`);
    if (typeof v !== 'string' || !v.trim()) fail(id, `faq.${k} が空`);
    if (!(c.faq_source || {})[k]) fail(id, `faq.${k} の出典（faq_source.${k}）が無い。出典の無い答えは出さない`);
  }
  if (c.faq && c.faq.C02 && /いただきません|かかりません|なし/.test(c.faq.C02) && !/例外|除く|別/.test(c.faq.C02)) fail(id, 'faq.C02：「追加料金なし」は例外と一緒に書く');
  if (NG_WORDS.test(JSON.stringify(c))) fail(id, '使わない言葉（お疲れ様・無理）が入っている');
  return c;
}

// ---------- FAQ（thanks-data.js） ----------
function companyData(c) {
  const p = c.prices, faq = { ...(c.faq || {}) };
  // 料金表から作る答え（その会社の料金表が出典）
  const auto = {};
  if (p.auto) auto.C03 = `お掃除機能付きは1台につき${yen(p.auto)}円の加算です。`;
  if (p.set3) {
    const sep = (p.coat || 0) + (p.outdoor || 0) + (p.drain || 0);
    auto.C07 = `3点セットは、防カビ抗菌コート・室外機クリーニング・ドレンホース洗浄の3つで1台${yen(p.set3)}円です` + (p.coat && p.outdoor && p.drain && sep > p.set3 ? `（別々だと${yen(sep)}円）。` : '。')
      + (p.omatome ? `おまとめセットは、室外機＋防カビ・抗菌コートで1台${yen(p.omatome)}円です。` : '');
  }
  if (p.tenkase) {
    const d = p.tenkase_2nd_discount || 0;
    auto.F04 = `はい、対応しています。天井埋め込み（天カセ）は${d ? `1台目${yen(p.tenkase)}円、2台目から${yen(p.tenkase - d)}円/台` : `1台${yen(p.tenkase)}円`}です。` + (c.tenkase_note ? c.tenkase_note : '');
  }
  if (p.nominate) auto.F05 = `はい、できます。スタッフの指名は＋${yen(p.nominate)}円です。予約フォームの「スタッフの指名を希望する」にチェックして、お名前を書いてください。`;
  for (const k of AUTO) if (!faq[k] && auto[k]) faq[k] = auto[k];

  const items = BASE.items.map(it => {
    const o = JSON.parse(JSON.stringify(it));
    if (!OWN[it.id]) return o; // 掃除の一般的な説明・人へ渡す決まりなどは全社共通
    if (!faq[it.id]) return { id: it.id, cat: it.cat, q: it.q, aliases: it.aliases, open: false };
    o.open = true; o.human = false;
    // 一言目（案内係の受け答え）は共通、中身はその会社の答え
    for (const ch of CHARS) o.a[ch] = [it.a[ch][0], faq[it.id]];
    return o;
  });
  const open = new Set(items.filter(i => i.open).map(i => i.id));
  const quick = QUICK_ORDER.filter(q => open.has(q)).slice(0, 8).map(q => [q, QUICK_LABEL[q] || items.find(i => i.id === q).q]);

  // 予約の中身に合わせた答えで使う、その会社の言い方・数字
  const t = {};
  if (!c.referral) t.ui_bye = 'おしまい';
  t.ui_line_note = c.line_url ? `LINE 公式「${c.line_name || c.shop_name}」のトークでも受け付けます。` : 'お電話でも受け付けます。';
  if (auto.F04 || faq.F04) t.F04_note = faq.F04.replace(/^はい、対応しています。/, '');
  if (faq.F05) t.F05_note = p.nominate ? `スタッフの指名は＋${yen(p.nominate)}円です。` : faq.F05;
  if (faq.C07) t.C07_note = faq.C07;
  const m = c.mine || {};
  if (m.pay_after) t.C04_after = m.pay_after;
  if (m.parking_in) t.B03_in_note = m.parking_in;
  if (m.parking_coin) t.B03_coin_note = m.parking_coin;
  const mineOff = ['A02']; // 作業時間の計算はありがとうエアコンの目安なので、各社では使わない
  if (!m.arrive) mineOff.push('A01');
  if (!(m.parking_in && m.parking_coin)) mineOff.push('B03');
  if (!m.pay_after) mineOff.push('C04');
  for (const k of ['C07', 'F04', 'F05']) if (!t[k + '_note']) mineOff.push(k);
  const pay = Object.fromEntries(c.payments.map(x => [x.value, x.say]));

  return {
    version: BASE.version + ' ／ ' + c.id + ' の設定',
    chars: BASE.chars, quick, items, small: BASE.small,
    dialects: BASE.dialects.filter(d => !d.lang), // 外国の言葉の束は答えを丸ごと訳した物で、ありがとうエアコンの数字が入っているので使わない
    ownIds: Object.keys(OWN), mineOff, noShare: !c.referral, t, pay, arrive: m.arrive || null
  };
}

// ---------- 予約ページ ----------
function row(k, title, sub) {
  return `        <div class="row-item"><div class="t"><b>${escH(title)}</b><span>${escH(sub)}</span></div>\n`
    + `          <div class="ctr"><button type="button" data-k="${k}" data-d="-1" aria-label="${escH(title)}を減らす">−</button><output id="o_${k}">${k === 'units' ? 1 : 0}</output><button type="button" data-k="${k}" data-d="1" aria-label="${escH(title)}を増やす">＋</button></div></div>\n`;
}
function priceRows(c) {
  const p = c.prices;
  let h = row('units', 'エアコン台数（壁掛け）', `${yen(p.unit)}円/台`);
  if (p.auto) h += row('auto', 'うち、お掃除機能付き', `＋${yen(p.auto)}円/台`);
  if (p.tenkase) {
    const d = p.tenkase_2nd_discount || 0;
    h += row('tenkase', '天井埋め込み（天カセ・業務用）', (d ? `1台目 ${yen(p.tenkase)}円・2台目から ${yen(p.tenkase - d)}円/台` : `${yen(p.tenkase)}円/台`) + (c.tenkase_note ? '｜' + c.tenkase_note : ''));
  }
  const opts = [];
  if (p.set3) {
    const sep = (p.coat || 0) + (p.outdoor || 0) + (p.drain || 0);
    opts.push(['set3', '3点セット', `防カビ抗菌コート＋室外機＋ドレンホース｜${yen(p.set3)}円/台` + (p.coat && p.outdoor && p.drain && sep > p.set3 ? `（別々に頼むより${yen(sep - p.set3)}円お得）` : '')]);
  }
  if (p.coat) opts.push(['coat', '防カビ・抗菌コート', `${yen(p.coat)}円/台`]);
  if (p.outdoor) opts.push(['outdoor', '室外機クリーニング', `${yen(p.outdoor)}円/台`]);
  if (p.drain) opts.push(['drain', 'ドレンホース洗浄', `${yen(p.drain)}円/台`]);
  if (p.omatome) opts.push(['omatome', 'おまとめセット', `室外機＋防カビ・抗菌コート｜${yen(p.omatome)}円/台`]);
  if (opts.length) {
    h += '        <p style="font-weight:700;margin:14px 0 2px">オプション（台数分お選びください）</p>\n';
    opts.forEach(([k, t, s], i) => { let r = row(k, t, s); if (i === opts.length - 1) r = r.replace('<div class="row-item">', '<div class="row-item" style="border-bottom:0">'); h += r; });
  }
  return h;
}
function radios(c, n) {
  return `<div class="radios">${c.time_slots.map((s, i) => `<label><input type="radio" name="time${n}" value="${escH(s)}"${i ? '' : ' checked'}>${escH(s)}</label>`).join('')}<label><input type="radio" name="time${n}" value="上記以外で相談したい">上記以外で相談したい</label></div>`;
}

function companyHtml(c) {
  const id = c.id, p = c.prices;
  const ex = c.extras || [];
  const firstSlot = c.time_slots[0];
  const testState = { units: 2 };
  if (p.set3) testState.set3 = 1;
  if (p.tenkase) testState.tenkase = 1;
  const testLines = [`{ name: 'エアコンクリーニング 2台', amount: 2 * NORMAL.unit }`];
  if (p.set3) testLines.push(`{ name: '3点セット（防カビ抗菌コート・室外機・ドレンホース） 1台', amount: NORMAL.set3 }`);
  if (p.tenkase) testLines.push(`{ name: '天井埋め込み（天カセ） 1台', amount: NORMAL.tenkase }`);
  const NORMAL = Object.fromEntries(PRICE_KEYS.map(k => [k, p[k] || 0]));
  const footer = `  <footer>${escH(c.shop_full)} ☎ <a href="tel:${c.phone.replace(/-/g, '')}">${escH(c.phone)}</a><br>© ${escH(c.company)}</footer>`;
  const hide = (cond, s) => cond ? s : s.replace(/^<label/, '<label hidden').replace(/^<input/, '<input hidden');

  const R = [
    // 見出し・会社名
    ['<title>エアコンクリーニングのご予約｜ありがとうエアコンお掃除専門店</title>', `<title>エアコンクリーニングのご予約｜${escH(c.shop_full)}</title>`, 1],
    ['<meta name="description" content="ありがとうエアコンお掃除専門店のご予約ページ。', `<meta name="description" content="${escH(c.shop_full)}のご予約ページ。`, 1],
    ['<span class="name">ありがとうエアコン</span>', (c.logo ? `<span class="name"><img class="logo" src="${escH(c.logo)}" alt="">${escH(c.shop_name)}</span>` : `<span class="name">${escH(c.shop_name)}</span>`), 1],
    ['</style>', '  header .name .logo { height: 26px; width: auto; vertical-align: middle; margin-right: 6px; }\n</style>', 1],
    [/  <footer>ありがとうエアコンお掃除専門店[^\n]*<\/footer>/, footer, 1],
    // 料金表
    [/        <div class="row-item"><div class="t"><b>エアコン台数（壁掛け）<\/b>[\s\S]*?(?=        <div class="est">)/, priceRows(c), 1],
    [`var NORMAL = { unit: 8900, auto: 6000, set3: 7500, coat: 3000, outdoor: 4000, drain: 2500, tenkase: 23300, omatome: 5000 };`, `var NORMAL = ${JSON.stringify(NORMAL).replace(/,/g, ', ').replace(/:/g, ': ').replace('{', '{ ').replace(/}$/, ' }')};`, 1],
    ['function tenkaseDiscount() { return Math.max(0, st.tenkase - 1) * 1000; }', `function tenkaseDiscount() { return Math.max(0, st.tenkase - 1) * ${p.tenkase_2nd_discount || 0}; }`, 1],
    [`items: [{ name: '天カセ2台目からの割引', qty: st.tenkase - 1, unit: -1000 }]`, `items: [{ name: '天カセ2台目からの割引', qty: st.tenkase - 1, unit: -${p.tenkase_2nd_discount || 0} }]`, 1],
    // 料金表に無い行は画面に出さないので、数を書く所が無くても止まらないように
    [`Object.keys(st).forEach(function (k) { $('o_' + k).textContent = st[k]; });`, `Object.keys(st).forEach(function (k) { var o = $('o_' + k); if (o) o.textContent = st[k]; });`, 1],
    ['（税込・駐車場代別）', `（${escH(c.price_note)}）`, 3],
    // エリア・時間帯・支払い・その他のお掃除・指名
    [/<select id="f_area" name="area">[\s\S]*?<\/select>/, `<select id="f_area" name="area">\n              <option value="">選択してください</option>\n${c.areas.map(a => `              <optgroup label="${escH(a.group)}">${a.prefs.map(x => `<option>${escH(x)}</option>`).join('')}</optgroup>`).join('\n')}\n              <optgroup label="その他"><option>その他（備考にご記入ください）</option></optgroup>\n            </select>`, 1],
    [/<div class="radios"><label><input type="radio" name="time1" value="9時〜12時" checked>[^\n]*?<\/div>/, radios(c, 1), 1],
    [/<div class="radios"><label><input type="radio" name="time2" value="9時〜12時" checked>[^\n]*?<\/div>/, radios(c, 2), 1],
    [/<div class="radios"><label><input type="radio" name="time3" value="9時〜12時" checked>[^\n]*?<\/div>/, radios(c, 3), 1],
    [/<select id="f_payment" name="payment">[\s\S]*?<\/select>/, `<select id="f_payment" name="payment">\n${c.payments.map(x => `          <option value="${x.value}">${escH(x.label)}</option>`).join('\n')}\n        </select>`, 1],
    [`var PAYL = { onsite: '作業当日に現金', paypay: '作業当日に PayPay', paypal: 'PayPal の請求書' };`, `var PAYL = ${JSON.stringify(Object.fromEntries(c.payments.map(x => [x.value, x.say])))};`, 1],
    ['<label for="f_parking">駐車場 <small>駐車場代は別途実費</small></label>', `<label for="f_parking">駐車場${c.parking_note ? ` <small>${escH(c.parking_note)}</small>` : ''}</label>`, 1],
    [/        <label>その他のお掃除 <small>任意<\/small><\/label>\n        <div class="chks">\n(?:          <label><input type="checkbox" name="extra"[^\n]*\n)+        <\/div>\n        <p class="note">※選ぶと上の概算金額に入ります。<\/p>\n/,
      ex.length ? `        <label>その他のお掃除 <small>任意</small></label>\n        <div class="chks">\n${ex.map(e => `          <label><input type="checkbox" name="extra" value="${escH(e.name)}（${yen(e.price)}円）" data-price="${e.price}">${escH(e.name)}（${yen(e.price)}円）</label>\n`).join('')}        </div>\n        <p class="note">※選ぶと上の概算金額に入ります。</p>\n` : '', 1],
    [/<label><input type="checkbox" id="f_nominate"([^>]*)>スタッフの指名を希望する（＋3,000円）<\/label>/, p.nominate ? `<label><input type="checkbox" id="f_nominate"$1>スタッフの指名を希望する（＋${yen(p.nominate)}円）</label>` : '<label hidden><input type="checkbox" id="f_nominate"$1>スタッフの指名を希望する</label>', 1],
    [`if ($('f_nominate').checked) t += 3000;`, `if ($('f_nominate').checked) t += ${p.nominate || 0};`, 1],
    [`add.push('【スタッフ指名（＋3,000円）】'`, `add.push('【スタッフ指名（＋${yen(p.nominate || 0)}円）】'`, 1],
    [`lines.push({ name: 'スタッフ指名', amount: 3000, items: [{ name: 'スタッフ指名', qty: 1, unit: 3000 }] });`, `lines.push({ name: 'スタッフ指名', amount: ${p.nominate || 0}, items: [{ name: 'スタッフ指名', qty: 1, unit: ${p.nominate || 0} }] });`, 1],
    // クーポン・紹介コード
    ['<label for="f_coupon">クーポンコード <small>任意</small></label>\n        <input id="f_coupon" name="coupon" autocomplete="off">',
      c.coupon ? '<label for="f_coupon">クーポンコード <small>任意</small></label>\n        <input id="f_coupon" name="coupon" autocomplete="off">' : '<input id="f_coupon" name="coupon" autocomplete="off" hidden>', 1],
    ['<label for="ref_code">紹介コード <small>任意・ご家族やお知り合いから紹介された方</small></label>\n        <input id="ref_code" name="ref_code" placeholder="例：R0929-311" autocomplete="off">',
      c.referral ? '<label for="ref_code">紹介コード <small>任意・ご家族やお知り合いから紹介された方</small></label>\n        <input id="ref_code" name="ref_code" placeholder="例：R1109-311" autocomplete="off">' : '<input id="ref_code" name="ref_code" autocomplete="off" hidden>', 1],
    ['このリンクから予約した方の作業とお支払いが終わると、あなたに紹介料として通常価格の20%をお支払いします。', escH(c.referral ? c.referral.reward_text : ''), 1],
    ['  function showShare(id, into) {\n', c.referral ? '  function showShare(id, into) {\n' : '  function showShare(id, into) {\n    return; // この会社は紹介リンクを出さない（設定 referral が空）\n', 1],
    // 約束の文（その会社の決まり）
    ['<p class="note">※ご希望日での対応が難しい場合は、1〜2日以内に日程再調整のご連絡をいたします。</p>', c.texts && c.texts.reschedule ? `<p class="note">${escH(c.texts.reschedule)}</p>` : '', 1],
    [/<p class="note">送信後、確認メールをお送りします。作業日はご予約から5営業日以内に[^<]*<\/p>/, `<p class="note">${escH((c.texts && c.texts.after_submit) || '送信後、確認メールをお送りします。作業日は担当者よりご連絡のうえ確定します。')}</p>`, 1],
    // 送り先・連絡先
    [/    GAS_URL: "https:\/\/script\.google\.com\/macros\/s\/AKfycbwzgjuZ_[A-Za-z0-9_-]+\/exec",/, `    GAS_URL: ${JSON.stringify(c.booking_url || '')},`, 1],
    [/    EVLOG_URL: "https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec",/, `    EVLOG_URL: ${JSON.stringify(c.evlog_url || '')},`, 1],
    ['    // LINE 公式「ありがとうエアコンサポート」の友だち追加・トークのリンク。空なら文で案内する', '    // その会社の LINE 公式の友だち追加・トークのリンク。空なら文で案内する', 1],
    ['    LINE_URL: "https://lin.ee/rD0Xlot",', `    LINE_URL: ${JSON.stringify(c.line_url || '')},`, 1],
    ['    PHONE: "080-4177-2272",', `    PHONE: ${JSON.stringify(c.phone)},`, 1],
    [`    MAIL_TO: ""`, `    MAIL_TO: ${JSON.stringify(c.mail_to || '')}`, 1],
    ['☎080-4177-2272 までご連絡ください。', `☎${c.phone} までご連絡ください。`, 1],
    // 計測の名前（page が welcome でないので、ありがとうエアコンの Google 広告タグは読み込まれない）
    ["test: q.get('test') || 'hp-chat', page: 'welcome',", `test: q.get('test') || 'shop-chat', page: 'shop-${id}',`, 1],
    ["src: 'welcome' + (cfg.source", `src: 'shop-${id}' + (cfg.source`, 1],
    [/var AW = \{ ID: 'AW-10882393108', LABEL_BOOK: '[A-Za-z0-9_-]+' \};/, "var AW = { ID: '', LABEL_BOOK: '' }; // 各社のページでは、本部の広告の計測タグは使わない", 1],
    // この端末に覚えておく置き場所は会社ごとに分ける（同じ github.io の別の会社の紹介コードが混ざらないように）
    ["var KEY = 'arigatou_from',", `var KEY = '${id}_from',`, 1],
    ["var KEY = 'arigatou_ref',", `var KEY = '${id}_ref',`, 1],
    ['（同じ置き場所 arigatou_ref を使うので、', `（置き場所は会社ごとに ${id}_ref。`, 1],
    ["var SAVED = 'thanks_saved',", `var SAVED = '${id}_thanks_saved',`, 1],
    // 試し（?thanks=test）の中身はその会社の料金で
    ['st = Object.assign({}, ZERO, { units: 2, set3: 1, tenkase: 1 });', `st = Object.assign({}, ZERO, ${JSON.stringify(testState).replace(/:/g, ': ').replace(/,/g, ', ').replace('{', '{ ').replace(/}$/, ' }')});`, 1],
    [`    $('f_nominate').checked = true;\n    $('doneMsg').innerHTML = '受付番号 <b>R0000-0</b>（試し）`, `    $('f_nominate').checked = ${p.nominate ? 'true' : 'false'};\n    $('doneMsg').innerHTML = '受付番号 <b>R0000-0</b>（試し）`, 1],
    [`startThanks('R0000-0', [{ name: 'エアコンクリーニング 2台', amount: 17800 }, { name: '3点セット（防カビ抗菌コート・室外機・ドレンホース） 1台', amount: 7500 }],`, `startThanks('R0000-0', [${testLines.join(', ')}],`, 1],
    [`time1: '9時〜12時', area: '大阪',`, `time1: '${jsStr(firstSlot)}', area: '${jsStr(c.areas[0].prefs[0])}',`, 1],
    [`payment: 'onsite', parking:`, `payment: '${c.payments[0].value}', parking:`, 1],
    // 部品はこの会社のもの（チャットの中身）と全社共通のもの（チャットの動き）
    ['<script src="../welcome/thanks-data.js"></script>\n<script src="../welcome/thanks.js"></script>', '<script src="thanks-data.js"></script>\n<script src="../common/thanks.js"></script>', 1],
    ['<!-- welcome-test/ からも同じ部品を読むので ../welcome/ から -->', `<!-- ${id} の FAQ と、全社共通のチャットの動き -->`, 1]
  ];
  let out = swap(id, SRC_HTML, R, '予約ページ');
  out = `<!-- このファイルは kata/build.mjs が kata/companies/${id}.json と welcome/index.html から作る。直接直さない。 -->\n` + out;
  return out;
}

// 試し用ページ：welcome-test/build.mjs と同じ考え方（黄色い帯・noindex・本番の帳簿に入れない）
function testHtml(c, html) {
  const id = c.id;
  const MODE = c.test_booking_url ? '送った内容は【テスト】のシートに入ります。本番の予約台帳には入りません。' : '送っても、どこにも保存されません（画面で確かめるだけ）。本番の予約台帳には入りません。';
  const BAND_CSS = `
  .testband { background: #ffd400; color: #1f2328; font-weight: 700; font-size: 14px; line-height: 1.5; padding: 8px 16px; text-align: center; }
  .testband small { display: block; font-weight: 400; font-size: 12px; }
  .testsent { margin-top: 12px; text-align: left; font-size: 12px; }
  .testsent pre { white-space: pre-wrap; word-break: break-all; background: #f6f8fa; padding: 8px; border-radius: 8px; max-height: 50vh; overflow: auto; }
`;
  const FAKE = `
  // ---------- 試し用ページだけ：送り先 ----------
  // test_booking_url が空なら、どこにも送らずに受付番号 T…-TEST を返す（画面だけで確かめる）
  var testSeq = 0;
  function testSend(data) {
    window.__lastTestBooking = data;
    if (CONFIG.GAS_URL) return fetch(CONFIG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
    var d = new Date(), id = 'T' + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-TEST' + (++testSeq);
    return new Promise(function (ok) { setTimeout(function () { ok({ text: function () { return Promise.resolve(JSON.stringify({ ok: true, id: id })); } }); }, 400); });
  }
  function testShowSent() {
    var box = document.createElement('details');
    box.className = 'testsent';
    box.innerHTML = '<summary>【テスト】送った中身を見る</summary><pre></pre>';
    box.querySelector('pre').textContent = JSON.stringify(window.__lastTestBooking, null, 2);
    $('doneMsg').appendChild(box);
  }
`;
  const R = [
    [/<!-- このファイルは kata\/build\.mjs が [^\n]*\n/, `<!-- このファイルは kata/build.mjs が kata/companies/${id}.json と welcome/index.html から作る（試し用）。直接直さない。 -->\n`, 1],
    ['<title>', '<title>【テスト】', 1],
    ['<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex,nofollow">', 1],
    ['</style>', BAND_CSS + '</style>', 1],
    ['<body>\n  <header>', `<body>\n  <div class="testband" role="note">テスト用のページです（${escH(c.shop_name)}）<small>${MODE}確認メールも届きません。</small></div>\n  <header>`, 1],
    ['<span class="name">', '<span class="name">【テスト】', 1],
    [`    GAS_URL: ${JSON.stringify(c.booking_url || '')},`, `    GAS_URL: ${JSON.stringify(c.test_booking_url || '')},`, 1],
    [`page: 'shop-${id}',`, `page: 'shop-${id}-test',`, 1],
    [`test: q.get('test') || 'shop-chat',`, `test: q.get('test') || 'shop-chat-test',`, 1],
    [`src: 'shop-${id}' + (cfg.source`, `src: 'shop-${id}-test' + (cfg.source`, 1],
    ["fetch(CONFIG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })", 'testSend(data)', 1],
    ["$('waitPanel').hidden = false;", "testShowSent();\n        $('waitPanel').hidden = false;", 1],
    ['  // ---------- 画面 ----------', FAKE + '\n  // ---------- 画面 ----------', 1],
    ['if (/^R\\d{4}-\\d+$/.test(String(j.id)))', 'if (/^[RT]\\d{4}-(TEST)?\\d+$/.test(String(j.id)))', 1],
    ['<br>確認メールをお送りしました。作業日', '<br>（テスト版なので確認メールは届きません）作業日', 1],
    ['送信後すぐに確認メールが届き、', '（テスト版は確認メールが届きません）', 1],
    ['<script src="thanks-data.js"></script>\n<script src="../common/thanks.js"></script>', '<script src="../thanks-data.js"></script>\n<script src="../../common/thanks.js"></script>', 1]
  ];
  return swap(id, html, R, '試し用ページ');
}

// ---------- 全社共通のチャットの動き（welcome/thanks.js に直しを入れたもの） ----------
function commonThanks() {
  const R = [
    [/^\/\/ 予約を送ったあとの/, '// このファイルは kata/build.mjs が welcome/thanks.js から作る（各社用）。直接直さない。\n// 予約を送ったあとの', 1],
    // 絵と県の言葉は welcome/ のものを使う（shop/common/ → ../../welcome/）
    [`var HERE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');`, `var HERE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '') + '../../welcome/';`, 1],
    // 画面の文：その会社の言い方（D.t）があればそれ
    ['var t = LG() && S.dl.t && S.dl.t[key];', 'var t = (LG() && S.dl.t && S.dl.t[key]) || (D.t && D.t[key]);', 1],
    // 県の言葉の束は、会社ごとに差し替える問には使わない（束の台詞にありがとうエアコンの決まりが入りうるので）
    ['var b = it.a.buruko, p = dl.items[it.id];', 'var b = it.a.buruko, p = (D.ownIds || []).indexOf(it.id) >= 0 ? null : dl.items[it.id];', 1],
    // 支払い方法と到着の幅はその会社の設定
    ['var PAY = { onsite:', 'var PAY = D.pay || { onsite:', 1],
    ["var ARRIVE = { '9時〜12時':", "var ARRIVE = D.arrive || { '9時〜12時':", 1],
    // その会社の数字が無い「予約に合わせた答え」は使わない
    // 紹介リンクを出さない会社は、おしまいの台詞を1つ目（あいさつ）だけにする（2つ目は紹介リンクの案内なので）
    ["if (S.chara !== 'bruce' || !S.dl) return c;", "if (S.chara !== 'bruce' || !S.dl) return D.noShare ? Object.assign({}, c, { bye: c.bye.slice(0, 1) }) : c;", 1],
    ['for (k in S.dl.chars) o[k] = S.dl.chars[k];\n    return o;', 'for (k in S.dl.chars) o[k] = S.dl.chars[k];\n    if (D.noShare) o.bye = o.bye.slice(0, 1);\n    return o;', 1],
    ['if (!f || !m) return null;', 'if (!f || !m || (D.mineOff || []).indexOf(it.id) >= 0) return null;', 1]
  ];
  return swap('common', SRC_THANKS, R, 'チャット');
}

// ---------- 書き出し ----------
const outputs = []; // [パス, 中身]
outputs.push(['shop/common/thanks.js', commonThanks()]);
const files = readdirSync(join(here, 'companies')).filter(f => /^c\d{3}\.json$/.test(f)).sort();
for (const f of files) {
  const c = loadCompany(f);
  if (only.length && !only.includes(c.id)) continue;
  const html = companyHtml(c);
  const data = companyData(c);
  const dataJs = `// このファイルは kata/build.mjs が kata/companies/${c.id}.json と FAQ台帳（welcome/thanks-data.js）から作る。直接直さない。\nwindow.THANKS_DATA = ${JSON.stringify(data, null, 1)};\n`;
  const test = testHtml(c, html);
  const pages = [[`shop/${c.id}/test/index.html`, test], [`shop/${c.id}/thanks-data.js`, dataJs]];
  if (c.honban && c.booking_url) pages.push([`shop/${c.id}/index.html`, html]);
  for (const [path, body] of pages) {
    const plain = body.replace(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g, '');
    for (const re of ARIGATOU_ONLY) { const m = plain.match(re); if (m) fail(c.id, `${path} にありがとうエアコンだけの値が残っている: …${plain.slice(Math.max(0, m.index - 60), m.index + 40)}…`); }
    if (NG_WORDS.test(body)) fail(c.id, `${path} に使わない言葉が入っている`);
  }
  outputs.push(...pages);
  const open = data.items.filter(i => i.open).length;
  const shut = data.items.filter(i => !i.open).map(i => i.id);
  if (!CHECK) console.log(`${c.id}（${c.shop_name}）：試し用ページ${pages.length > 2 ? '・本番ページ' : ''}／FAQ 公開${open}問・人へつなぐ${shut.length}問${shut.length ? '（' + shut.join(' ') + '）' : ''}`);
}

let bad = 0;
for (const [path, body] of outputs) {
  const full = join(root, path);
  if (CHECK) {
    const cur = existsSync(full) ? readFileSync(full, 'utf8') : '';
    if (cur !== body) { console.error(`合っていない: ${path}（node kata/build.mjs で作り直す）`); bad++; }
  } else {
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
}
if (CHECK) {
  // 設定ファイルが消えたのに残っている会社のページ
  for (const d of existsSync(join(root, 'shop')) ? readdirSync(join(root, 'shop')) : []) {
    if (d !== 'common' && !files.includes(d + '.json')) { console.error(`shop/${d}/ の設定ファイル kata/companies/${d}.json が無い`); bad++; }
  }
  if (bad) process.exit(1);
  console.log('OK: shop/ は kata/companies/ と welcome/ に合っている');
}
