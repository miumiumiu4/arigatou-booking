// パソコン教室 感想アンケート 受付スクリプト
// 使い方: 回答用スプレッドシート → 拡張機能 → Apps Script に貼り付け → デプロイ → ウェブアプリ（全員）
const SHEET = "回答";
const HEAD = ["受付日時","受講日","回","お名前","満足度(1-5)","難しさ(1-5)","スピード","サイトの進み具合","すすめたい度(0-10)","よかったところ","わかりにくかったところ","次に習いたいこと","次に習いたいこと(その他)","講師へひとこと","回答ID","端末"];
// 集計ページで回答を読むための合言葉（好きな言葉に変えてOK）
const READ_KEY = "arigatou";

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(HEAD); sh.setFrozenRows(1); }
  return sh;
}
function doPost(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const sh = sheet_();
    // 同じ回答の二重送信を防ぐ
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 15, sh.getLastRow() - 1, 1).getValues().flat() : [];
    if (ids.indexOf(d.id) < 0) {
      sh.appendRow([new Date(), d.date, d.kai, d.name, d.satisfaction, d.difficulty, d.pace, d.progress, d.recommend, d.good, d.hard, d.next, d.next_other, d.comment, d.id, d.ua]);
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}
function doGet(e) {
  if ((e.parameter.key || "") !== READ_KEY) return json_({ ok: false, error: "合言葉が違います" });
  const v = sheet_().getDataRange().getValues();
  const keys = ["at","date","kai","name","satisfaction","difficulty","pace","progress","recommend","good","hard","next","next_other","comment","id"];
  const rows = v.slice(1).map(r => {
    const o = {}; keys.forEach((k, i) => o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], "Asia/Tokyo", k === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm") : r[i]); return o;
  });
  return json_({ ok: true, rows });
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
