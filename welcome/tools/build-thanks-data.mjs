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
    hello: ['おー、俺でええの？ ありがとな、ブルやんです。', '関西のノリで当日までのこと聞いてや。数字だけはふざけへんから安心して。'],
    check: 'これで気ぃ済んだ？ まだあったら遠慮なしで。',
    more: 'ほな、ほかにも聞きたいことあったら押してや。',
    miss: 'すまん、それはピンと来えへんかった。言い方を変えるか、下のボタンから選んでみて。',
    handoff: ['あー、それ俺の守備範囲ちゃうわ。かっこつけて適当に答えるんが一番あかんやつやから、人に代わるで。', '受付番号 {id} を伝えてもろたら話が早い。LINE か電話、どっちでも。'],
    bye: ['ほな当日な！ ええ仕事するで。', 'あ、「うちもやりたい」言うてる人おったら、このリンク渡しといて。俺の出番が増える。']
  },
  buruko: {
    name: 'ブルこ', kind: '女性', pick: '元気に答えます', img: 'chara/buruko.svg',
    hello: ['はーい、ブルこです！ 選んでくれてありがとうございます。', '当日までの「あれどうなるんだっけ」、全部聞いてください。張り切ります。'],
    check: 'スッキリしました？ まだあったら何個でもどうぞ。',
    more: 'はーい！ ほかにもあったらどうぞ。',
    miss: 'うーん、ぴったりの答えが見つかりませんでした。言い方を変えるか、下のボタンからどうぞ。',
    handoff: ['うっ、それはわたしの知らないことです。知ったかぶりは絶対しないって決めてるので、人に代わりますね。', '受付番号 {id} を言ってもらえると早いです。LINE かお電話で！'],
    bye: ['当日、お待たせしないように段取りしておきます！', 'もしお友だちで「うちも」って人がいたら、このリンクを。わたし、また張り切ります。']
  },
  burusama: {
    name: 'ブルさま', kind: 'どっちでもない', pick: 'ズバッと答えます', img: 'chara/burusama.svg',
    hello: ['あら、わたしを選ぶのね。いい趣味。ブルさまよ。', '遠回しなのは嫌いだから、はっきり言うわ。はっきり言うけど、味方だからね。'],
    check: 'これで少しは安心した？ まだあるなら付き合うわよ。',
    more: 'いいわよ、ほかにもあれば聞いて。',
    miss: 'ごめんなさいね、それはうまく拾えなかったわ。言い方を変えるか、下から選んでちょうだい。',
    handoff: ['それはね、わたしが答えちゃいけない種類の質問。分からないことを分かったふりするほど、恥ずかしいことはないもの。', '受付番号 {id} を添えて、人に聞いて。LINE でも電話でも、ちゃんと出るから。'],
    bye: ['じゃあ当日ね。ちゃんとやるわよ、うちの職人。', '知り合いに悩んでる人がいたら、このリンク渡しなさい。押しつけはしないけど、いい店は教えてあげるものよ。']
  },
  buruseijin: {
    name: 'ブル星人', kind: '宇宙人', pick: '正確に答えます', img: 'chara/buruseijin.svg',
    hello: ['選択を確認。ブル星人であります。地球のエアコン清掃を調査するため着任しました。', '当日までの疑問を受け付けます。数字は母星の精度で正確に伝えます。'],
    check: '疑問は解消されましたか。はい、いいえ、で応答を。',
    more: '了解。ほかの質問も受け付けます。',
    miss: '受信した質問を、当機の記録と照合できませんでした。言い方を変えるか、下のボタンを選択してください。',
    handoff: ['その質問は当機のデータベースにありません。推測で答えるのは母星の掟で禁止されています。', '地球の担当者に通信します。受付番号 {id} を伝えてください。LINE または電話が有効です。'],
    bye: ['調査に協力いただき感謝します。当日、地球の職人が最適な清掃を行います。', '周囲にエアコンの汚れで困っている地球人がいれば、このリンクを転送してください。当機の調査範囲が広がります。']
  }
};
// よくある質問のボタン6個（設計書 3節の順）
const QUICK = [['B01', '当日の準備'], ['A02', '所要時間'], ['C04', '支払い'], ['B03', '駐車場'], ['D01', 'キャンセル'], ['D02', '日にち変更']];

const ids = Object.keys(CHARS);
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

const data = { version: led.version, chars: CHARS, quick: QUICK, items };
const js = '// このファイルは welcome/tools/build-thanks-data.mjs が FAQ台帳から作ります。直接書きかえないでください。\n'
  + 'window.THANKS_DATA = ' + JSON.stringify(data, null, 1) + ';\n';
fs.writeFileSync(out, js);
console.log('wrote', path.relative(process.cwd(), out), '・問', items.length, '（公開', items.filter(i => i.open).length, '）');
