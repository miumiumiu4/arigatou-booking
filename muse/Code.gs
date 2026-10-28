// 超知能MUSE無料セミナー 受付スクリプト（参加前アンケート・終了アンケート・申込・超知能活用力診断）
// 使い方: MUSE専用スプレッドシート → 拡張機能 → Apps Script にこのファイルの中身を貼り付け（または clasp push）
// → デプロイ → ウェブアプリ（実行: 自分／アクセス: 全員）→ 発行された /exec のURLを muse/config.json の GAS_URL に入れる
// → 関数「setup」を1回だけ実行（メール送信の許可・合言葉の発行・毎朝6時のトリガー設定。合言葉は自分宛てのメールで届く）
// 質問が増えても、知らない項目は自動で右端に列が足されるので、このスクリプトの貼り直しは不要です。
// 合言葉（READ_KEY）と個人リンクの鍵は「スクリプト プロパティ」に入る。このファイル（公開リポジトリ）には書かない。

const SITE = "https://miumiumiu4.github.io/arigatou-booking/muse/";
const SHEETS = { survey: "回答", pre: "参加前", apply: "申込" };
const SHEET = SHEETS.survey;
const MASTER = "参加者マスタ";
const MASTER_HEAD = ["参加者ID", "お名前", "メールアドレス", "参加経路", "初回回答日時", "参加した回", "最終回答日時"];
// 参加者マスタの8列目から：広告分析用（最初に来たときの値を残す。後から来た値で上書きしない）
const MASTER_ATTR = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "click_id", "industry", "referrer"];
// テスト用のアドレス（+musetest を含む）は T001〜 の番号になり、本番の M001〜 を使わない。消すときは deleteTestData を実行
const IS_TEST = email => /\+musetest/i.test(email);
// 全5回の日程（参加前アンケートのリンクと「次回のお知らせ」に使う）
const SCHEDULE = [["第1回", "2026-11-02"], ["第2回", "2026-11-05"], ["第3回", "2026-11-09"], ["第4回", "2026-11-12"], ["第5回", "2026-11-16"]];

// [送信データの項目名, シートの見出し]
const COLS = [
["at","受付日時"],["date","受講日"],["kai","回"],["pid","参加者ID"],["name","お名前"],["email","メールアドレス"],
["satisfaction","満足度(1-5)"],["pace","スピード"],
["reach","今日できたこと"],["reach_n","到達チェック数"],["reach_done","到達(r3)"],
["stage_text","ステージ文"],["stage_n","ステージ番号"],["stage","ステージ名"],
["sk1","物差し1:情報を教える"],["sk2","物差し2:効く問いかけ"],["sk3","物差し3:チェックと修正指示"],
["sk4","物差し4:任せて見張る"],["sk5","物差し5:数字と次の一手"],["sk6","物差し6:型の再利用"],["skill_score","物差し合計"],
["reflect_taught","振り返り:覚えさせたこと"],["reflect_query","振り返り:立てた問い"],["reflect_deeper","振り返り:深めた問い"],["reflect_next","振り返り:次に任せたいこと"],
["gh","GitHub連携"],["gg","Google連携"],["want","得たいこと"],["next_ai","次にAIに任せたいこと"],
["trouble_cat","困り事カテゴリ"],["trouble","困り事(詳細)"],["improve","次回までの改善"],
["next_want","次回やってみたいこと"],["next_other","次回(その他)"],
["recommend","すすめたい度(0-10)"],["good","よかったところ"],["hard","わかりにくかったところ"],["comment","講師へひとこと"],
["src","参加経路"],["industry","業種"],["referrer","紹介者"],
["utm_source","流入元(utm_source)"],["utm_medium","媒体(utm_medium)"],["utm_campaign","キャンペーン(utm_campaign)"],["utm_content","広告(utm_content)"],["utm_term","キーワード(utm_term)"],
["ref","参照元"],["click_id","広告クリックID"],["landing","最初に開いたページ"],["first_seen","最初に来た日時"],["dur","回答にかかった秒数"],
["id","回答ID"],["ua","端末"],["report_sent","診断メール送信日時"],["prompt_sent","プロンプト送信日時"],["kata","問いかけの型"],["prompt_text","送ったプロンプト"]
];
// シートを新しく作るときの見出し（足りない列は回答が来たときに右端へ自動で足される）
const HEAD = {
  "回答": COLS.filter(c => ["gh","gg","want","next_ai","src","industry","referrer"].indexOf(c[0]) < 0).map(c => c[1]),
  "参加前": ["at","date","kai","pid","name","email","stage_text","stage_n","stage","sk1","sk2","sk3","sk4","sk5","sk6","skill_score","gh","gg","want","trouble_cat","trouble","next_ai","src","utm_source","utm_medium","utm_campaign","utm_content","utm_term","ref","click_id","landing","first_seen","dur","id","ua","report_sent","prompt_sent","kata","prompt_text"].map(k => labelOfKey_(k)),
  "申込": ["at","pid","name","email","industry","next_ai","gh","gg","referrer","src","utm_source","utm_medium","utm_campaign","utm_content","utm_term","id","report_sent"].map(k => labelOfKey_(k))
};
// 翌朝メールに入れる次回予告（書き換えは再デプロイ不要＝スクリプト保存だけで反映）
const NEXT_TEASER = "次回では、今回のアンケートで多かった困り事を実際に扱います。あなたの困り事がテーマになるかもしれません。";
const MAIL_FROM_NAME = "超知能MUSE無料セミナー";
const BRAND = "超知能活用力診断";
const MAIL_RESERVE = 5; // 1日のメール上限（MailApp）のうち、手動の連絡用に残しておく通数

function labelOfKey_(k) { const c = COLS.find(c => c[0] === k); return c ? c[1] : k; }
function keyOfLabel_(l) { const c = COLS.find(c => c[1] === l); return c ? c[0] : l; }
function sheet_(name) {
  name = name || SHEET;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(name === MASTER ? MASTER_HEAD.concat(MASTER_ATTR.map(labelOfKey_)) : (HEAD[name] || COLS.map(c => c[1]))); sh.setFrozenRows(1); }
  return sh;
}
function headers_(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
}
function rows_(name) {
  const sh = sheet_(name), v = sh.getDataRange().getValues();
  const keys = v[0].map(l => keyOfLabel_(String(l)));
  return v.slice(1).map((r, i) => { const o = { _row: i + 2, _sheet: name }; keys.forEach((k, j) => o[k] = r[j]); return o; });
}
function setCell_(name, row, key, value) {
  const sh = sheet_(name); let head = headers_(sh), col = head.indexOf(labelOfKey_(key)) + 1;
  if (!col) { col = head.length + 1; sh.getRange(1, col).setValue(labelOfKey_(key)); }
  sh.getRange(row, col).setValue(value);
}
const normEmail_ = s => String(s || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const normName_ = s => String(s || "").normalize("NFKC").replace(/\s+/g, " ").trim();
const esc_ = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ymd_ = d => Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd");
const dateStr_ = v => v instanceof Date ? ymd_(v) : String(v || "").slice(0, 10);
function props_() { return PropertiesService.getScriptProperties(); }
function readKey_() { return props_().getProperty("READ_KEY") || ""; }

// ===== 参加者マスタと参加者ID =====
// 個人リンクの鍵：参加者IDから作る（スクリプト プロパティの秘密の文字列が無いと作れないので、IDだけでは推測できない）
function personalKey_(pid) {
  const secret = props_().getProperty("LINK_SECRET");
  if (!secret || !pid) return "";
  const sig = Utilities.computeHmacSha256Signature(String(pid), secret);
  return Utilities.base64EncodeWebSafe(sig).replace(/=+$/, "").slice(0, 16);
}
function myUrl_(pid) { return SITE + "my.html?id=" + encodeURIComponent(pid) + "&k=" + personalKey_(pid); }
function preUrl_(kai, date, pid) { return SITE + "pre.html?date=" + date + "&kai=" + encodeURIComponent(kai) + (pid ? "&id=" + encodeURIComponent(pid) + "&k=" + personalKey_(pid) : ""); }
// メールアドレスで参加者を探し、いなければ新しい番号を発行する（同じアドレスなら以後ずっと同じ番号）
function participant_(d, label) {
  const sh = sheet_(MASTER), v = sh.getDataRange().getValues();
  const email = normEmail_(d.email), test = IS_TEST(email), prefix = test ? "T" : "M";
  let idx = -1;
  if (d.pid && d.pkey && personalKey_(d.pid) === d.pkey) idx = v.findIndex((r, i) => i > 0 && r[0] === d.pid);
  if (idx < 0) idx = v.findIndex((r, i) => i > 0 && normEmail_(r[2]) === email);
  const now = new Date();
  if (idx > 0) {
    const r = idx + 1, kais = String(v[idx][5] || "").split("、").filter(Boolean);
    if (label && kais.indexOf(label) < 0) { kais.push(label); sh.getRange(r, 6).setValue(kais.join("、")); }
    if (!v[idx][1] && d.name) sh.getRange(r, 2).setValue(normName_(d.name));
    if ((!v[idx][3] || v[idx][3] === "直接") && d.src && d.src !== "直接") sh.getRange(r, 4).setValue(d.src);
    MASTER_ATTR.forEach((k, j) => { if (!v[idx][7 + j] && d[k]) sh.getRange(r, 8 + j).setValue(d[k]); });
    sh.getRange(r, 7).setValue(now);
    return String(v[idx][0]);
  }
  const max = v.slice(1).map(r => String(r[0])).filter(id => id.charAt(0) === prefix).map(id => +id.slice(1) || 0).reduce((a, b) => Math.max(a, b), 0);
  const pid = prefix + ("00" + (max + 1)).slice(-3);
  sh.appendRow([pid, normName_(d.name), email, d.src || "直接", now, label || "", now].concat(MASTER_ATTR.map(k => d[k] || "")));
  return pid;
}

// ===== 受け口 =====
function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let d;
  try {
    try { d = JSON.parse(e.postData.contents); } catch (_) { d = {}; }
    if (!d || !d.type) d = Object.assign({}, e.parameter || {}, d || {}); // UTAGE の webhook（フォーム形式）にも対応
    const type = SHEETS[d.type] ? d.type : "survey";
    if (!normEmail_(d.email)) return json_({ ok: false, error: "メールアドレスがありません" });
    d.name = normName_(d.name);
    d.at = new Date();
    if (d.stage_n !== undefined && d.stage_n !== "") d.stage = "ステップ " + d.stage_n + " / 10";
    if (type === "apply") { d.src = "広告"; if (!d.utm_source) d.utm_source = "utage"; if (!d.id) d.id = "apply-" + normEmail_(d.email); }
    if (type === "pre" && !d.src) d.src = "直接";
    const label = type === "apply" ? "申込" : (d.kai || "") + (type === "pre" ? "参加前" : "終了");
    d.pid = participant_(d, label);
    const name = SHEETS[type], sh = sheet_(name);
    let head = headers_(sh);
    Object.keys(d).filter(k => ["type", "pkey"].indexOf(k) < 0).forEach(k => {
      const l = labelOfKey_(k);
      if (head.indexOf(l) < 0) { head.push(l); sh.getRange(1, head.length).setValue(l); }
    });
    const idCol = head.indexOf("回答ID") + 1;
    const ids = idCol && sh.getLastRow() > 1 ? sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues().flat() : [];
    if (ids.indexOf(d.id) >= 0) return json_({ ok: true, dup: true });
    sh.appendRow(head.map(l => { const v = d[keyOfLabel_(l)]; return v === undefined ? "" : v; }));
    const row = sh.getLastRow();
    lock.releaseLock();
    // 回答直後のメール（超知能活用力診断の結果。申込はIDと参加前アンケートの案内）
    try {
      if (MailApp.getRemainingDailyQuota() <= MAIL_RESERVE) setCell_(name, row, "report_sent", "上限で未送信");
      else { sendReport_(type, d); setCell_(name, row, "report_sent", new Date()); }
    } catch (mailErr) { console.error(mailErr); setCell_(name, row, "report_sent", "送信エラー: " + String(mailErr).slice(0, 80)); }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (_) {} }
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.action === "ping") return json_({ ok: true, ready: !!props_().getProperty("LINK_SECRET") });
  if (p.action === "my") return json_(myData_(p.id, p.k));
  const key = readKey_();
  if (!key || (p.key || "") !== key) return json_({ ok: false, error: "合言葉が違います" });
  if (p.action === "testmorning") return json_(testMorning_(p.id));
  const name = p.type === "master" ? MASTER : (SHEETS[p.type] || SHEET);
  const v = sheet_(name).getDataRange().getValues();
  const keys = v[0].map(l => keyOfLabel_(String(l)));
  const rows = v.slice(1).map(r => {
    const o = {}; keys.forEach((k, i) => o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], "Asia/Tokyo", k === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm") : r[i]); return o;
  });
  return json_({ ok: true, rows });
}

// ===== 物差し =====
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
const SKILLS = [["sk1", "情報を教える"], ["sk2", "効く問いかけ"], ["sk3", "チェックと修正指示"], ["sk4", "任せて見張る"], ["sk5", "数字と次の一手"], ["sk6", "型の再利用"]];
const SK_LABEL = ["まだ", "手伝いがあればできる", "一人でできる"];

// その人の記録（参加前＋終了）を古い順に
function history_(pid) {
  return rows_(SHEETS.pre).map(o => Object.assign(o, { _type: "参加前" }))
    .concat(rows_(SHEETS.survey).map(o => Object.assign(o, { _type: "終了" })))
    .filter(o => String(o.pid) === String(pid) && o.stage_n !== "" && o.stage_n !== undefined)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}
const recLabel_ = o => (o.kai || "") + " " + o._type;
// 診断コメント（成長レポートのメールと個人ページで同じ文を使う）
function diagnosis_(hist) {
  if (!hist.length) return { n: 0, lines: ["まだ記録がありません。参加前アンケートに答えると、ここにあなたの現在地が出ます。"] };
  const now = hist[hist.length - 1], prev = hist.length > 1 ? hist[hist.length - 2] : null, n = +now.stage_n || 0;
  const lines = [];
  lines.push("いまの位置はステップ " + n + " / 10" + (n ? "（できたこと：" + STAGES[n] + "）" : "") + "。物差しは " + (+now.skill_score || 0) + " / 12 です。");
  if (!prev) lines.push("これがあなたのスタート地点（ベースライン）です。ここからの伸びが、回ごとのアンケートで見えるようになります。");
  else {
    const ds = n - (+prev.stage_n || 0), dk = (+now.skill_score || 0) - (+prev.skill_score || 0);
    lines.push("前回（" + recLabel_(prev) + "）から、ステップは" + (ds > 0 ? " " + ds + " 上がりました🎉 " : ds < 0 ? "自己評価が少し下がりました。物差しの見方が厳しくなった証拠でもあります。" : "同じです。じっくり固める時期です。") + "物差しは" + (dk > 0 ? " +" + dk + " 伸びました。" : dk < 0 ? " " + dk + " です。" : "前回と同じです。"));
    const up = SKILLS.filter(([k]) => +now[k] > +prev[k]).map(s => s[1]);
    if (up.length) lines.push("伸びた力：" + up.join("・"));
  }
  const weak = SKILLS.filter(([k]) => +now[k] === 0).map(s => s[1]);
  if (weak.length) lines.push("次に伸ばしたい力：" + weak.slice(0, 2).join("・"));
  if (n < 10) lines.push("次のチャレンジ：" + STAGES[n + 1]);
  else lines.push("すべてのステップを達成しています。次は教える側にも挑戦してみてください。");
  return { n, lines };
}
function nextSeminar_(after) {
  const t = after || ymd_(new Date());
  const s = SCHEDULE.find(x => x[1] >= t);
  return s ? { kai: s[0], date: s[1] } : null;
}
const jpDate_ = s => { const d = new Date(s + "T12:00:00+09:00"); return Utilities.formatDate(d, "Asia/Tokyo", "M月d日") + "（" + "日月火水木金土".charAt(+Utilities.formatDate(d, "Asia/Tokyo", "u") % 7) + "）"; };

// ===== 回答直後のメール =====
function sendReport_(type, d) {
  const pid = d.pid, email = String(d.email).trim();
  const H = t => '<h3 style="color:#e8590c;margin:18px 0 4px">' + t + '</h3>';
  const btn = (url, t) => '<p><a href="' + esc_(url) + '" style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;font-weight:bold;padding:10px 18px;border-radius:10px">' + t + '</a></p>';
  let html = '<div style="font-family:sans-serif;line-height:1.8;color:#333;max-width:560px">'
    + '<p>' + esc_(d.name || "") + ' 様</p>';
  let subject;
  const ns = nextSeminar_(type === "survey" ? Utilities.formatDate(new Date(Date.now() + 864e5), "Asia/Tokyo", "yyyy-MM-dd") : null);
  if (type === "apply") {
    subject = "【" + BRAND + "】参加者番号 " + pid + " のご案内";
    html += '<p>お楽しみ様です！「超知能MUSE無料セミナー」へのお申し込み、ありがとうございます。</p>'
      + '<p style="font-size:1.2em"><b>あなたの参加者番号は ' + pid + ' です。</b></p>'
      + '<p>セミナーの前に、今のあなたの現在地を測る「参加前アンケート」（5分）にお答えください。答えるとすぐに、' + BRAND + 'の結果がこのアドレスに届きます。</p>'
      + (ns ? btn(preUrl_(ns.kai, ns.date, pid), ns.kai + "の参加前アンケートに答える") : "")
      + needSetup_(d)
      + H(BRAND) + '<p>あなたの診断結果の記録は、いつでもこちらで見られます（あなた専用のリンクです。ほかの人には教えないでください）。</p>' + btn(myUrl_(pid), BRAND + "を開く");
  } else {
    const hist = history_(pid), dg = diagnosis_(hist), now = hist[hist.length - 1] || d, n = dg.n;
    const first = hist.length <= 1;
    subject = "【" + BRAND + "】あなたの結果（ステップ " + n + " / 10・参加者番号 " + pid + "）";
    html += '<p>お楽しみ様です！' + (type === "pre" ? "参加前アンケート" : "セミナーの終了アンケート") + 'にお答えいただき、ありがとうございます。<br>あなたの' + BRAND + 'の結果をお届けします。</p>'
      + (first ? '<p style="font-size:1.2em"><b>あなたの参加者番号は ' + pid + ' です。</b><br>今後のアンケートも、このメールアドレスで答えてください。記録がつながります。</p>' : '<p>参加者番号：<b>' + pid + '</b></p>')
      + (type === "pre" ? needSetup_(d) : "")
      + H("いまの位置：ステップ " + n + " / 10")
      + '<p>' + dg.lines.map(esc_).join("<br>") + '</p>'
      + H("物差し6項目") + '<table style="border-collapse:collapse;font-size:14px">'
      + SKILLS.map(([k, t]) => { const prev = hist.length > 1 ? hist[hist.length - 2] : null, a = +now[k] || 0, b = prev ? +prev[k] || 0 : null; return '<tr><td style="padding:2px 10px 2px 0">' + t + '</td><td style="padding:2px 6px">' + "●".repeat(a) + "○".repeat(2 - a) + '</td><td style="color:#888">' + SK_LABEL[a] + (b !== null && a > b ? ' <b style="color:#1f8a70">↑</b>' : '') + '</td></tr>'; }).join("")
      + '</table>'
      + (hist.length > 1 ? H("これまでの歩み") + '<table style="border-collapse:collapse;font-size:14px">' + hist.map(h => '<tr><td style="padding:2px 10px 2px 0;white-space:nowrap">' + esc_(recLabel_(h)) + '</td><td>ステップ ' + (+h.stage_n) + '・物差し ' + (+h.skill_score || 0) + '/12</td></tr>').join("") + '</table>' : '')
      + H(BRAND + "（あなた専用ページ）") + '<p>回ごとの伸びをグラフで見られます（あなた専用のリンクです。ほかの人には教えないでください）。</p>' + btn(myUrl_(pid), BRAND + "を開く");
    if (type === "pre") {
      const prep = prepDay_(d.date);
      if (prep && ymd_(new Date()) < prep) html += '<p>' + jpDate_(prep) + 'の朝6時に、あなたの困り事に合わせた「当日がスムーズになる準備プロンプト」をお送りします。</p>';
    } else html += '<p>明日の朝6時に、あなたの困り事に合わせた実践プロンプトをお送りします。</p>';
    if (type === "survey" && ns) html += H("次回のお知らせ") + '<p>' + ns.kai + '：' + jpDate_(ns.date) + ' 20:00〜（Zoom）<br>前日までに参加前アンケートに答えておくと、伸びがはっきり見えます。</p>' + btn(preUrl_(ns.kai, ns.date, pid), ns.kai + "の参加前アンケート");
  }
  html += footer_();
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: html, name: MAIL_FROM_NAME });
}
function needSetup_(d) {
  const not = [["gh", "GitHub連携"], ["gg", "Google連携"]].filter(([k]) => d[k] && d[k] !== "済み").map(x => x[1]);
  if (!not.length) return "";
  return '<p style="background:#fff3e8;padding:10px 12px;border-radius:8px"><b>' + not.join("と") + 'がまだの方へ</b><br>セミナー当日は19:30から「設定ルーム」を開きます。20:00の開始前に一緒に設定しますので、19:30にZoomへお入りください。</p>';
}
function footer_() {
  return '<p style="color:#888;font-size:12px">このメールは、超知能MUSE無料セミナーのアンケート・お申し込みにお答えいただいた方へ自動でお送りしています。心当たりがない場合は、このメールに返信してお知らせください。</p>'
    + '<p>三浦<br>愛してるぜ🤟</p></div>';
}
function prepDay_(date) {
  const s = dateStr_(date); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return ymd_(new Date(new Date(s + "T12:00:00+09:00").getTime() - 864e5));
}

// ===== 3種類の問いかけ =====
const KATA = {
  "日常の型": { lead: "毎日の仕事を任せるための問いかけ", prompt: "私の毎日の仕事・活動の流れを聞いてください。そのうえで、毎朝あなたに任せられる仕事を1つ選び、明日から毎日同じ品質で頼めるように『頼み方の型（指示書）』を1本作ってください。型には、目的・あなたに渡す材料・出来上がりの見本・私がチェックする点を入れてください。" },
  "分析・研究の型": { lead: "世界のトップや競合を分析し、良い点と見落としを調べる問いかけ", prompt: "私の仕事・活動と同じ分野で、世界のトップと、近くの競合をそれぞれ3つ選んで分析してください。各社の良い点と、まだ誰も手をつけていない見落としを表にまとめ、その見落としを私の仕事・活動で埋めるとしたら何ができるかを3つ提案してください。" },
  "逆算・発明の型": { lead: "ゴールから逆算し、新しいものを生む問いかけ", prompt: "1年後に私の仕事・活動がどうなっていたら最高か、先に一緒にゴールを決めてください。そのゴールから逆算して、まだ世の中にない新しいサービスや仕組みの案を3つ出し、それぞれ『今週やる最初の一手』まで落としてください。" }
};
// 回ごとのローテーション（3種類が一巡する。参加前の準備プロンプトも、その回の型を使う）
const KATA_ROTATION = { "第1回": "日常の型", "第2回": "分析・研究の型", "第3回": "逆算・発明の型", "第4回": "日常の型", "第5回": "分析・研究の型" };
// 困り事カテゴリ → いちばん合う型
const TROUBLE_KATA = {
  "時間が足りない・作業に追われる": "日常の型", "返信や連絡が追いつかない": "日常の型", "集客や発信が続かない": "分析・研究の型",
  "数字やお金の管理ができていない": "逆算・発明の型", "アイデアや企画が出ない": "分析・研究の型", "人に頼む・任せるのが苦手": "日常の型",
  "MUSEの使い方がまだよく分からない": "日常の型", "その他": "逆算・発明の型"
};
const STRENGTHEN = "練習：送る前に、このプロンプトに「誰のために」「どの数字で」「いつまでに」のどれか1つを書き足してみてください。問いが一段強くなり、返ってくる答えが変わります。";
const ORIGIN = "（このプロンプトの出どころ：超知能MUSE無料セミナー／講師 三浦公嗣）";
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
// その人に送る2本のプロンプト（困り事に合わせた1本＋今回の型の1本）
function buildPrompts_(o) {
  const cat = PROMPTS[o.trouble_cat] ? o.trouble_cat : "その他";
  let p1 = PROMPTS[cat];
  if (o.trouble) p1 += "\n私の状況はこうです：「" + o.trouble + "」この状況に合わせて、最初の一手から始めてください。";
  if (o.improve) p1 += "\n次回までに改善したいことは「" + o.improve + "」です。進み具合の確かめ方も付けてください。";
  const nextJob = o.reflect_next || o.next_ai;
  if (nextJob) p1 += "\n終わったら、私が次に任せたい仕事「" + nextJob + "」の進め方も提案してください。";
  if (o.want) p1 += "\nこのセミナーで私が一番得たいのは「" + o.want + "」です。それに近づく形にしてください。";
  const rot = KATA_ROTATION[o.kai] || "日常の型", fit = TROUBLE_KATA[cat] || "日常の型";
  let p2 = KATA[rot].prompt;
  if (nextJob && rot === "日常の型") p2 += "\n任せたい仕事の候補は「" + nextJob + "」です。";
  return [
    { title: "あなたの困り事に合わせた実践プロンプト（" + fit + "）", lead: KATA[fit].lead, text: p1 + "\n" + ORIGIN },
    { title: "今回の練習：" + rot, lead: KATA[rot].lead, text: p2 + "\n" + ORIGIN }
  ];
}

// ===== 毎朝6時：困り事に合わせたプロンプトメール =====
// 終了アンケート → 翌朝6時。参加前アンケート → 開催の前日の朝6時（前日を過ぎて答えた人は当日の朝6時。開催後は送らない）。
// 同じ人に同じ朝2通にならないよう、1人1通にまとめる。1日の上限（MailApp）に近づいたら残りは翌朝に回す。
function sendMorningPrompts() { return morning_(null, true); }
function morning_(onlyPid, send) {
  const today = ymd_(new Date()), out = [];
  const cands = [];
  rows_(SHEETS.survey).forEach(o => { if (!o.prompt_sent && o.email) cands.push(Object.assign(o, { _type: "終了" })); });
  rows_(SHEETS.pre).forEach(o => {
    if (o.prompt_sent || !o.email) return;
    const d = dateStr_(o.date), prep = prepDay_(d);
    if (!onlyPid && d && today > d) { setCell_(SHEETS.pre, o._row, "prompt_sent", "送らず（開催後）"); return; }
    if (!onlyPid && prep && today < prep) return; // まだ早い
    cands.push(Object.assign(o, { _type: "参加前" }));
  });
  const byPid = {};
  cands.filter(o => !onlyPid || String(o.pid) === String(onlyPid)).forEach(o => { const k = String(o.pid || normEmail_(o.email)); (byPid[k] = byPid[k] || []).push(o); });
  let sent = 0, left = 0;
  Object.keys(byPid).forEach(k => {
    const list = byPid[k].sort((a, b) => new Date(a.at) - new Date(b.at)), o = list[list.length - 1];
    if (send && MailApp.getRemainingDailyQuota() <= MAIL_RESERVE) { left++; return; }
    const m = morningMail_(o);
    out.push({ pid: o.pid, subject: m.subject, kata: m.kata });
    if (!send) return;
    MailApp.sendEmail({ to: String(o.email).trim(), subject: m.subject, htmlBody: m.html, name: MAIL_FROM_NAME });
    const now = new Date();
    list.forEach(x => setCell_(x._sheet, x._row, "prompt_sent", x === o ? now : "まとめて送信 " + Utilities.formatDate(now, "Asia/Tokyo", "M/d")));
    setCell_(o._sheet, o._row, "kata", m.kata);
    setCell_(o._sheet, o._row, "prompt_text", m.prompts.map(p => p.title + "\n" + p.text).join("\n\n"));
    sent++;
  });
  console.log("プロンプトメール送信: " + sent + "件" + (left ? "（上限のため " + left + "人は翌朝に回しました）" : ""));
  return { sent, left, mails: out };
}
function morningMail_(o) {
  const pid = o.pid, hist = history_(pid), n = +o.stage_n || 0, pre = o._type === "参加前";
  const prompts = buildPrompts_(o);
  const H = t => '<h3 style="color:#e8590c;margin:18px 0 4px">' + t + '</h3>';
  const box = t => '<p style="background:#fff3e8;padding:12px 14px;border-radius:8px;white-space:pre-wrap">' + esc_(t) + '</p>';
  const ns = nextSeminar_(pre ? dateStr_(o.date) : Utilities.formatDate(new Date(Date.now() + 864e5), "Asia/Tokyo", "yyyy-MM-dd"));
  let html = '<div style="font-family:sans-serif;line-height:1.8;color:#333;max-width:560px">'
    + '<p>' + esc_(o.name || "") + ' 様（参加者番号 ' + pid + '）</p>'
    + (pre
      ? '<p>お楽しみ様です！いよいよ「超知能MUSE無料セミナー」' + esc_(o.kai || "") + 'です。<br>参加前アンケートで教えてもらった困り事に合わせて、当日がスムーズになる準備プロンプトをお届けします。</p>' + needSetup_(o)
      : '<p>お楽しみ様です！昨日の「超知能MUSE無料セミナー」へのご参加、ありがとうございました。<br>アンケートで教えてもらった困り事に合わせて、今日すぐ使える実践プロンプトをお届けします。</p>')
    + H("あなたの困り事") + '<p>「' + esc_(o.trouble_cat || "その他") + '」' + (o.trouble ? '<br>' + esc_(o.trouble) : '') + '</p>'
    + prompts.map(p => H(esc_(p.title)) + '<p style="margin:0;color:#888;font-size:13px">' + esc_(p.lead) + '（そのままMUSEに貼ってください）</p>' + box(p.text)).join("")
    + '<p><b>' + esc_(STRENGTHEN) + '</b></p>'
    + H("あなたの現在地：ステップ " + n + " / 10") + '<p>' + diagnosis_(hist).lines.map(esc_).join("<br>") + '</p>'
    + '<p><a href="' + esc_(myUrl_(pid)) + '">' + BRAND + 'を開く（あなた専用のリンク）</a></p>'
    + (pre ? '<p>' + esc_(o.kai || "") + '：' + (dateStr_(o.date) ? jpDate_(dateStr_(o.date)) : "") + ' 20:00〜（Zoom）でお待ちしています。</p>'
      : H("次回のお知らせ") + '<p>' + esc_(NEXT_TEASER) + (ns ? '<br>' + ns.kai + '：' + jpDate_(ns.date) + ' 20:00〜（Zoom）<br><a href="' + esc_(preUrl_(ns.kai, ns.date, pid)) + '">' + ns.kai + 'の参加前アンケートに答える</a>' : '') + '</p>')
    + footer_();
  const subject = pre ? "【" + BRAND + "】" + (o.kai || "") + "がスムーズになる準備プロンプト（" + pid + "）" : "【" + BRAND + "】あなたの困り事に合わせた、今日の実践プロンプト（" + pid + "）";
  return { subject, html, prompts, kata: prompts.map(p => p.title.replace(/^.*[（：]/, "").replace("）", "")).join("／") };
}

// ===== 個人ページ（超知能活用力診断）用のデータ：本人の分だけ =====
function myData_(pid, k) {
  pid = String(pid || "").toUpperCase();
  if (!/^[MT]\d{3,}$/.test(pid) || !k || personalKey_(pid) !== k) return { ok: false, error: "リンクが正しくないようです。メールのリンクから開き直してください" };
  const m = sheet_(MASTER).getDataRange().getValues().find(r => r[0] === pid);
  if (!m) return { ok: false, error: "記録が見つかりません" };
  const hist = history_(pid), dg = diagnosis_(hist);
  const pick = o => { const r = { type: o._type, kai: o.kai || "", date: dateStr_(o.date), at: o.at instanceof Date ? Utilities.formatDate(o.at, "Asia/Tokyo", "yyyy-MM-dd HH:mm") : String(o.at), stage_n: +o.stage_n || 0, skill_score: +o.skill_score || 0 }; SKILLS.forEach(([s]) => r[s] = +o[s] || 0); return r; };
  const sentRows = rows_(SHEETS.pre).concat(rows_(SHEETS.survey)).filter(o => String(o.pid) === pid && o.prompt_sent instanceof Date && o.prompt_text).sort((a, b) => b.prompt_sent - a.prompt_sent);
  const lp = sentRows[0];
  const ns = nextSeminar_();
  return {
    ok: true, id: pid, name: m[1], records: hist.map(pick), comment: dg.lines, stages: STAGES, skills: SKILLS,
    prompt: lp ? { at: Utilities.formatDate(lp.prompt_sent, "Asia/Tokyo", "M月d日"), kata: lp.kata, text: lp.prompt_text, strengthen: STRENGTHEN } : null,
    schedule: SCHEDULE.map(s => ({ kai: s[0], date: s[1], label: jpDate_(s[1]) + " 20:00〜" })),
    next: ns ? { kai: ns.kai, date: ns.date, label: jpDate_(ns.date) + " 20:00〜（Zoom）", pre: preUrl_(ns.kai, ns.date, pid) } : null
  };
}

// ===== テスト用（テスト番号 T001〜 だけが対象） =====
// 合言葉つきで ?action=testmorning&id=T001 を開くと、その人の翌朝メールを今すぐ送る（日付の待ちを飛ばす）
function testMorning_(pid) {
  if (!/^T\d+$/.test(String(pid || ""))) return { ok: false, error: "テスト番号（T001など）だけが対象です" };
  return Object.assign({ ok: true }, morning_(pid, true));
}
// テストデータを全部消す：メールアドレスに +musetest を含む行と、T で始まる参加者番号をすべてのシートから消す
function deleteTestData() {
  let n = 0;
  [SHEETS.survey, SHEETS.pre, SHEETS.apply, MASTER].forEach(name => {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if (!sh) return;
    const v = sh.getDataRange().getValues(), head = v[0].map(String);
    const ec = name === MASTER ? 2 : head.indexOf("メールアドレス"), pc = name === MASTER ? 0 : head.indexOf("参加者ID");
    for (let i = v.length - 1; i >= 1; i--) {
      if ((ec >= 0 && IS_TEST(String(v[i][ec]))) || (pc >= 0 && /^T\d+$/.test(String(v[i][pc])))) { sh.deleteRow(i + 1); n++; }
    }
  });
  console.log("テストデータを " + n + " 行消しました");
}

// ===== 最初に1回だけ実行 =====
// メール送信などの許可 → 合言葉と個人リンク用の秘密の文字列を作る → 毎朝6時のトリガー → 合言葉を自分宛てにメール
function setup() {
  const p = props_();
  const rand = n => { let s = ""; while (s.length < n) s += Utilities.getUuid().replace(/-/g, ""); return s.slice(0, n); };
  let made = false;
  if (!p.getProperty("LINK_SECRET")) p.setProperty("LINK_SECRET", rand(48));
  if (!p.getProperty("READ_KEY")) { p.setProperty("READ_KEY", "muse-" + rand(12)); made = true; }
  [MASTER, SHEETS.pre, SHEETS.survey, SHEETS.apply].forEach(sheet_);
  setupMorningTrigger();
  const me = Session.getEffectiveUser().getEmail();
  if (made && me) MailApp.sendEmail({ to: me, subject: "【超知能MUSE】集計ページの合言葉（保管用）", name: MAIL_FROM_NAME, htmlBody: '<p>集計ページ ' + SITE + 'kekka.html の合言葉です。人に見せない場所に保管してください。</p><p style="font-size:18px"><b>' + p.getProperty("READ_KEY") + '</b></p><p>タイムゾーン：' + Session.getScriptTimeZone() + '／今日あと送れるメール：' + MailApp.getRemainingDailyQuota() + '通</p>' });
  console.log("準備OK。タイムゾーン: " + Session.getScriptTimeZone() + "／今日あと送れるメール: " + MailApp.getRemainingDailyQuota() + "通" + (made ? "／合言葉を " + me + " にメールしました" : ""));
}
// 毎朝6時台に sendMorningPrompts を自動実行するトリガーを作る（setup の中でも呼ばれる）
function setupMorningTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "sendMorningPrompts").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sendMorningPrompts").timeBased().everyDays(1).atHour(6).inTimezone("Asia/Tokyo").create();
  console.log("トリガーを設定しました（毎朝6時台・日本時間）");
}
function authorize() { setup(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
