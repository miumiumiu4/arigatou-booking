// 受付（Google Apps Script）のURLは config.json に入れる
async function gasUrl() {
  try { const r = await fetch("config.json?t=" + Date.now(), { cache: "no-store" }); return (await r.json()).GAS_URL || ""; } catch (_) { return ""; }
}
async function apiGet(params) {
  const url = await gasUrl(); if (!url) throw new Error("まだ受付の準備中です");
  const r = await fetch(url + "?" + new URLSearchParams(params));
  return r.json();
}
async function apiPost(data) {
  const url = await gasUrl(); if (!url) throw new Error("まだ受付の準備中です");
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(data) });
  return r.json();
}
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const md = d => { const m = String(d || "").match(/(\d{4})-(\d\d)-(\d\d)/); return m ? `${+m[2]}/${+m[3]}` : String(d || ""); };
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ""; localStorage.setItem(k, v); } catch (_) { return ""; } }
