// FAQ台帳（キャラ別の答え入り JSON）から、送信後チャットが読む welcome/thanks-data.js を作る。
//   node welcome/tools/build-thanks-data.mjs <faq_daicho_v1_answers.json>
// 公開ページなので、台帳の「出典」「状態のメモ」は書き出さない。
// status が「確定」で始まらない問は答えを書き出さず、ページでは「人に回す」になる（金額が未確定のものを出さない）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('使い方: node welcome/tools/build-thanks-data.mjs <台帳.json>'); process.exit(2); }
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'thanks-data.js');
const led = JSON.parse(fs.readFileSync(src, 'utf8'));

// 台詞は「キャラ4人のユーモア設計（2026-11-09）」の見本から。miss・more は実装で足した短い一言（台帳外・数字なし）
const CHARS = {
  buruyan: {
    name: 'ブルやん', kind: '男性', pick: 'ノリよく答えます', img: 'chara/buruyan.svg',
    hello: ['おー、俺でええの？ ありがとな、ブルやんです。', '親は秋田、生まれは大阪、育ちは横浜。長崎に3年おって、今は北海道や。せやけど口から出るんは、なんでか関西弁やねん。', '関西のノリで当日までのこと聞いてや。数字だけはふざけへんから安心して。'],
    check: 'これで気ぃ済んだ？ まだあったら遠慮なしで。',
    more: 'ほな、ほかにも聞きたいことあったら押してや。',
    miss: 'すまん、それはピンと来えへんかった。言い方を変えるか、下のボタンから選んでみて。',
    handoff: ['あー、それ俺の守備範囲ちゃうわ。かっこつけて適当に答えるんが一番あかんやつやから、人に代わるで。', '受付番号 {id} を伝えてもろたら話が早い。LINE か電話、どっちでも。'],
    bye: ['ほな当日な！ ええ仕事するで。', 'あ、「うちもやりたい」言うてる人おったら、このリンク渡しといて。俺の出番が増える。']
  },
  buruko: {
    name: 'ブルこ', kind: '女性', pick: '元気に答えます', img: 'chara/buruko.svg',
    hello: ['はーい、ブルこです！ 選んでくれてありがとうございます。', 'わたし、エアコン屋さんの店先で育ったんです。夏はずっと吹き出し口の前にいて、エアコンの風が大好きになりました。', '当日までの「あれどうなるんだっけ」、全部聞いてください。張り切ります。'],
    check: 'スッキリしました？ まだあったら何個でもどうぞ。',
    more: 'はーい！ ほかにもあったらどうぞ。',
    miss: 'うーん、ぴったりの答えが見つかりませんでした。言い方を変えるか、下のボタンからどうぞ。',
    handoff: ['うっ、それはわたしの知らないことです。知ったかぶりは絶対しないって決めてるので、人に代わりますね。', '受付番号 {id} を言ってもらえると早いです。LINE かお電話で！'],
    bye: ['当日、お待たせしないように段取りしておきます！', 'もしお友だちで「うちも」って人がいたら、このリンクを。わたし、また張り切ります。']
  },
  burusama: {
    name: 'ブルさま', kind: 'どっちでもない', pick: 'ズバッと答えます', img: 'chara/burusama.svg',
    hello: ['あら、わたしを選ぶのね。いい趣味。ブルさまよ。', '昔は銀座のブティックで看板犬をしてたの。だから、いいものとそうでないものは、ひと目で分かるのよ。', '遠回しなのは嫌いだから、はっきり言うわ。はっきり言うけど、味方だからね。'],
    check: 'これで少しは安心した？ まだあるなら付き合うわよ。',
    more: 'いいわよ、ほかにもあれば聞いて。',
    miss: 'ごめんなさいね、それはうまく拾えなかったわ。言い方を変えるか、下から選んでちょうだい。',
    handoff: ['それはね、わたしが答えちゃいけない種類の質問。分からないことを分かったふりするほど、恥ずかしいことはないもの。', '受付番号 {id} を添えて、人に聞いて。LINE でも電話でも、ちゃんと出るから。'],
    bye: ['じゃあ当日ね。ちゃんとやるわよ、うちの職人。', '知り合いに悩んでる人がいたら、このリンク渡しなさい。押しつけはしないけど、いい店は教えてあげるものよ。']
  },
  // 4人目（11/10 三浦さん）：イギリスから来た留学生。選んだ県の田舎の学校で育ったので、その県の言葉で話す。
  // ask・soon・fail だけ標準語。あいさつ以降の台詞は welcome/dialect/src/<県>.json から
  bruce: {
    name: 'ブルース', kind: '留学生', pick: 'ふるさとの言葉で答えます', img: 'chara/bruce.svg',
    ask: ['ハロー、ブルースです。イギリスから来た留学生のブルドッグです。', '日本の田舎の学校で育ったので、その土地の言葉で話します。あなたの生まれ故郷はどこですか？ 外国の言葉でも話せますよ。'],
    langs: 'ほかの国の言葉 / Other languages',
    soon: 'ほかの県や国の言葉も、順番に増やしています。',
    fail: 'ごめんなさい、いまは言葉の準備ができませんでした。ほかの案内係を選んでください。',
    hello: [], check: '', more: '', miss: '', handoff: [], bye: []
  }
};
// よくある質問のボタン6個（設計書 3節の順）
const QUICK = [['F02', 'トイレ掃除のプレゼント'], ['B01', '当日の準備'], ['A02', '所要時間'], ['C04', '支払い'], ['B03', '駐車場'], ['D01', 'キャンセル'], ['D02', '日にち変更'], ['A01', '到着時間']];

const ids = Object.keys(CHARS).filter(c => c !== 'bruce'); // ブルースは県の言葉の束から、ページの中で組み立てる
const items = led.items.map(it => {
  const open = /^確定/.test(String(it.status || ''));
  const o = { id: it.id, cat: it.category, q: it.q, aliases: it.aliases || [], open };
  if (open) {
    o.human = !String(it.answer_base || '').trim(); // 人に回す形（答えの元文が無い）
    o.a = {};
    for (const c of ids) {
      const a = it.answers && it.answers[c];
      if (!Array.isArray(a) || !a.length) throw new Error(`${it.id} に ${c} の答えが無い`);
      o.a[c] = a;
    }
  }
  return o;
});
for (const [id] of QUICK) if (!items.find(i => i.id === id)) throw new Error('ボタンの ' + id + ' が台帳に無い');

// 県の言葉の束：welcome/dialect/src/<id>.json → welcome/dialect/<id>.js（ブルースを選んで県を押した時だけ読む）
const DL_SRC = path.join(path.dirname(out), 'dialect', 'src');
const MINE_KEYS = ['A02_what', 'A02_span', 'C04_pay', 'C04_change', 'A01_day', 'B03_in', 'B03_coin', 'C08_codes', 'C08_id', 'E03_pet', 'C07_has', 'C07_left',
  'B06_model', 'B06_none', 'C05_name', 'C05_none', 'B04_ok', 'B04_count', 'B04_next', 'INFO_mail', 'INFO_reply', 'INFO_got', 'ADD_ask', 'F04_has', 'F05_has'];
const NG = /お疲れ様|おつかれさま|無理/;
// 外国の言葉の束（lang がある束）は、答えを丸ごと訳す。画面の文字（t）と質問の名前（q）も要る
const T_KEYS = ['ui_more', 'ui_ph', 'ui_send', 'ui_hint', 'ui_human', 'ui_human_out', 'ui_menu', 'ui_bye', 'ui_bye_out', 'ui_set', 'ui_mail', 'ui_mail_line',
  'ui_copy_again', 'ui_copied', 'ui_add_set3', 'ui_yes', 'ui_no', 'ui_about', 'ui_contact', 'ui_tell_id', 'ui_ja_only', 'ui_call', 'ui_line', 'ui_line_note', 'ui_copy_msg',
  'ui_stars', 'ui_thanks', 'u_h', 'u_m', 'u_to', 'u_and', 'u_colon', 'v_ac', 'v_auto', 'v_out', 'v_coupon', 'v_ref', 'v_who', 'v_staff', 'v_pets',
  'pay_onsite', 'pay_paypay', 'pay_paypal', 'A02_note', 'A02_tenkase', 'C04_after', 'A01_arrive', 'A01_fix', 'B03_in_note', 'B03_coin_note', 'C08_none',
  'E03_base', 'F04_note', 'F05_note', 'C07_note', 'B06_note', 'C05_note',
  'info_receipt', 'info_receipt_ph', 'info_receipt_has', 'info_receipt_none', 'info_set3', 'info_set3_ph', 'info_set3_none', 'info_model', 'info_model_ph', 'info_model_has', 'info_model_none'];
// 金額・時間の数字は訳でも同じに（ASCII の数字で書く）
const nums = t => (String(t).replace(/(\d),(?=\d{3})/g, '$1').match(/\d+/g) || []).filter(n => n.length >= 3);
const dialects = [];
for (const f of (fs.existsSync(DL_SRC) ? fs.readdirSync(DL_SRC) : []).filter(f => f.endsWith('.json')).sort()) {
  const dl = JSON.parse(fs.readFileSync(path.join(DL_SRC, f), 'utf8'));
  const id = f.replace(/\.json$/, '');
  for (const k of ['hello', 'check', 'more', 'miss', 'handoff', 'bye']) if (!dl.chars || !dl.chars[k] || !dl.chars[k].length) throw new Error(`${f}: chars.${k} が無い`);
  for (const k of MINE_KEYS) if (!dl.mine || !dl.mine[k]) throw new Error(`${f}: mine.${k} が無い`);
  if (!Array.isArray(dl.my) || dl.my.length !== 2) throw new Error(`${f}: my は [はじめ, おわり] の2つ`);
  const lack = items.filter(i => i.open && !(dl.items && dl.items[i.id])).map(i => i.id);
  if (lack.length) console.warn(`注意 ${f}: ${lack.join(' ')} の台詞が無い（その問はブルこの言い方になる）`);
  for (const [k, v] of Object.entries(dl.items || {})) if (!Array.isArray(v) || v.length < 2) throw new Error(`${f}: items.${k} は [はじめ…, おわり]（2つ以上）`);
  if (NG.test(JSON.stringify(dl))) throw new Error(`${f}: 使わない言葉が入っている`);
  if (dl.lang) {
    if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(dl.lang)) throw new Error(`${f}: lang の形が違う`);
    for (const k of T_KEYS) if (typeof (dl.t || {})[k] !== 'string') throw new Error(`${f}: t.${k} が無い`);
    if (!dl.t.ui_tell_id.includes('{id}')) throw new Error(`${f}: t.ui_tell_id に {id} が無い`);
    for (const i of items.filter(i => i.open)) {
      if (!dl.items || !dl.items[i.id]) throw new Error(`${f}: items.${i.id} が無い（外国の言葉は全部の問が要る）`);
      if (!dl.q || !dl.q[i.id]) throw new Error(`${f}: q.${i.id} が無い`);
      const want = nums(i.a.buruko.join(' ')), got = nums(dl.items[i.id].join(' '));
      for (const n of want) if (!got.includes(n)) throw new Error(`${f}: items.${i.id} に数字 ${n} が無い（金額・時間は元の文と同じに）`);
      if (/\{id\}/.test(i.a.buruko.join('')) && !/\{id\}/.test(dl.items[i.id].join(''))) throw new Error(`${f}: items.${i.id} に {id} が無い`);
    }
    const NOTE_NUMS = { F04_note: ['23300', '22300'], F05_note: ['3000'], C07_note: ['7500', '9500'] };
    for (const [k, want] of Object.entries(NOTE_NUMS)) for (const n of want) if (!nums(dl.t[k]).includes(n)) throw new Error(`${f}: t.${k} に数字 ${n} が無い`);
    if (!dl.q.MY) throw new Error(`${f}: q.MY が無い`);
  }
  const pack = { pref: dl.pref, lang: dl.lang, chars: dl.chars, my: dl.my, mine: dl.mine, items: dl.items, t: dl.t, q: dl.q, kw: dl.kw };
  fs.writeFileSync(path.join(path.dirname(out), 'dialect', id + '.js'),
    '// このファイルは welcome/tools/build-thanks-data.mjs が dialect/src/' + f + ' から作ります。直接書きかえないでください。\n'
    + '(window.THANKS_DIALECTS = window.THANKS_DIALECTS || {})[' + JSON.stringify(id) + '] = ' + JSON.stringify(pack, null, 1) + ';\n');
  dialects.push(dl.lang ? { id, pref: dl.pref, lang: dl.lang, order: +dl.order || 999 } : { id, pref: dl.pref, order: +dl.order || 999 });
}
dialects.sort((x, y) => x.order - y.order); // 県は北から（JIS の県番号）、外国の言葉は order の順
for (const d of dialects) delete d.order;
if (!dialects.length) throw new Error('県の言葉の束が1つも無い（ブルースが話せない）');

const data = { version: led.version, chars: CHARS, quick: QUICK, items, dialects };
const js = '// このファイルは welcome/tools/build-thanks-data.mjs が FAQ台帳から作ります。直接書きかえないでください。\n'
  + 'window.THANKS_DATA = ' + JSON.stringify(data, null, 1) + ';\n';
fs.writeFileSync(out, js);
console.log('wrote', path.relative(process.cwd(), out), '・問', items.length, '（公開', items.filter(i => i.open).length, '）・県の言葉', dialects.filter(d => !d.lang).map(d => d.pref).join(' '), '・外国の言葉', dialects.filter(d => d.lang).map(d => d.pref).join(' '));
