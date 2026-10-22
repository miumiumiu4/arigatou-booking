// 個別コンサル 成長アンケート 受付スクリプト（第2版：初回シート・毎回A〜G・講師の振り返り・成長レポート）
// 使い方: script.google.com のプロジェクト「個別コンサル 成長アンケート」にこのファイルを貼る → 保存 →
//   デプロイ → デプロイを管理 → 鉛筆 → バージョン「新バージョン」→ デプロイ（URLはそのまま）。
// 合言葉はスクリプト プロパティ ADMIN_KEY（公開リポジトリには書かない）。
// 書き起こしの分析・カルテ・レポート下書きは、毎晩の Claude がシートに直接書きます（このスクリプトはAIを呼びません）。
// シートは見出し（1行目）で読み書きします。知らない項目は右端に列が自動で足されます。
const SHEET_ID = "11a9a94h1RceOC80qIPbAYxGvP4unfsHJSj1g1MO9yi8";
const PASTE_FOLDER = "1QaY1uw1dMo80hKD8SmVFUdc5nx8-SWrA"; // 貼り付けた書き起こしの置き場（Zoom書き起こし）
const TABS = {
  people: ["名簿", ["id", "お名前", "カレンダーで探す言葉", "メモ", "登録日時", "区分", "コース", "Zoom表示名", "開始日", "同意日", "初回トークン"]],
  goals: ["ゴール", ["人id", "番号", "ゴール", "-2", "-1", "0", "+1", "+2", "設定日"]],
  first: ["初回", ["受付日時", "人id", "お名前", "強み_褒められる", "強み_時間を忘れる", "変わりたいこと", "止めているもの", "A1", "A2", "A3", "A4", "同意"]],
  sessions: ["回", ["sid", "作成日時", "人id", "お名前", "実施日", "台本タイトル", "台本URL", "範囲", "見出し(JSON)", "書き起こしID", "状態", "回数", "リフレクション回",
    "今日のふりかえり", "宣言", "振り返りの問い(JSON)", "準備日時"]],
  answers: ["回答", ["受付日時", "sid", "人id", "お名前", "実施日", "回数", "A1", "A2", "A3", "A4", "B結果", "B最善", "C小さな勝ち", "D気づき", "D次の一歩", "Eまだ",
    "F(JSON)", "G1", "G2", "G3", "G4", "G要望", "問いの答え(JSON)", "R変わったこと", "R強みの場面", "R周りの声", "Rゴール見直し", "端末"]],
  coach: ["講師", ["受付日時", "sid", "人id", "お名前", "実施日", "K1", "K2", "K3", "K4", "効いた問い", "次に変えること", "相手の現在地予想", "ひとこと"]],
  extracts: ["抽出", ["sid", "人id", "実施日", "作成日時", "抽出(JSON)", "講師(JSON)"]],
  karte: ["カルテ", ["sid", "人id", "お名前", "実施日", "信号", "カルテ", "作成日時"]],
  reports: ["レポート", ["rid", "人id", "お名前", "回数", "作成日時", "状態", "レポート(JSON)", "承認日時", "成長を実感(0-10)"]]
};
const FIRST_PEOPLE = [["mukai", "向井さん", "向井"], ["matsumoto", "松本さん", "松本"], ["akimoto", "秋元さん", "秋元"]];

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function tab_(k) {
  const [name, head] = TABS[k], ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1);
    if (k === "people") FIRST_PEOPLE.forEach(p => sh.appendRow([p[0], p[1], p[2], "", new Date()]));
  }
  // 見出しが足りなければ右端に足す（第1版のシートもそのまま使える）
  const have = headers_(sh), miss = head.filter(h => have.indexOf(h) < 0);
  if (miss.length) sh.getRange(1, have.length + 1, 1, miss.length).setValues([miss]);
  return sh;
}
function headers_(sh) { const n = sh.getLastColumn(); return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : []; }
function rows_(k) {
  const sh = tab_(k), v = sh.getDataRange().getValues(), h = v.shift().map(String);
  return v.map((r, i) => Object.assign(Object.fromEntries(h.map((x, j) => [x, r[j]])), { _row: i + 2 })).filter(r => r[h[0]] !== "");
}
function append_(k, obj) {
  const sh = tab_(k); let h = headers_(sh);
  const miss = Object.keys(obj).filter(x => h.indexOf(x) < 0);
  if (miss.length) { sh.getRange(1, h.length + 1, 1, miss.length).setValues([miss]); h = h.concat(miss); }
  sh.appendRow(h.map(x => obj[x] === undefined ? "" : obj[x]));
}
function update_(k, row, obj) {
  const sh = tab_(k), h = headers_(sh);
  Object.keys(obj).forEach(x => { const c = h.indexOf(x); if (c >= 0) sh.getRange(row, c + 1).setValue(obj[x]); });
}
const out_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const ymd_ = d => d instanceof Date ? Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd") : String(d || "");
const json_ = (s, d) => { try { return JSON.parse(s || ""); } catch (_) { return d; } };
const token_ = () => Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
function isAdmin_(key) { const k = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY"); return !!k && key === k; }
const plain_ = r => { const o = {}; Object.keys(r).forEach(k => { if (k !== "_row") o[k] = r[k] instanceof Date ? (k.match(/日$/) ? ymd_(r[k]) : r[k].toISOString()) : r[k]; }); return o; };

// 台本の見出しを読む。「0｜」「①｜」のような番号つき見出しを区切りにする（無ければ見出し2→見出し1）
function headings_(docId) {
  const doc = DocumentApp.openById(docId), H = DocumentApp.ParagraphHeading;
  const items = doc.getBody().getParagraphs().filter(p => p.getHeading() !== H.NORMAL).map(p => ({ t: p.getText().trim(), h: p.getHeading() })).filter(x => x.t);
  const skip = /台本の見方|全体の流れ|今日の流れ|地図|このあとの進み方|^休憩/;
  let picked = items.filter(x => /^[0-9０-９①-⑳]+\s*[｜|]/.test(x.t));
  if (picked.length < 2) picked = items.filter(x => x.h === H.HEADING2 && !skip.test(x.t));
  if (picked.length < 2) picked = items.filter(x => x.h === H.HEADING1 && !skip.test(x.t)).slice(1);
  return { title: doc.getName(), list: picked.map(x => x.t) };
}
const docIds_ = s => [...new Set((String(s || "").match(/docs\.google\.com\/document\/d\/[\w-]+/g) || []).map(m => m.split("/d/")[1]))];
function candidates_(person) {
  const now = new Date(), from = new Date(now.getTime() - 21 * 864e5), to = new Date(now.getTime() + 2 * 864e5);
  const word = person["カレンダーで探す言葉"] || String(person["お名前"]).replace(/さん$/, "");
  const evs = CalendarApp.getDefaultCalendar().getEvents(from, to).filter(e => e.getTitle().indexOf(word) >= 0).reverse().slice(0, 4);
  return evs.map(e => ({
    date: ymd_(e.getStartTime()), title: e.getTitle(),
    docs: docIds_(e.getDescription()).slice(0, 6).map(id => { try { return { id, name: DocumentApp.openById(id).getName() }; } catch (_) { return null; } }).filter(Boolean)
  })).filter(c => c.docs.length);
}

// 本人の「回数」は、答えた回＋この回で数える（台本の章ではなく、実際に受けた回で数える）
function sessionForAnswer_(s) {
  const pid = s["人id"], ans = rows_("answers").filter(a => a["人id"] === pid);
  const prevAns = ans.filter(a => a.sid !== s.sid && ymd_(a["実施日"]) <= ymd_(s["実施日"])).pop();
  const n = Number(s["回数"]) || (new Set(ans.filter(a => a.sid !== s.sid).map(a => a.sid)).size + 1);
  const prevSes = prevAns ? rows_("sessions").find(x => x.sid === prevAns.sid) : null;
  const goals = rows_("goals").filter(g => g["人id"] === pid).map(g => ({ no: g["番号"], goal: g["ゴール"], steps: ["-2", "-1", "0", "+1", "+2"].map(k => String(g[k] || "")) }));
  const person = rows_("people").find(p => p.id === pid) || {};
  return {
    ok: true, name: s["お名前"], date: ymd_(s["実施日"]), title: s["台本タイトル"], range: s["範囲"], n,
    reflect: s["リフレクション回"] === true || s["リフレクション回"] === "TRUE" || (!s["リフレクション回"] && n % 3 === 0),
    ready: s["状態"] === "準備完了", summary: s["今日のふりかえり"] || "", vow: s["宣言"] || "",
    asks: json_(s["振り返りの問い(JSON)"], []),
    prevVow: [prevAns ? prevAns["D次の一歩"] : "", prevSes ? prevSes["宣言"] : ""].filter(Boolean).join(" ／ "),
    goals, course: person["コース"] || "個別", done: ans.some(a => a.sid === s.sid)
  };
}

function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.a === "session") {
      const s = rows_("sessions").find(r => r.sid === p.s);
      return out_(s ? sessionForAnswer_(s) : { ok: false, error: "notfound" });
    }
    if (p.a === "first") {
      const person = p.t && rows_("people").find(r => r["初回トークン"] === p.t);
      if (!person) return out_({ ok: false, error: "notfound" });
      const goals = rows_("goals").filter(g => g["人id"] === person.id).map(plain_);
      return out_({ ok: true, name: person["お名前"], goals, done: rows_("first").some(f => f["人id"] === person.id) });
    }
    if (p.a === "report") { // 承認済みだけ見える（合言葉があれば承認前の下書きも見える）
      const r = p.r && rows_("reports").find(x => x.rid === p.r && (x["状態"] === "承認済み" || isAdmin_(p.key)));
      if (!r) return out_({ ok: false, error: "notfound" });
      const pid = r["人id"], upto = Number(r["回数"]) || 99;
      const ans = rows_("answers").filter(a => a["人id"] === pid && (Number(a["回数"]) || 0) <= upto);
      const last = {}; ans.forEach(a => last[a.sid] = a);
      const series = Object.values(last).sort((x, y) => (Number(x["回数"]) || 0) - (Number(y["回数"]) || 0)).map(a => ({
        n: a["回数"], date: ymd_(a["実施日"]), A1: a.A1, A2: a.A2, A3: a.A3, A4: a.A4, B: a["B結果"], Bbest: a["B最善"], C: a["C小さな勝ち"], F: json_(a["F(JSON)"], []) }));
      const first = rows_("first").filter(f => f["人id"] === pid).pop();
      const goals = rows_("goals").filter(g => g["人id"] === pid).map(g => ({ no: g["番号"], goal: g["ゴール"], steps: ["-2", "-1", "0", "+1", "+2"].map(k => String(g[k] || "")) }));
      return out_({ ok: true, name: r["お名前"], n: r["回数"], state: r["状態"], report: json_(r["レポート(JSON)"], {}), series, goals,
        start: first ? { A1: first.A1, A2: first.A2, A3: first.A3, A4: first.A4 } : null });
    }
    if (!isAdmin_(p.key)) return out_({ ok: false, error: "key" });
    if (p.a === "people") return out_({ ok: true, people: rows_("people").map(plain_) });
    if (p.a === "cands") {
      const person = rows_("people").find(r => r.id === p.pid);
      return out_({ ok: true, cands: person ? candidates_(person) : [] });
    }
    if (p.a === "heads") { const id = docIds_(p.url)[0] || p.url; return out_({ ok: true, id, ...headings_(id) }); }
    if (p.a === "records") {
      const all = {}; ["people", "goals", "first", "sessions", "answers", "coach", "karte", "reports"].forEach(k => all[k] = rows_(k).map(plain_));
      all.extracts = rows_("extracts").map(r => ({ sid: r.sid, "人id": r["人id"], "実施日": ymd_(r["実施日"]), "講師(JSON)": r["講師(JSON)"] }));
      return out_({ ok: true, ...all });
    }
    return out_({ ok: false, error: "unknown" });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.type === "answer") {
      const s = rows_("sessions").find(r => r.sid === d.sid);
      if (!s) return out_({ ok: false, error: "notfound" });
      const info = sessionForAnswer_(s), a = Object.assign({}, d.a || {});
      const extra = { "F(JSON)": JSON.stringify(a.F || []), "問いの答え(JSON)": JSON.stringify(a.asks || []) };
      Object.keys(a).forEach(k => { if (TABS.answers[1].indexOf(k) < 0 || /^(受付日時|sid|人id|お名前|実施日|回数|端末)$/.test(k)) delete a[k]; else a[k] = String(a[k]).slice(0, 3000); });
      append_("answers", Object.assign({ "受付日時": new Date(), sid: d.sid, "人id": s["人id"], "お名前": s["お名前"], "実施日": s["実施日"], "回数": info.n, "端末": String(d.ua || "").slice(0, 200) }, a, extra));
      return out_({ ok: true });
    }
    if (d.type === "first") {
      const person = d.t && rows_("people").find(r => r["初回トークン"] === d.t);
      if (!person) return out_({ ok: false, error: "notfound" });
      const a = d.a || {};
      append_("first", { "受付日時": new Date(), "人id": person.id, "お名前": person["お名前"], "強み_褒められる": a.s1 || "", "強み_時間を忘れる": a.s2 || "",
        "変わりたいこと": a.want || "", "止めているもの": a.block || "", A1: a.A1, A2: a.A2, A3: a.A3, A4: a.A4, "同意": a.agree ? "同意する" : "" });
      if (a.agree) update_("people", person._row, { "同意日": new Date() });
      if (!person["開始日"]) update_("people", person._row, { "開始日": new Date() });
      return out_({ ok: true });
    }
    if (d.type === "feel") { // 成長レポートの「成長を実感した」1問
      const r = rows_("reports").find(x => x.rid === d.r && x["状態"] === "承認済み");
      if (r) update_("reports", r._row, { "成長を実感(0-10)": d.v });
      return out_({ ok: !!r });
    }
    if (!isAdmin_(d.key)) return out_({ ok: false, error: "key" });
    if (d.type === "session") {
      const person = rows_("people").find(r => r.id === d.pid);
      if (!person) return out_({ ok: false, error: "person" });
      let docId = "";
      if (d.transcript) { // 貼り付け・ファイルの書き起こしをドキュメントにしてZoom書き起こしフォルダへ
        const doc = DocumentApp.create(`${d.date.replace(/-/g, "-")}_貼り付け_${person["お名前"]}_書き起こし`);
        doc.getBody().setText(String(d.transcript).slice(0, 900000)); doc.saveAndClose();
        DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(PASTE_FOLDER)); docId = doc.getId();
      }
      const sid = Utilities.getUuid().replace(/-/g, "").slice(0, 12);
      append_("sessions", { sid, "作成日時": new Date(), "人id": d.pid, "お名前": person["お名前"], "実施日": d.date, "台本タイトル": d.title || "", "台本URL": d.url || "",
        "範囲": d.range || "", "見出し(JSON)": JSON.stringify(d.list || []), "書き起こしID": docId, "状態": "書き起こし待ち" });
      return out_({ ok: true, sid, consent: !!person["同意日"] });
    }
    if (d.type === "person") {
      const name = String(d.name || "").trim(); if (!name) return out_({ ok: false, error: "name" });
      const id = "p" + Utilities.getUuid().slice(0, 6);
      append_("people", { id, "お名前": /さん$/.test(name) ? name : name + "さん", "カレンダーで探す言葉": d.word || name.replace(/さん$/, ""), "登録日時": new Date(),
        "区分": d.kind || "加盟", "コース": d.course || "個別", "Zoom表示名": d.zoom || "" });
      return out_({ ok: true, id });
    }
    if (d.type === "firstlink") { // 初回シートのリンクを作る（推測されにくい鍵つき）
      const person = rows_("people").find(r => r.id === d.pid);
      if (!person) return out_({ ok: false, error: "person" });
      const t = person["初回トークン"] || token_();
      if (!person["初回トークン"]) update_("people", person._row, { "初回トークン": t });
      return out_({ ok: true, t });
    }
    if (d.type === "goals") { // ゴールの階段（三浦さんと一緒に決める）
      const sh = tab_("goals"), old = rows_("goals").filter(g => g["人id"] === d.pid).map(g => g._row).sort((a, b) => b - a);
      old.forEach(r => sh.deleteRow(r));
      (d.goals || []).filter(g => g.goal).forEach((g, i) => append_("goals", { "人id": d.pid, "番号": i + 1, "ゴール": g.goal, "-2": g.s[0], "-1": g.s[1], "0": g.s[2], "+1": g.s[3], "+2": g.s[4], "設定日": new Date() }));
      return out_({ ok: true });
    }
    if (d.type === "coach") {
      const s = rows_("sessions").find(r => r.sid === d.sid);
      if (!s) return out_({ ok: false, error: "notfound" });
      append_("coach", Object.assign({ "受付日時": new Date(), sid: d.sid, "人id": s["人id"], "お名前": s["お名前"], "実施日": s["実施日"] }, d.a || {}));
      return out_({ ok: true });
    }
    if (d.type === "approve") { // 成長レポートの承認（三浦さんが押す）
      const r = rows_("reports").find(x => x.rid === d.rid);
      if (!r) return out_({ ok: false, error: "notfound" });
      update_("reports", r._row, { "状態": "承認済み", "承認日時": new Date() });
      return out_({ ok: true });
    }
    return out_({ ok: false, error: "unknown" });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
  finally { lock.releaseLock(); }
}

// 最初に1回だけ実行すると、許可の確認が出て、タブが作られます
function setup() { Object.keys(TABS).forEach(tab_); CalendarApp.getDefaultCalendar(); DriveApp.getRootFolder(); }
