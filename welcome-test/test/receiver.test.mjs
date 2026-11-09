// 受け口（receiver/Code.gs）を、Google の部品を真似たもので動かして確かめる。
//   node welcome-test/test/receiver.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('../receiver/Code.gs', import.meta.url), 'utf8');
assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\//g, ''), /MailApp|GmailApp|openById|UrlFetchApp/, 'メール・ほかのシート・外への送信は使わない');

function load() {
  const sheets = {};
  const mkSheet = () => { const rows = []; return { rows, appendRow: r => rows.push(r), setFrozenRows() {}, getLastRow: () => rows.length,
    getRange: (r, c, n) => ({ getValues: () => rows.slice(r - 1, r - 1 + n).map(x => [x[c - 1]]) }) }; };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet()) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d, tz, f) => f === 'MMdd' ? '1109' : '' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
    JSON, Date, String, Number, Math, Array, parseInt,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, sheets };
}

const { ctx, sheets } = load();
const post = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).s);

const a = post({ name: '=テスト 太郎', phone: '09000000000', units: 2, total: 17800, breakdown: '【通常予約】…', note: '【希望日】…', src: 'welcome-test' });
assert.deepEqual(a, { ok: true, id: 'T1109-001' });
const b = post({ name: 'テスト 花子', units: 1 });
assert.equal(b.id, 'T1109-002');
const sh = sheets['テスト予約'];
assert.equal(sh.rows.length, 3, '見出し＋2件');
assert.equal(sh.rows[0][0], '受付日時');
assert.equal(sh.rows[1][2], "'=テスト 太郎", '数式に化けない');
assert.equal(sh.rows[1][8], 2);
assert.equal(sh.rows[1][9], 17800);
assert.match(sh.rows[1][13], /"phone":"09000000000"/);
assert.deepEqual(post('こわれた'), { ok: false, error: 'bad_json' });
assert.deepEqual(post('[1]'), { ok: false, error: 'bad_json' });
assert.equal(sh.rows.length, 3, 'こわれた送信は書かない');
console.log('OK: 受け口のテスト 全部通った');
