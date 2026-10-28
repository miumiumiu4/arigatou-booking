// 流入経路の記録（広告分析用）。最初に来たときの utm_*・広告クリックID・参照元を端末に覚えておき、回答と一緒に送る。
// 個人を追いかける情報は取らない（クリックIDは広告の成果計測用、参照元はドメインだけ）。
(function () {
  const KEY = "muse_attr_v1", T0 = Date.now();
  const p = new URLSearchParams(location.search);
  const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const click = p.get("fbclid") ? "fbclid:" + p.get("fbclid") : p.get("gclid") ? "gclid:" + p.get("gclid") : p.get("yclid") ? "yclid:" + p.get("yclid") : p.get("ldtag_cl") ? "line:" + p.get("ldtag_cl") : "";
  let ref = ""; try { const h = document.referrer ? new URL(document.referrer).hostname : ""; ref = h && h !== location.hostname ? h : ""; } catch (_) {}
  const now = { ref: ref, click_id: click.slice(0, 120), landing: location.pathname.split("/").pop() || "index.html", first_seen: new Date().toISOString() };
  UTM.forEach(k => { if (p.get(k)) now[k] = p.get(k).slice(0, 100); });
  if (p.get("src")) now.utm_source = now.utm_source || p.get("src");
  const has = UTM.some(k => now[k]) || now.click_id || now.ref;
  let first = null; try { first = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) {}
  if (!first && has) { first = now; try { localStorage.setItem(KEY, JSON.stringify(first)); } catch (_) {} }
  window.museAttr = function () {
    const a = Object.assign({}, first || now);
    UTM.concat(["ref", "click_id"]).forEach(k => { if (!a[k] && now[k]) a[k] = now[k]; });
    const ad = p.get("src") === "ad" || !!a.click_id || /cpc|ppc|paid|ad|display|social_paid/i.test(a.utm_medium || "");
    a.dur = Math.round((Date.now() - T0) / 1000);
    a.src = ad ? "広告" : (a.utm_source ? "その他(" + a.utm_source + ")" : "直接");
    return a;
  };
})();
