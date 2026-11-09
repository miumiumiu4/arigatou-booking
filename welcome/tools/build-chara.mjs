// ブルエアくん（welcome/chara/base.svg）に小物を足して、案内係4人の着せ替えを作る。
//   node welcome/tools/build-chara.mjs
// 出力：welcome/chara/{buruyan,buruko,burusama,buruseijin}.svg
// 絵は「型」だけ。実在の人を思わせる小物（特定の衣装・髪型）は使わない（キャラ台本 1節-6）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'chara');
const base = fs.readFileSync(path.join(dir, 'base.svg'), 'utf8');
const INK = '#3a2e28';

function star(cx, cy, r, fill, stroke = INK, sw = 3) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push((cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1));
  }
  return `<path d="M${pts.join(' L')} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

const LOOKS = {
  // 男性：黄色のねじり鉢巻
  buruyan: {
    label: 'ブルやん（黄色のねじり鉢巻のブルエアくん）',
    add: `
  <!-- ねじり鉢巻 -->
  <path d="M26 66 Q120 40 214 66 L214 82 Q120 56 26 82 Z" fill="#f7c815" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M54 60 l10 14 M84 53 l10 14 M114 50 l10 14 M144 51 l10 14 M174 56 l10 14" stroke="#c99a00" stroke-width="4" stroke-linecap="round"/>
  <path d="M206 66 q20 -22 30 -10 q-6 14 -24 18 Z" fill="#f7c815" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M208 74 q22 2 26 16 q-16 4 -28 -8 Z" fill="#f7c815" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="208" cy="70" r="7" fill="#f7c815" stroke="${INK}" stroke-width="4"/>`
  },
  // 女性：星のヘアピン、赤いほっぺ
  buruko: {
    label: 'ブルこ（星のヘアピンと赤いほっぺのブルエアくん）',
    add: `
  <!-- 赤いほっぺ -->
  <ellipse cx="62" cy="136" rx="15" ry="9" fill="#ff5a5f" opacity=".85"/>
  <ellipse cx="180" cy="136" rx="15" ry="9" fill="#ff5a5f" opacity=".85"/>
  <!-- 星のヘアピン -->
  <path d="M40 58 l30 -6" stroke="#e8590c" stroke-width="5" stroke-linecap="round"/>
  ${star(64, 50, 20, '#ffd43b')}`
  },
  // どっちでもない：大きめのサングラス、紫のストール
  burusama: {
    label: 'ブルさま（大きめのサングラスと紫のストールのブルエアくん）',
    add: `
  <!-- 紫のストール -->
  <path d="M14 158 Q120 204 226 158 L224 182 Q120 226 16 182 Z" fill="#7b4bb7" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M40 178 l-8 34 l16 -2 Z" fill="#7b4bb7" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M40 176 Q120 210 200 176" fill="none" stroke="#b48ee0" stroke-width="3" stroke-linecap="round"/>
  <!-- 大きめのサングラス -->
  <rect x="54" y="76" width="54" height="40" rx="14" fill="#2b2140" stroke="${INK}" stroke-width="4"/>
  <rect x="134" y="74" width="58" height="42" rx="14" fill="#2b2140" stroke="${INK}" stroke-width="4"/>
  <path d="M108 92 q13 -8 26 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  <path d="M64 86 l14 -6 M144 84 l14 -6" stroke="#8f7fb0" stroke-width="4" stroke-linecap="round"/>`
  },
  // 宇宙人：アンテナ2本、薄緑の体、星のバッジ
  buruseijin: {
    label: 'ブル星人（アンテナ2本と薄緑の体のブルエアくん）',
    swap: [['fill="#fbfaf7"', 'fill="#d4f2c4"'], ['fill="#d9b48f"', 'fill="#a8dc8c"'], ['fill="#e9cdb0"', 'fill="#b9e6a3"']],
    add: `
  <!-- アンテナ -->
  <path d="M92 42 L76 12" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <path d="M148 42 L164 12" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="75" cy="10" r="8" fill="#ff8ad8" stroke="${INK}" stroke-width="3"/>
  <circle cx="165" cy="10" r="8" fill="#ff8ad8" stroke="${INK}" stroke-width="3"/>
  <!-- 星のバッジ -->
  ${star(200, 116, 12, '#ffd43b', INK, 2.5)}`
  }
};

for (const [name, look] of Object.entries(LOOKS)) {
  let svg = base.replace(/aria-label="[^"]*"/, `aria-label="${look.label}"`);
  for (const [a, b] of look.swap || []) svg = svg.split(a).join(b);
  svg = svg.replace(/<\/svg>\s*$/, `${look.add}\n</svg>\n`);
  fs.writeFileSync(path.join(dir, name + '.svg'), svg);
  console.log('wrote', name + '.svg');
}
