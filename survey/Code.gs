// パソコン教室 感想アンケート 受付スクリプト
// 使い方: 回答用スプレッドシート → 拡張機能 → Apps Script に貼り付け → デプロイ → ウェブアプリ（全員）
// 質問が増えても、知らない項目は自動で右端に列が足されるので、このスクリプトの貼り直しは不要です。
const SHEET = "回答";
// 申込みフォーム（type: "apply"）は別シートに入れる
const SHEETS = { survey: "回答", apply: "申込" };
// [送信データの項目名, シートの見出し]（並び順は既存のシートと同じ）
const COLS = [
  ["at","受付日時"],["date","受講日"],["kai","回"],["name","お名前"],["satisfaction","満足度(1-5)"],["difficulty","難しさ(1-5)"],
  ["pace","スピード"],["progress","サイトの進み具合"],["recommend","すすめたい度(0-10)"],["good","よかったところ"],["hard","わかりにくかったところ"],
  ["next","次に習いたいこと"],["next_other","次に習いたいこと(その他)"],["comment","講師へひとこと"],["id","回答ID"],["ua","端末"],
  ["possibility","感じた可能性"],["trouble","これまでの手間"],["email","メールアドレス"],
  ["t_clarity","講師:説明のわかりやすさ(1-5)"],["t_support","講師:質問・サポート(1-5)"],["t_mood","講師:雰囲気・話しやすさ(1-5)"],
  ["kana","ふりがな"],["phone","電話番号"],["role","今のお仕事・立場"],["pc","パソコン"],["claude","Claudeの利用"],["course","希望コース・日程"],["motive","受講したい理由"],["source","知ったきっかけ"],["page","申込ページ"]
];
// 集計ページで回答を読むための合言葉（公開リポジトリには本物を書かず、ここで書き換える）
const READ_KEY = "ここに合言葉を入れる";

function sheet_(name) {
  name = name || SHEET;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(name === SHEET ? COLS.slice(0, 22).map(c => c[1]) : ["受付日時", "回答ID"]); sh.setFrozenRows(1); }
  return sh;
}
// 見出し → 項目名 の対応表（見出しに無い項目は項目名そのものを見出しにする）
function headers_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
}
const keyOfLabel_ = l => { const c = COLS.find(c => c[1] === l); return c ? c[0] : l; };
const labelOfKey_ = k => { const c = COLS.find(c => c[0] === k); return c ? c[1] : k; };

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    d.at = new Date();
    const sh = sheet_(SHEETS[d.type] || SHEET);
    let head = headers_(sh);
    // 新しい項目があれば右端に列を足す
    Object.keys(d).filter(k => k !== "type").forEach(k => {
      const l = labelOfKey_(k);
      if (head.indexOf(l) < 0) { head.push(l); sh.getRange(1, head.length).setValue(l); }
    });
    // 同じ回答の二重送信を防ぐ
    const idCol = head.indexOf("回答ID") + 1;
    const ids = idCol && sh.getLastRow() > 1 ? sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues().flat() : [];
    if (ids.indexOf(d.id) < 0) {
      sh.appendRow(head.map(l => { const v = d[keyOfLabel_(l)]; return v === undefined ? "" : v; }));
      if ((d.type || "survey") === "survey" && d.email) { try { sendReport_(sh, d); } catch (mailErr) { console.error(mailErr); } }
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}
function doGet(e) {
  if ((e.parameter.key || "") !== READ_KEY) return json_({ ok: false, error: "合言葉が違います" });
  const v = sheet_(SHEETS[e.parameter.type] || SHEET).getDataRange().getValues();
  const keys = v[0].map(l => keyOfLabel_(String(l)));
  const rows = v.slice(1).map(r => {
    const o = {}; keys.forEach((k, i) => o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], "Asia/Tokyo", k === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm") : r[i]); return o;
  });
  return json_({ ok: true, rows });
}
// ===== 回答した人への「成長レポート」メール =====
// 回答が届くたびに、その人のこれまでの回答（同じメールアドレス）をまとめて本人に送る。
// レベル名（入門・初級など）は出さず、「ステップ ○/15」と「次のチャレンジ」で成長を見せる。
const REPORT_FROM_NAME = "ありがとうパソコン教室";
const STAGES = [["エンジンをかける", "自分のパソコンでClaude Codeを起動し、「店名を自分の店名に変えて」と頼んで変わった画面を見た"], ["公道に出る", "自分の予約フォームのURLを、自分のスマホで開いて見られた"], ["初めてのお客を乗せる", "自分でテスト予約を送って、予約メールが自分のGmailに届いた"], ["受付係を置く", "自分の予約フォームから申し込むと、スプレッドシートに1行たまり、お客様用と自分用の自動メールが2通とも届いた"], ["常連さんを呼び戻す", "自分のお客様リストにキャンペーンメールを1通送り、そこから予約が1件以上入った"], ["声と動画で伝える", "自分の予約ページで、自分の声（TTS）の60秒紹介動画が再生できて、店名入りの見本フォームのURLを1本持っている"], ["自分の仕事を1つ自動化", "自分が書いた指示書で作った仕組み（カレンダー連携や朝の要約メールなど）を、1週間以上毎日使っている"], ["数字で次の一手", "自分の集計ページの数字を見て決めたキャンペーンメールを1回送り、その予約件数を同じページで確認した"], ["初めての他店契約", "営業メールを20通以上送り、15分のお話を1件以上して、制作費の申込みを1件もらった（入金前でも可）"], ["決済と納品の型", "他店の予約フォームを納品し、制作費の入金がシートに記録されたものが2件以上ある"], ["番頭さんの月額", "他店から月額の支払いを2か月続けてもらっている店が1店以上ある"], ["ドミノを組んで量産", "候補の店を1件登録すると、見本と営業メールの下書きまで自動でできる流れを、1か月以上使って契約を取った"], ["15分授業", "自分が教えた入門クラスで、受講者が1人以上サイトを公開できた"], ["教室を自動で回す", "申込み1件で、チェックリスト・当日案内・アンケート・判定結果のメールが自動で流れた"], ["講師を育てる", "自分が育てたバディ講師が、自分抜きで入門クラスを1回やり、満足度4以上だった"]];
const GROW = [["st_nyu1", "Claude Codeを起動して、お手本のサイトの店名や電話番号を自分のものに変える"], ["st_nyu2", "作ったサイトをGitHubで公開して、スマホで開いてテスト予約を送る"], ["st_sho1", "申込みがスプレッドシートにたまり、お客様と自分に自動メールが届く仕組みを作る"], ["st_sho2", "自分のお客様リストにメール（音声や動画つき）を送って、再予約や口コミをもらう"], ["st_chu1", "指示書を書いて、自分の仕事の手間（カレンダー連携や朝の要約メールなど）を1つ仕組みにして毎日使う"], ["st_chu2", "営業手順書どおりに候補の店を探し、店名入りの見本と個別動画をつけた営業メールを送る"], ["st_jo1", "他店の予約フォームを納品して、決済で制作費をもらい、使い方の説明書まで渡す"], ["st_jo2", "他店向けの番頭さん（毎朝の要約メールや月1レポート、自動のお礼・再来案内）を置いて月額をもらう"], ["st_toku1", "例え話つきの15分授業をやって、受講者がサイトを公開できるところまで教える"], ["st_toku2", "教室の申込みから案内・アンケート・判定までを自動で流し、バディ講師に1クラス任せる"]];
function sendReport_(sh, d) {
  const v = sh.getDataRange().getValues(), keys = v[0].map(l => keyOfLabel_(String(l)));
  const me = String(d.email).trim().toLowerCase();
  const hist = v.slice(1).map(r => { const o = {}; keys.forEach((k, i) => o[k] = r[i]); return o; })
    .filter(o => String(o.email || "").trim().toLowerCase() === me && o.stage_n !== "" && o.stage_n !== undefined)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!hist.length) return;
  const now = hist[hist.length - 1], prev = hist.length > 1 ? hist[hist.length - 2] : null, n = +now.stage_n;
  const ymd = x => x instanceof Date ? Utilities.formatDate(x, "Asia/Tokyo", "M/d") : String(x).slice(5).replace("-", "/");
  const bar = k => '<span style="display:inline-block;width:' + Math.max(4, k / 15 * 220) + 'px;height:12px;background:#e8833a;border-radius:6px;vertical-align:middle"></span>';
  const can = o => GROW.filter(g => +o[g[0]] === 2).length;
  const up = prev ? GROW.filter(g => +now[g[0]] > +prev[g[0]]).map(g => g[1]) : [];
  const nextC = n < 15 ? STAGES[n][1] : "";
  const esc = t => String(t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  let html = '<div style="font-family:sans-serif;line-height:1.7;color:#333;max-width:560px">'
    + '<p>' + esc(now.name || "") + ' 様</p><p>お楽しみ様です！パソコン教室のアンケートにお答えいただき、ありがとうございます。<br>あなただけの成長レポートをお届けします。</p>'
    + '<h3 style="color:#e8833a;margin-bottom:4px">いまの位置：ステップ ' + n + ' / 15</h3>' + bar(n)
    + (n ? '<p style="margin-top:6px">できたこと：' + esc(STAGES[n - 1][1]) + '</p>' : '')
    + (prev ? '<p><b>' + (n > +prev.stage_n ? '前回からステップが ' + (n - +prev.stage_n) + ' つ上がりました🎉' : '前回と同じステップです。じっくり固める時期ですね。') + '</b></p>' : '<p><b>はじめての記録です。ここからの成長が、毎回このメールで見えるようになります。</b></p>')
    + '<h3 style="color:#e8833a;margin-bottom:4px">これまでの歩み</h3><table style="border-collapse:collapse">'
    + hist.map(h => '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap">' + ymd(h.date || h.at) + '</td><td>' + bar(+h.stage_n) + ' <span style="color:#888">ステップ' + (+h.stage_n) + '・一人でできる ' + can(h) + '/' + GROW.length + '</span></td></tr>').join("")
    + '</table>'
    + (up.length ? '<h3 style="color:#e8833a;margin-bottom:4px">前回から伸びたこと</h3><ul>' + up.map(t => '<li>' + esc(t) + '</li>').join("") + '</ul>' : '')
    + (nextC ? '<h3 style="color:#e8833a;margin-bottom:4px">次のチャレンジ</h3><p style="background:#fff3e8;padding:10px 12px;border-radius:8px">' + esc(nextC) + '</p><p>これができたら、ステップが1つ上がります。一歩ずつ、一緒にできるようになりましょう！</p>' : '<p>すべてのステップを達成しました。本当にすばらしいです！</p>')
    + '<p style="color:#888;font-size:12px">このメールは、アンケートにお答えいただいたときに自動でお送りしています。心当たりがない場合は、このメールに返信してお知らせください。</p>'
    + '<p>ありがとうパソコン教室<br>愛してるぜ🤟</p></div>';
  MailApp.sendEmail({ to: String(d.email).trim(), subject: "【パソコン教室】あなたの成長レポート（ステップ " + n + " / 15）", htmlBody: html, name: REPORT_FROM_NAME });
}
// 最初に1回だけ：この関数を選んで「実行」→ メール送信の権限を許可する（メールは送られません）
function authorize() { console.log("今日あと送れるメール数: " + MailApp.getRemainingDailyQuota()); }
// 動作確認用：この関数を「実行」すると、最後に回答した人へレポートを送り直す（本物の受講者に届くので注意）
function testReport() { const sh = sheet_(SHEET), v = sh.getDataRange().getValues(), keys = v[0].map(l => keyOfLabel_(String(l))), r = v[v.length - 1], o = {}; keys.forEach((k, i) => o[k] = r[i]); sendReport_(sh, o); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
