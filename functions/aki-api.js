// 予約ページの空き○×の「中継」（Cloudflare Pages Functions。道は /aki-api）。2026-11-26
//   11/26 小規模テスト：Google アカウントが複数ログインしている Chrome などで、ページから Google の窓口を
//   直接読みに行くと止められ、「いま空きを読めません」になった。→ ページはまずこの中継（同じ住所）に聞き、
//   中継が Google の窓口へ聞く（お客様のブラウザのログインに左右されない）。中継が使えない時は、ページは今までどおり直接聞く。
// 守り：行き先は script.google.com の /macros/s/<番号>/exec だけ。本番の予約の受け口の番号は通さない。
//   GET は availability だけ。POST は aki.hold だけ（中身は 4KB まで）。何も覚えない・記録しない。
const EXEC_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const PROD_RE = /^https:\/\/script\.google\.com\/macros\/s\/AKfycbwzgjuZ_[A-Za-z0-9_-]+\/exec$/;

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function onRequest(ctx) {
  const req = ctx.request, url = new URL(req.url);
  const u = url.searchParams.get('u') || '';
  if (!EXEC_RE.test(u) || PROD_RE.test(u)) return json({ ok: false, error: 'bad_target' }, 400);
  try {
    if (req.method === 'GET') {
      const q = new URLSearchParams();
      if (url.searchParams.get('action') !== 'availability') return json({ ok: false, error: 'bad_action' }, 400);
      ['action', 'zip', 'units', 'auto', 'tenkase', 'amount'].forEach(k => { const v = url.searchParams.get(k); if (v !== null) q.set(k, v.slice(0, 20)); });
      const r = await fetch(u + '?' + q.toString(), { redirect: 'follow' });
      const t = await r.text();
      try { return json(JSON.parse(t)); } catch (_) { return json({ ok: false, error: 'upstream' }, 502); }
    }
    if (req.method === 'POST') {
      const body = await req.text();
      if (body.length > 4096) return json({ ok: false, error: 'too_large' }, 413);
      let d; try { d = JSON.parse(body); } catch (_) { return json({ ok: false, error: 'bad_body' }, 400); }
      if (!d || d.kind !== 'aki.hold') return json({ ok: false, error: 'bad_kind' }, 400);
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' });
      const t = await r.text();
      try { return json(JSON.parse(t)); } catch (_) { return json({ ok: false, error: 'upstream' }, 502); }
    }
    return json({ ok: false, error: 'method' }, 405);
  } catch (e) {
    return json({ ok: false, error: 'relay' }, 502);
  }
}
