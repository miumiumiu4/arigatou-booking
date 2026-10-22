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
// 0〜10 などの数字ボタン
const scale = (name, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `<label><input type="radio" name="${esc(name)}" value="${from + i}">${from + i}</label>`).join("");
const num = v => (v === "" || v == null || isNaN(+v)) ? null : +v;
// 線グラフ（横＝回、縦＝点数）。点に触れると数字が出る。series: [[項目名, 色, 表示名], ...]
function lineChart(el, rows, series, lo, hi, xlab) {
  const W = 380, H = 200, L = 26, Rr = 10, T = 10, B = 26, n = rows.length;
  const x = i => n === 1 ? (L + W - Rr) / 2 : L + (W - L - Rr) * i / (n - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let g = "";
  const tk = hi - lo > 10 ? (hi - lo) / 4 : hi - lo > 5 ? 2 : 1;
  for (let v = lo; v <= hi; v += tk) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="var(--muted)">${v}</text>`;
  const step = Math.ceil(n / 5);
  rows.forEach((r, i) => { if (i % step === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="${n > 1 && i === n - 1 ? "end" : n > 1 && i === 0 ? "start" : "middle"}" font-size="12" fill="var(--muted)">${esc(xlab(r, i))}</text>`; });
  series.forEach(([k, col]) => {
    const pts = rows.map((r, i) => [i, num(typeof k === "function" ? k(r) : r[k])]).filter(p => p[1] != null);
    if (pts.length > 1) g += `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" points="${pts.map(p => x(p[0]) + "," + y(p[1])).join(" ")}"/>`;
    g += pts.map(p => `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="4.5" fill="${col}" stroke="var(--bg)" stroke-width="2"/>`).join("");
  });
  rows.forEach((r, i) => g += `<rect x="${x(i) - 16}" y="0" width="32" height="${H}" fill="transparent" data-i="${i}"/>`);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg><div class="tip hide"></div>`;
  const tip = el.querySelector(".tip");
  el.querySelectorAll("rect").forEach(r => {
    const show = () => { const row = rows[+r.dataset.i];
      tip.innerHTML = `<b>${esc(xlab(row, +r.dataset.i))}</b><br>` + series.map(([k, , lab]) => { const v = typeof k === "function" ? k(row) : row[k]; return `${esc(lab)}: ${esc(v === "" || v == null ? "—" : v)}`; }).join("<br>");
      const bx = el.getBoundingClientRect(), rb = r.getBoundingClientRect(); tip.classList.remove("hide");
      tip.style.left = Math.min(Math.max(0, rb.left - bx.left + rb.width / 2 - tip.offsetWidth / 2), bx.width - tip.offsetWidth) + "px"; tip.style.top = "0px"; };
    r.onmouseenter = show; r.onclick = show; r.onmouseleave = () => tip.classList.add("hide");
  });
}
const legend = series => `<div class="legend">${series.map(([, c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join("")}</div>`;
