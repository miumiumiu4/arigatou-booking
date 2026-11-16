#!/usr/bin/env bash
# Cloudflare Pages の組み立て台本。
#   お客様に見せるファイルだけを _site/ に写す。Cloudflare Pages の設定は
#   「Build command: bash tools/cf-build.sh」「Build output directory: _site」。
#   手元でも同じ: bash tools/cf-build.sh  →  _site/ ができる（_site/ は .gitignore 済み）
#
# 写さないもの（今の GitHub Pages では URL を打てば読めてしまうもの）:
#   - GAS のコード（*.gs, appsscript.json）
#   - 文書（*.md, handoff/）
#   - テスト・道具（test/, tests/, tools/, receiver/, *.mjs, *.cjs, *.sh）
#   - 裏方（.git, .github, .worktrees, node_modules, 隠しファイル）
#   - 方言の元データ（welcome/dialect/src/。ページが読むのは welcome/dialect/*.js）
# 新しいフォルダ（shop/c0XX/ など）は、上に当たらなければそのまま写る。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/_site"

rm -rf "$OUT"
mkdir -p "$OUT"

cd "$ROOT"
find . \
  \( -type d \( -name '.?*' -o -name _site -o -name node_modules -o -name handoff \
       -o -name test -o -name tests -o -name tools -o -name receiver \) -prune \) -o \
  \( -type d -path './welcome/dialect/src' -prune \) -o \
  \( -type f \
     ! -name '.*' \
     ! -name '*.gs' ! -name 'appsscript.json' \
     ! -name '*.md' ! -name '*.mjs' ! -name '*.cjs' ! -name '*.sh' \
     ! -name 'package.json' ! -name 'package-lock.json' \
     -print0 \) \
| while IFS= read -r -d '' f; do
    mkdir -p "$OUT/$(dirname "$f")"
    cp -p "$f" "$OUT/$f"
  done

# 404.html が無いと、Cloudflare Pages は知らない道に一番上の index.html を返してしまう（一枚ページ扱い）。
# 無ければ、ちゃんと「見つかりません」を返すページを置く。
if [ ! -f "$OUT/404.html" ]; then
  cat > "$OUT/404.html" <<'HTML'
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>ページが見つかりません</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;line-height:1.7;color:#1f2328}a{color:#0969da}</style>
</head>
<body>
<h1>ページが見つかりません</h1>
<p>アドレスが変わったか、まちがっているようです。</p>
<p><a href="/welcome/">エアコンクリーニングのご予約はこちら</a></p>
</body>
</html>
HTML
fi

# 写してはいけないものが紛れ込んでいないか、最後に確かめる（あれば止める）。
bad="$(cd "$OUT" && find . -type f \( -name '*.gs' -o -name '*.md' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.sh' -o -name 'appsscript.json' -o -name '.*' \) -print; \
       cd "$OUT" && find . -type d \( -name handoff -o -name test -o -name tests -o -name tools -o -name receiver -o -name '.?*' \) -print)"
if [ -n "$bad" ]; then
  echo "写してはいけないものが _site/ に入っています:" >&2
  echo "$bad" >&2
  exit 1
fi

echo "_site/ に $(cd "$OUT" && find . -type f | wc -l | tr -d ' ') 個のファイルを写しました。"
