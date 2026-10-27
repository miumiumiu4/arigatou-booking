// 超知能MUSE無料セミナー 終了アンケート 受付スクリプト
// 使い方: 回答用スプレッドシート（MUSE専用に新規作成）→ 拡張機能 → Apps Script にこのファイルの中身を貼り付け
// → デプロイ → ウェブアプリ（実行: 自分／アクセス: 全員）→ 発行された /exec のURLを muse/config.json の GAS_URL に入れる
// 質問が増えても、知らない項目は自動で右端に列が足されるので、このスクリプトの貼り直しは不要です。
// 翌朝6時の個別プロンプトメール: デプロイ後に setupMorningTrigger を1回だけ「実行」すると、毎朝6時台に自動送信されます。
const SHEET = "回答";
const SHEETS = { survey: "回答"};
// [送信データの項目名, シートの見出し]
const COLS = [
["at","受付日時"],["date","受講日"],["kai","回"],["name","お名前"],["email","メールアドレス"],
["satisfaction","満足度(1-5)"],["pace","スピード"],
["reach","今日できたこと"],["reach_n","到達チェック数"],["reach_done","到達(r3)"],
["stage_text","ステージ文"],["stage_n","ステージ番号"],["stage","ステージ名"],
["sk1","物差し1:情報を教える"],["sk2","物差し2:効く問いかけ"],["sk3","物差し3:チェックと修正指示"],
["sk4","物差し4:任せて見張る"],["sk5","物差し5:数字と次の一手"],["sk6","物差し6:型の再利用"],["skill_score","物差し合計"],
  ["reflect_taught","振り返り:覚えさせたこと"],["reflect_query","振り返り:立てた問い"],["reflect_deeper","振り返り:深めた問い"],["reflect_next","振り返り:次に任せたいこと"],
["trouble_cat","困り事カテゴリ"],["trouble","困り事(詳細)"],["improve","次回までの改善"],
["next_want","次回やってみたいこと"],["next_other","次回(その他)"],
["recommend","すすめたい度(0-10)"],["good","よかったところ"],["hard","わかりにくかったところ"],["comment","講師へひとこと"],
["id","回答ID"],["ua","端末"],["prompt_sent","プロンプト送信日時"]
];
// 集計ページで回答を読むための合言葉（公開リポジトリには本物を書かず、デプロイ時にここを書き換える）
const READ_KEY = "ここに合言葉を入れる";
// 翌朝メールに入れる次回予告（開催が決まったらここを書き換える。書き換えは再デプロイ不要＝スクリプト保存だけで反映）
const NEXT_TEASER = "次回（第2回）では、今回のアンケートで多かった困り事を実際に扱います。あなたの困り事がテーマになるかもしれません。日程はこのメールアドレスにご案内します。";

function sheet_(name) {
name = name || SHEET;
const ss = SpreadsheetApp.getActiveSpreadsheet();
let sh = ss.getSheetByName(name);
if (!sh) { sh = ss.insertSheet(name); sh.appendRow(COLS.map(c => c[1])); sh.setFrozenRows(1);}
return sh;
}
function headers_(sh) {
const n = sh.getLastColumn();
return n? sh.getRange(1, 1, 1, n).getValues()[0].map(String): [];
}
const keyOfLabel_ = l => { const c = COLS.find(c => c[1] === l); return c? c[0]: l;};
const labelOfKey_ = k => { const c = COLS.find(c => c[0] === k); return c? c[1]: k;};

function doPost(e) {
const lock = LockService.getScriptLock(); lock.waitLock(10000);
try {
const d = JSON.parse(e.postData.contents);
d.at = new Date();
if (d.stage_n!== undefined && d.stage_n!== "") d.stage = "ステップ " + d.stage_n + " / 10";
const sh = sheet_(SHEETS[d.type] || SHEET);
let head = headers_(sh);
Object.keys(d).filter(k => k!== "type").forEach(k => {
const l = labelOfKey_(k);
if (head.indexOf(l) < 0) { head.push(l); sh.getRange(1, head.length).setValue(l);}
});
const idCol = head.indexOf("回答ID") + 1;
const ids = idCol && sh.getLastRow() > 1? sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues().flat(): [];
if (ids.indexOf(d.id) < 0) {
sh.appendRow(head.map(l => { const v = d[keyOfLabel_(l)]; return v === undefined? "": v;}));
}
return json_({ ok: true});
} catch (err) {
return json_({ ok: false, error: String(err)});
} finally { lock.releaseLock();}
}
function doGet(e) {
if ((e.parameter.key || "")!== READ_KEY) return json_({ ok: false, error: "合言葉が違います"});
const v = sheet_(SHEETS[e.parameter.type] || SHEET).getDataRange().getValues();
const keys = v[0].map(l => keyOfLabel_(String(l)));
const rows = v.slice(1).map(r => {
const o = {}; keys.forEach((k, i) => o[k] = r[i] instanceof Date? Utilities.formatDate(r[i], "Asia/Tokyo", k === "date"? "yyyy-MM-dd": "yyyy-MM-dd HH:mm"): r[i]); return o;
});
return json_({ ok: true, rows});
}

// ===== 翌朝6時：困り事に合わせた「実践プロンプト」メール =====
// 回答した人へ、翌朝6時台に自動で送る。困り事カテゴリごとの実践プロンプト＋本人の成長の現在地＋次回予告。
const MAIL_FROM_NAME = "超知能MUSE無料セミナー";
const STAGES = [
"まだどれもできていない",
"自分のMUSEを開いて、声で話しかけられた",
"MUSEに、自分の「今一番収入に関わる仕事・活動」の情報を教えた（覚えさせた）",
"MUSEに指示を1本出して、成果物（文章・表・下書きなど）が1つ返ってきた",
"その成果物を、実際の仕事・活動で使った",
"MUSEに繰り返しの仕事を1つ任せて、翌日も動いているのを確認した",
"MUSEの報告や提案を見て、その日の仕事・活動を1つ決めた",
"MUSEに任せる仕事の「型」（指示書）を1本書いて保存した",
"その型を使って、2回目も同じ品質で成果物が出た",
"自分の仕事・活動の数字（売上・予約など）をMUSEに集計させて、次の一手を決めた",
"作った仕組みや型を、ほかの人に教えたり紹介したりした"
];
// 困り事カテゴリ → 実践プロンプト（そのままMUSEに貼って使える文）
const PROMPTS = {
"時間が足りない・作業に追われる": "私の今日の予定と、抱えている仕事を全部聞いてください。そのうえで「今日やらなくていいこと」を先に3つ挙げて、残りを『私しかできないこと』と『あなたに任せられること』に分けて、任せられることは今すぐ下書きまで進めてください。",
"返信や連絡が追いつかない": "この問い合わせへの返信の下書きを作ってください。私の仕事の情報（あなたが覚えている内容）をもとに、丁寧で短く、相手が次に取る行動が分かる文にしてください。送るかどうかは私が決めるので、下書きのままで止めてください。元の文も一緒に貼ります。",
"集客や発信が続かない": "私の仕事・活動の情報から、今日そのまま投稿できる短い文章を3本作ってください。売り込みではなく、私の仕事の現場で起きた小さい気づきや、お客様の役に立つコツを中心に。1本ごとに、最初の一文で続きが読みたくなる形にしてください。",
"数字やお金の管理ができていない": "私の仕事・活動の数字を一緒に整理してください。まず、私が毎週見るべき数字を5つだけ決めて、その理由を教えてください。次に、その数字をあなたが集計するときに、私が何を渡せばいいかを一覧にしてください。",
"アイデアや企画が出ない": "世界のトップ3の事例を分析して、各社の良い点と見落としを調べ、その見落としを改善した版を、私の仕事・活動向けに作ってください。事例は私の分野に近いところから選んでください。",
"人に頼む・任せるのが苦手": "私が抱えている仕事のうち、人やAIに任せられるものを一緒に洗い出してください。任せる相手に渡す『指示書』の形で、目的・材料・出来上がりの見本・チェックの観点を1本書いてください。任せたあと私が確認するポイントも付けてください。",
"MUSEの使い方がまだよく分からない": "私はまだ使い始めたばかりです。私の仕事・活動の情報をもとに、今日10分で試せる小さな頼み事を1つ提案して、その頼み方（プロンプト）をそのまま貼れる形で書いてください。できたら何が返ってくるかも先に教えてください。",
"その他": "私の困り事を聞いてください。まず私に3つだけ質問して状況を整理し、そのあとで『今日すぐできる一番小さい一手』を1つ提案し、その下書きまで作ってください。大きな計画より、今日動ける一手を優先してください。"
};
const DEFAULT_PROMPT = PROMPTS["その他"];

function sendMorningPrompts() {
const sh = sheet_(SHEET);
const v = sh.getDataRange().getValues();
if (v.length < 2) return;
const keys = v[0].map(l => keyOfLabel_(String(l)));
const sentCol = v[0].indexOf("プロンプト送信日時") + 1;
const rows = v.slice(1).map((r, i) => { const o = { _row: i + 2}; keys.forEach((k, j) => o[k] = r[j]); return o;});
const byEmail = {};
rows.forEach(o => { const me = String(o.email || "").trim().toLowerCase(); if (me) (byEmail[me] = byEmail[me] || []).push(o);});
const esc = t => String(t == null? "": t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;"})[c]);
let sent = 0;
rows.forEach(o => {
if (o.prompt_sent) return; // 送信済みは送らない
const to = String(o.email || "").trim(); if (!to) return;
const hist = (byEmail[to.toLowerCase()] || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
const idx = hist.indexOf(o);
const prev = idx > 0? hist[idx - 1]: null;
const n = +o.stage_n || 0;
let prompt = PROMPTS[o.trouble_cat] || DEFAULT_PROMPT;
    // 自由記述の困り事と「次に任せたいこと」を差し込み、その人専用のプロンプトにする
    if (o.trouble) prompt += "\n私の状況はこうです：「" + o.trouble + "」この状況に合わせて、最初の一手から始めてください。";
    if (o.improve) prompt += "\n次回までに改善したいことは「" + o.improve + "」です。進み具合の確かめ方も付けてください。";
    if (o.reflect_next) prompt += "\n終わったら、私が次に任せたい仕事「" + o.reflect_next + "」の進め方も提案してください。";
const nextStage = n < 10? STAGES[n + 1]: "";
let html = '<div style="font-family:sans-serif;line-height:1.8;color:#333;max-width:560px">'
+ '<p>' + esc(o.name || "") + ' 様</p>'
+ '<p>お楽しみ様です！昨日の「超知能MUSE無料セミナー」へのご参加、ありがとうございました。<br>アンケートで教えてもらった困り事に合わせて、今日すぐ使える実践プロンプトをお届けします。</p>'
+ '<h3 style="color:#e8590c;margin-bottom:4px">あなたの困り事</h3><p>「' + esc(o.trouble_cat || "その他") + '」' + (o.trouble? '<br>' + esc(o.trouble): '') + '</p>'
+ '<h3 style="color:#e8590c;margin-bottom:4px">今日の実践プロンプト（そのままMUSEに貼ってください）</h3>'
+ '<p style="background:#fff3e8;padding:12px 14px;border-radius:8px">' + esc(prompt) + '</p>'
+ '<h3 style="color:#e8590c;margin-bottom:4px">あなたの現在地：ステップ ' + n + ' / 10</h3>'
+ (n? '<p>できたこと：' + esc(STAGES[n]) + '</p>': '')
+ (prev? '<p>' + (n > +prev.stage_n? '前回からステップが ' + (n - +prev.stage_n) + ' つ上がりました🎉': '前回と同じステップです。今日のプロンプトで一歩進めましょう。') + '</p>': '<p>はじめての記録です。これからの成長が、回ごとのアンケートで見えるようになります。</p>')
+ (nextStage? '<p>次のチャレンジ：' + esc(nextStage) + '</p>': '<p>すべてのステップを達成しています。すばらしいです！</p>')
+ '<h3 style="color:#e8590c;margin-bottom:4px">次回のお知らせ</h3><p>' + esc(NEXT_TEASER) + '</p>'
+ '<p style="color:#888;font-size:12px">このメールは、セミナーの終了アンケートにお答えいただいた方へ自動でお送りしています。心当たりがない場合は、このメールに返信してお知らせください。</p>'
+ '<p>三浦<br>愛してるぜ🤟</p></div>';
MailApp.sendEmail({ to: to, subject: "あなたの困り事に合わせた、今日の実践プロンプト", htmlBody: html, name: MAIL_FROM_NAME});
if (sentCol > 0) sh.getRange(o._row, sentCol).setValue(new Date());
sent++;
});
console.log("プロンプトメール送信: " + sent + "件");
}
// 最初に1回だけ実行：毎朝6時台に sendMorningPrompts を自動実行するトリガーを作る
function setupMorningTrigger() {
ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "sendMorningPrompts").forEach(t => ScriptApp.deleteTrigger(t));
ScriptApp.newTrigger("sendMorningPrompts").timeBased().everyDays(1).atHour(6).create();
console.log("トリガーを設定しました（毎朝6時台）");
}
// 最初に1回だけ：この関数を選んで「実行」→ メール送信の権限を許可する（メールは送られません）
function authorize() { console.log("今日あと送れるメール数: " + MailApp.getRemainingDailyQuota());}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
