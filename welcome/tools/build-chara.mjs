// ブルエアくん（welcome/chara/base.svg）に小物を足して、案内係4人の着せ替えを作る。
//   node welcome/tools/build-chara.mjs
// 出力：welcome/chara/{buruyan,buruko,burusama,bruce}.svg
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
  // 4人目：イギリスから来た留学生ブルース。黒い学帽（金の校章）と、えんじと紺のしま模様のマフラー
  bruce: {
    label: 'ブルース（黒い学帽としま模様のマフラーのブルエアくん）',
    add: `
  <!-- しま模様のマフラー -->
  <path d="M18 160 Q120 200 222 160 L220 180 Q120 222 20 180 Z" fill="#8b1e3f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M60 177 l-4 14 M90 186 l-3 15 M150 186 l3 15 M180 177 l4 14" stroke="#1f3a6e" stroke-width="7" stroke-linecap="round"/>
  <path d="M178 176 l14 38 l16 -6 l-10 -36 Z" fill="#8b1e3f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M184 192 l14 -5" stroke="#1f3a6e" stroke-width="5" stroke-linecap="round"/>
  <!-- 黒い学帽 -->
  <path d="M52 52 Q60 8 120 6 Q180 8 188 52 Z" fill="#23232b" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M46 52 Q120 40 194 52 Q196 64 182 66 Q120 56 58 66 Q44 64 46 52 Z" fill="#111116" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M52 46 Q120 34 188 46" fill="none" stroke="#3b3b47" stroke-width="3"/>
  ${star(120, 28, 11, '#f2c14e', INK, 2.5)}`
  }
};

for (const [name, look] of Object.entries(LOOKS)) {
  let svg = base.replace(/aria-label="[^"]*"/, `aria-label="${look.label}"`);
  for (const [a, b] of look.swap || []) svg = svg.split(a).join(b);
  svg = svg.replace(/<\/svg>\s*$/, `${look.add}\n</svg>\n`);
  fs.writeFileSync(path.join(dir, name + '.svg'), svg);
  console.log('wrote', name + '.svg');
}
