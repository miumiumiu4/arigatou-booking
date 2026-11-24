#!/usr/bin/env bash
# 古い住所（miumiumiu4.github.io/arigatou-booking/…）を新しい住所へ転送する「看板だけ」のサイトを作る。
#   GitHub Pages（Source: GitHub Actions）が、このリポジトリの中身の代わりにこれを出す。
#   ・お客様向けの各ページと同じ場所に、転送だけするページを置く（200 で返る＝広告の審査でも切れない）
#   ・知らない道は 404.html が同じ規則で転送する
#   ・?の後ろ（src= ref= など）と #の後ろはそのまま持っていく
#   ・元の参照元を _rf、古い住所で覚えた紹介コードを _sref で渡す（ページ側は PR #34 で受け取り済み）
#   ・コード（.gs）や文書（.md）は一切出さない
# 使い方: bash tools/old-address-redirect.sh  →  _redirect/ ができる
set -euo pipefail

NEW="${NEW_ORIGIN:-https://yoyaku.arigatouosouji.com}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/_redirect"

bash "$ROOT/tools/cf-build.sh" >/dev/null
rm -rf "$OUT"; mkdir -p "$OUT"

cat > "$OUT/go.js" <<JS
(function () {
  var NEW = '$NEW';
  var rest = location.pathname.replace(/^\/arigatou-booking/, '') || '/';
  var q = new URLSearchParams(location.search), add = [];
  try { var h = document.referrer ? new URL(document.referrer).hostname : '';
    if (h && h !== location.hostname && !q.get('_rf')) add.push('_rf=' + encodeURIComponent(h)); } catch (_) {}
  try { var v = JSON.parse(localStorage.getItem('arigatou_ref') || 'null');
    if (!q.get('ref') && !q.get('_sref') && v && v.code && Date.now() - v.at < 90 * 864e5) add.push('_sref=' + encodeURIComponent(String(v.code).trim().slice(0, 30))); } catch (_) {}
  var s = location.search;
  if (add.length) s = (s ? s + '&' : '?') + add.join('&');
  location.replace(NEW + rest + s + location.hash);
})();
JS

stub() { # $1 = 新しい住所での道（/welcome/ など）
  cat <<HTML
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<link rel="canonical" href="$NEW$1">
<title>新しいページへ移動します</title>
<script src="/arigatou-booking/go.js"></script>
</head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.7">
<p>ページの住所が変わりました。自動で移動しない場合は <a href="$NEW$1">こちら</a> を押してください。</p>
</body>
</html>
HTML
}

(cd "$ROOT/_site" && find . -name '*.html' ! -name '404.html' | sed 's|^\./||') | while read -r f; do
  mkdir -p "$OUT/$(dirname "$f")"
  p="/${f%index.html}"
  stub "$p" > "$OUT/$f"
done
stub "/welcome/" > "$OUT/404.html"
touch "$OUT/.nojekyll"

# .gs や .md が紛れていないか
if (cd "$OUT" && find . -type f ! -name '*.html' ! -name 'go.js' ! -name '.nojekyll' | grep -q .); then
  echo "看板以外のファイルが入っています" >&2; exit 1
fi
echo "_redirect/ に看板 $(cd "$OUT" && find . -name '*.html' | wc -l | tr -d ' ') 枚（転送先 $NEW）"
