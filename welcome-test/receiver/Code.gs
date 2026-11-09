/**
 * 【テスト】予約フォームの受け口
 *
 * welcome-test/（予約フォームのテスト版）から送られた予約を、このスクリプトを付けたシート
 * 「【テスト】予約フォームの受け口」のタブ「テスト予約」に1件1行で書くだけの受け口。
 *
 *  - 本番の予約台帳（読者限定キャンペーン予約管理）・本番の予約 GAS には一切触らない
 *  - メールは送らない（お客様にも店にも届かない）。MailApp / GmailApp は使っていない
 *  - シートは getActiveSpreadsheet で決まるので、ID はどこにも書かない
 *  - 戻り値は本番と同じ形 { ok: true, id: 'T1109-001' }（T で始まるのでテストだと分かる）
 */

var TEST_RECV = {
  SHEET: 'テスト予約',
  HEAD: ['受付日時', '受付番号', 'お名前', 'ふりがな', '電話', 'メール', '郵便番号', '住所', '台数', '概算（円）', '内訳', '備考（希望日など）', 'どこから', '送られた中身（全部）'],
  MAX_JSON: 45000 // セル1つに入る長さ（50,000字）より短く
};

function doGet() {
  return ContentService.createTextOutput('【テスト】予約フォームの受け口です（送るのは POST だけ）');
}

function doPost(e) {
  var data = {};
  try { data = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return trOut_({ ok: false, error: 'bad_json' }); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return trOut_({ ok: false, error: 'bad_json' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return trOut_({ ok: false, error: 'busy' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(TEST_RECV.SHEET);
    if (!sh) {
      sh = ss.insertSheet(TEST_RECV.SHEET);
      sh.appendRow(TEST_RECV.HEAD);
      sh.setFrozenRows(1);
    }
    var now = new Date();
    var id = trNextId_(sh, now);
    sh.appendRow(trRow_(data, id, now));
    return trOut_({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}

/** 受付番号：T + 月日 + その日の連番（例 T1109-001） */
function trNextId_(sh, now) {
  var day = 'T' + Utilities.formatDate(now, 'Asia/Tokyo', 'MMdd') + '-';
  var n = 0;
  var last = sh.getLastRow();
  if (last > 1) {
    sh.getRange(2, 2, last - 1, 1).getValues().forEach(function (r) {
      var s = String(r[0]);
      if (s.indexOf(day) === 0) n = Math.max(n, parseInt(s.slice(day.length), 10) || 0);
    });
  }
  return day + ('00' + (n + 1)).slice(-3);
}

/** 送られた中身 → 1行 */
function trRow_(d, id, now) {
  var json = JSON.stringify(d);
  if (json.length > TEST_RECV.MAX_JSON) json = json.slice(0, TEST_RECV.MAX_JSON) + '…（長すぎて切った）';
  return [
    now, id,
    trCell_(d.name), trCell_(d.kana), trCell_(d.phone), trCell_(d.email), trCell_(d.zip), trCell_(d.address),
    Number(d.units) || 0, Number(d.total) || 0,
    trCell_(d.breakdown, 2000), trCell_(d.note, 5000), trCell_(d.src, 300),
    trCell_(json, TEST_RECV.MAX_JSON + 20)
  ];
}

/** 文字列にして長さを切り、数式に化けないよう先頭の = + - @ を無害にする */
function trCell_(v, max) {
  if (v === undefined || v === null) return '';
  var s = String(v).slice(0, max || 300);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function trOut_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
