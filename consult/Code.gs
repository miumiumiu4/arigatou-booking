// 個別コンサル 成長アンケート 受付スクリプト
// 使い方: script.google.com で新しいプロジェクト → このファイルを貼る → プロジェクトの設定 → スクリプト プロパティに
//   ADMIN_KEY = 合言葉（三浦さんだけが知る言葉。公開リポジトリには書かない）
// を足す → デプロイ → ウェブアプリ（実行: 自分 / アクセス: 全員）。
// 名簿・回・回答のタブは最初の呼び出しで自動で作られます。
const SHEET_ID = "11a9a94h1RceOC80qIPbAYxGvP4unfsHJSj1g1MO9yi8";
const TABS = {
  people: ["id", "お名前", "カレンダーで探す言葉", "メモ", "登録日時"],
  sessions: ["sid", "作成日時", "人id", "お名前", "実施日", "台本タイトル", "台本URL", "範囲", "見出し(JSON)"],
  answers: ["受付日時", "sid", "人id", "お名前", "実施日", "範囲", "わかった度(平均)", "やれそう度(平均)", "満足度(1-5)", "自信(0-10)",
    "前回の宿題", "前回の宿題ひとこと", "今日の気づき", "次回までにやること", "聞きたいこと", "見出しごと(JSON)", "端末"]
};
const TAB_NAMES = { people: "名簿", sessions: "回", answers: "回答" };
const FIRST_PEOPLE = [["mukai", "向井さん", "向井"], ["matsumoto", "松本さん", "松本"], ["akimoto", "秋元さん", "秋元"]];

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function tab_(k) {
  const ss = ss_();
  let sh = ss.getSheetByName(TAB_NAMES[k]);
  if (!sh) {
    sh = ss.insertSheet(TAB_NAMES[k]);
    sh.appendRow(TABS[k]); sh.setFrozenRows(1);
    if (k === "people") FIRST_PEOPLE.forEach(p => sh.appendRow([p[0], p[1], p[2], "", new Date()]));
    const def = ss.getSheetByName("シート1") || ss.getSheetByName("Sheet1"); if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  }
  return sh;
}
function rows_(k) {
  const v = tab_(k).getDataRange().getValues(); const h = v.shift();
  return v.filter(r => r[0] !== "").map(r => Object.fromEntries(h.map((x, i) => [x, r[i]])));
}
const out_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const ymd_ = d => d instanceof Date ? Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd") : String(d || "");
function isAdmin_(key) { const k = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY"); return !!k && key === k; }

// 台本の見出しを読む。「0｜」「①｜」のような番号つき見出しを区切りにする（無ければ見出し2→見出し1）
function headings_(docId) {
  const doc = DocumentApp.openById(docId);
  const ps = doc.getBody().getParagraphs().filter(p => p.getHeading() !== DocumentApp.ParagraphHeading.NORMAL);
  const H = DocumentApp.ParagraphHeading;
  const items = ps.map(p => ({ t: p.getText().trim(), h: p.getHeading() })).filter(x => x.t);
  const skip = /台本の見方|全体の流れ|今日の流れ|地図|このあとの進み方|^休憩/;
  let picked = items.filter(x => /^[0-9０-９①-⑳]+\s*[｜|]/.test(x.t));
  if (picked.length < 2) picked = items.filter(x => x.h === H.HEADING2 && !skip.test(x.t));
  if (picked.length < 2) picked = items.filter(x => x.h === H.HEADING1 && !skip.test(x.t)).slice(1);
  return { title: doc.getName(), list: picked.map(x => x.t) };
}
const docIds_ = s => [...new Set((String(s || "").match(/docs\.google\.com\/document\/d\/[\w-]+/g) || []).map(m => m.split("/d/")[1]))];

// 最近の予定から、その人の台本の候補を探す
function candidates_(person) {
  const now = new Date(), from = new Date(now.getTime() - 21 * 864e5), to = new Date(now.getTime() + 2 * 864e5);
  const word = person["カレンダーで探す言葉"] || String(person["お名前"]).replace(/さん$/, "");
  const evs = CalendarApp.getDefaultCalendar().getEvents(from, to).filter(e => e.getTitle().indexOf(word) >= 0).reverse().slice(0, 4);
  return evs.map(e => ({
    date: ymd_(e.getStartTime()), title: e.getTitle(),
    docs: docIds_(e.getDescription()).slice(0, 6).map(id => { try { return { id, name: DocumentApp.openById(id).getName() }; } catch (_) { return null; } }).filter(Boolean)
  })).filter(c => c.docs.length);
}

function doGet(e) {
  const p = e.parameter || {};
  try {
    // 本人用: アンケートの中身（見出し・前回の宿題）だけを返す
    if (p.a === "session") {
      const s = rows_("sessions").find(r => r.sid === p.s);
      if (!s) return out_({ ok: false, error: "notfound" });
      const done = rows_("answers").some(r => r.sid === p.s);
      const prev = rows_("answers").filter(r => r["人id"] === s["人id"] && r.sid !== p.s && ymd_(r["実施日"]) <= ymd_(s["実施日"])).pop();
      return out_({ ok: true, name: s["お名前"], date: ymd_(s["実施日"]), title: s["台本タイトル"], range: s["範囲"],
        list: JSON.parse(s["見出し(JSON)"] || "[]"), prevTodo: prev ? prev["次回までにやること"] : "", done });
    }
    if (!isAdmin_(p.key)) return out_({ ok: false, error: "key" });
    if (p.a === "people") return out_({ ok: true, people: rows_("people") });
    if (p.a === "cands") {
      const person = rows_("people").find(r => r.id === p.pid);
      return out_({ ok: true, cands: person ? candidates_(person) : [] });
    }
    if (p.a === "heads") {
      const id = docIds_(p.url)[0] || p.url;
      return out_({ ok: true, id, ...headings_(id) });
    }
    if (p.a === "records") {
      const ans = rows_("answers").map(r => ({ ...r, "実施日": ymd_(r["実施日"]), "受付日時": String(r["受付日時"]) }));
      const ses = rows_("sessions").map(r => ({ sid: r.sid, pid: r["人id"], name: r["お名前"], date: ymd_(r["実施日"]), title: r["台本タイトル"], url: r["台本URL"], range: r["範囲"], answered: ans.some(a => a.sid === r.sid) }));
      return out_({ ok: true, people: rows_("people"), sessions: ses, answers: ans });
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
      const items = d.items || [];
      const avg = k => { const v = items.map(x => Number(x[k])).filter(n => n > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : ""; };
      tab_("answers").appendRow([new Date(), d.sid, s["人id"], s["お名前"], s["実施日"], s["範囲"], avg("u"), avg("c"), d.sat || "", d.conf === "" ? "" : d.conf,
        d.prev || "", d.prevNote || "", d.insight || "", d.todo || "", d.ask || "", JSON.stringify(items), String(d.ua || "").slice(0, 200)]);
      return out_({ ok: true });
    }
    if (!isAdmin_(d.key)) return out_({ ok: false, error: "key" });
    if (d.type === "session") {
      const person = rows_("people").find(r => r.id === d.pid);
      if (!person) return out_({ ok: false, error: "person" });
      const sid = Utilities.getUuid().replace(/-/g, "").slice(0, 12);
      tab_("sessions").appendRow([sid, new Date(), d.pid, person["お名前"], d.date, d.title || "", d.url || "", d.range || "", JSON.stringify(d.list || [])]);
      return out_({ ok: true, sid });
    }
    if (d.type === "person") {
      const name = String(d.name || "").trim(); if (!name) return out_({ ok: false, error: "name" });
      const id = "p" + Utilities.getUuid().slice(0, 6);
      tab_("people").appendRow([id, /さん$/.test(name) ? name : name + "さん", d.word || name.replace(/さん$/, ""), d.memo || "", new Date()]);
      return out_({ ok: true, id });
    }
    return out_({ ok: false, error: "unknown" });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
  finally { lock.releaseLock(); }
}

// 最初に1回だけ実行すると、許可の確認が出て、タブが作られます
function setup() { ["people", "sessions", "answers"].forEach(tab_); CalendarApp.getDefaultCalendar(); DocumentApp.getActiveDocument; }
