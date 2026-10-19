// パソコン教室 感想アンケート 受付スクリプト
// 使い方: 回答用スプレッドシート → 拡張機能 → Apps Script に貼り付け → デプロイ → ウェブアプリ（全員）
// 質問が増えても、知らない項目は自動で右端に列が足されるので、このスクリプトの貼り直しは不要です。
const SHEET = "回答";
// [送信データの項目名, シートの見出し]（並び順は既存のシートと同じ）
const COLS = [
  ["at","受付日時"],["date","受講日"],["kai","回"],["name","お名前"],["satisfaction","満足度(1-5)"],["difficulty","難しさ(1-5)"],
  ["pace","スピード"],["progress","サイトの進み具合"],["recommend","すすめたい度(0-10)"],["good","よかったところ"],["hard","わかりにくかったところ"],
  ["next","次に習いたいこと"],["next_other","次に習いたいこと(その他)"],["comment","講師へひとこと"],["id","回答ID"],["ua","端末"],
  ["possibility","感じた可能性"],["trouble","これまでの手間"],["email","メールアドレス"],
  ["t_clarity","講師:説明のわかりやすさ(1-5)"],["t_support","講師:質問・サポート(1-5)"],["t_mood","講師:雰囲気・話しやすさ(1-5)"]
];
// 集計ページで回答を読むための合言葉（公開リポジトリには本物を書かず、ここで書き換える）
const READ_KEY = "ここに合言葉を入れる";

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(COLS.map(c => c[1])); sh.setFrozenRows(1); }
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
    const sh = sheet_();
    let head = headers_(sh);
    // 新しい項目があれば右端に列を足す
    Object.keys(d).filter(k => k !== "type").forEach(k => {
      const l = labelOfKey_(k);
      if (head.indexOf(l) < 0) { head.push(l); sh.getRange(1, head.length).setValue(l); }
    });
    // 同じ回答の二重送信を防ぐ
    const idCol = head.indexOf("回答ID") + 1;
    const ids = idCol && sh.getLastRow() > 1 ? sh.getRange(2, idCol, sh.getLastRow() - 1, 1).getValues().flat() : [];
    if (ids.indexOf(d.id) < 0) sh.appendRow(head.map(l => { const v = d[keyOfLabel_(l)]; return v === undefined ? "" : v; }));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally { lock.releaseLock(); }
}
function doGet(e) {
  if ((e.parameter.key || "") !== READ_KEY) return json_({ ok: false, error: "合言葉が違います" });
  const v = sheet_().getDataRange().getValues();
  const keys = v[0].map(l => keyOfLabel_(String(l)));
  const rows = v.slice(1).map(r => {
    const o = {}; keys.forEach((k, i) => o[k] = r[i] instanceof Date ? Utilities.formatDate(r[i], "Asia/Tokyo", k === "date" ? "yyyy-MM-dd" : "yyyy-MM-dd HH:mm") : r[i]); return o;
  });
  return json_({ ok: true, rows });
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
