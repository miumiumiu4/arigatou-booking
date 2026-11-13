// 予約を送ったあとの「案内係を選んで、当日までの質問に答える」チャット。
// 設計：予約後のキャラ選択チャット 設計書（2026-11-09）3節 画面の流れ・6節 裏側3段階・7節 個人情報・8節 計測
//   ① ボタン → ② この端末の中で台帳と照合 → ③ 当たらないときだけ裏側（FAQBOT_URL、空なら使わない）
// 話す中身は THANKS_DATA（FAQ台帳から作る）だけ。お名前・住所・電話・メールはここに来ない。
(function () {
  'use strict';
  var D = window.THANKS_DATA;
  var KEY = 'thanks_chara';
  var PREF = 'thanks_pref'; // ブルースの「生まれ故郷」（この端末だけ）
  var AI_MAX = 20; // 1受付番号あたり（裏側でも数える）
  var S = null;
  // 絵はこのファイルと同じ場所（welcome/）から読む。welcome-test/ から読まれても同じ絵になる
  var HERE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function later(fn, ms) { S.timers.push(setTimeout(fn, reduce ? 0 : ms)); }
  function fill(t) { return String(t).replace(/\{id\}/g, S.id); }
  // ブルース（4人目）は、選んだ県の言葉の束（welcome/dialect/<県>.js）で話す。束が無い台詞は、ブルこ（ていねい語）の言い方
  function ch() {
    var c = D.chars[S.chara];
    if (S.chara !== 'bruce' || !S.dl) return c;
    var o = {}, k;
    for (k in c) o[k] = c[k];
    for (k in S.dl.chars) o[k] = S.dl.chars[k];
    return o;
  }
  // 外国の言葉（束に lang がある時）：画面の文字と、予約の中身の付け足しの文を束の t から。無い鍵は日本語のまま
  function LG() { return S && S.chara === 'bruce' && S.dl && S.dl.lang ? S.dl.lang : ''; }
  function T(key, ja, vars) {
    var t = LG() && S.dl.t && S.dl.t[key];
    if (!t) return ja;
    return t.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : '{' + k + '}'; });
  }
  function qLabel(it, short) { return (LG() && S.dl.q && S.dl.q[it.id]) || short || it.q; }
  function item(id) { for (var i = 0; i < D.items.length; i++) if (D.items[i].id === id) return D.items[i]; return null; }

  // 送る前に電話・メール・郵便番号の形を伏せる（設計書 7節）
  function mask(t) {
    return String(t || '').normalize('NFKC')
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '○○')
      .replace(/\+?\d[\d\-ー−() ]{8,}\d/g, '○○')
      .replace(/〒?\s*\d{3}[-ー−]\d{4}/g, '○○')
      .slice(0, 200);
  }
  function norm(s) { return String(s).normalize('NFKC').toLowerCase().replace(/[\s、。,.!?！？「」『』（）()・…ー〜~]/g, ''); }
  // ② この端末の中の照合：台帳の質問・言い換えが入力に含まれていれば、いちばん長く当たったもの
  function localMatch(text) {
    var t = norm(text), best = null, score = 0;
    D.items.forEach(function (it) {
      [it.q].concat(it.aliases || [], (LG() && S.dl.kw && S.dl.kw[it.id]) || []).forEach(function (a) {
        var n = norm(a);
        if (n.length >= 2 && t.indexOf(n) >= 0 && n.length > score) { score = n.length; best = it; }
      });
    });
    return best;
  }

  // ---------- 吹き出し ----------
  function avatar(c) {
    var src = HERE + (c ? D.chars[c].img : 'chara/base.svg');
    return '<div class="avatar chara" aria-hidden="true"><img src="' + src + '" alt=""></div>';
  }
  function row(side, html) {
    var r = document.createElement('div');
    r.className = 'row ' + side;
    if (LG()) r.lang = LG();
    r.innerHTML = (side === 'in' ? avatar(S.chara) : '') + '<div class="bubble">' + html + '</div>';
    S.log.appendChild(r);
    r.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    return r;
  }
  function note(text) {
    var d = document.createElement('div');
    d.className = 'tc-note';
    d.textContent = text;
    S.log.appendChild(d);
  }
  // 「入力中…」を見せてから、1吹き出しずつ
  function say(lines, then) {
    lines = lines.slice();
    var gen = S.gen;
    (function next() {
      if (gen !== S.gen) return;
      if (!lines.length) { if (then) then(); return; }
      var text = fill(lines.shift());
      var r = row('in', '<span class="typing" aria-label="入力中"><i></i><i></i><i></i></span>');
      later(function () { if (gen !== S.gen) return; r.querySelector('.bubble').textContent = text; later(next, 250); }, Math.min(1400, 500 + text.length * 12));
    })();
  }
  function controls(html, keep) {
    if (!keep) S.ctl.style.minHeight = ''; // keep：選び直しで残した高さを、案内係の一覧が出ている間も保つ
    S.ctl.innerHTML = html || '';
    S.ctl.hidden = !html;
    return S.ctl;
  }
  function MENU() { return '<button type="button" class="tc-link" data-menu="1">' + esc(T('ui_menu', 'ほかの質問')) + '</button>'; }
  function BYE() { return '<button type="button" class="tc-link" data-bye="1">' + esc(T('ui_bye', 'おしまい（特典あり）')) + '</button>'; }
  function on(sel, fn) { S.ctl.querySelectorAll(sel).forEach(function (b) { b.addEventListener('click', function (e) { fn(b, e); }); }); }

  // ---------- 1. 案内係を選ぶ ----------
  function intro(again) {
    S.gen++;
    var prev = S.chara;
    S.chara = null;
    // 選び直しの時は、下のボタン欄の高さをそのまま残す（空にするとページが縮んで画面が上へずれるため。11/10 三浦さん）
    var hold = again && !S.ctl.hidden ? S.ctl.offsetHeight : 0;
    controls('');
    if (hold) { S.ctl.hidden = false; S.ctl.style.minHeight = hold + 'px'; }
    S.opts.track('キャラ表示', again ? '変える:' + prev : '');
    say([again ? '案内係を選び直せます。どの子にしますか？' : '当日までのこと、聞いておきませんか？ 案内係を選んでください。'], picker);
  }
  function picker() {
    var html = '<div class="tc-pick">' + Object.keys(D.chars).map(function (k) {
      var c = D.chars[k], last = store(KEY) === k;
      return '<button type="button" class="tc-card' + (last ? ' last' : '') + '" data-c="' + k + '">' + (last ? '<i>前回</i>' : '') + '<img src="' + HERE + c.img + '" alt=""><b>' + esc(c.name) + '</b><span>' + esc(c.pick) + '</span></button>';
    }).join('') + '</div>';
    controls(html, true);
    on('.tc-card', function (b) { choose(b.dataset.c, false); });
  }
  function choose(c, remembered) {
    if (!D.chars[c]) return intro();
    S.gen++;
    S.chara = c;
    store(KEY, c);
    controls('');
    S.opts.track('キャラ選択', c + (remembered ? ':覚えていた' : ''));
    if (!remembered) row('out', esc(D.chars[c].name) + 'にする');
    if (c === 'bruce') return hometown();
    say(ch().hello, menu);
  }
  // ブルース：生まれ故郷を聞いて、その県の言葉の束を読み込む。選んだ県はこの端末の中だけ（計測にも送らない）
  // 県は47あるので、まず地方を選んでから県を選ぶ（11/13）。前に選んだ言葉は一番上に1つだけ出す
  var REGIONS = [['北海道・東北', 1, 7], ['関東', 8, 14], ['中部', 15, 23], ['近畿', 24, 30], ['中国', 31, 35], ['四国', 36, 39], ['九州・沖縄', 40, 47]];
  function hometown() {
    say(D.chars.bruce.ask, function () { prefMenu(); });
  }
  function prefMenu(group) {
    var list = D.dialects || [], last = store(PREF);
    var prev = list.filter(function (d) { return d.id === last; })[0];
    var btn = function (d) {
      return '<button type="button" class="btn ghost' + (d.id === last ? ' last' : '') + '" data-pref="' + d.id + '"' + (d.lang ? ' lang="' + d.lang + '"' : '') + '>' + esc(d.pref) + (d.id === last ? '（前回）' : '') + '</button>';
    };
    var html;
    if (group === 'lang') {
      html = '<p class="tc-hint">' + esc(D.chars.bruce.langs) + '</p><div class="tc-quick tc-pref tc-lang">' + list.filter(function (d) { return d.lang; }).map(btn).join('') + '</div>';
    } else if (group != null) {
      var r = REGIONS[group];
      html = '<p class="tc-hint">' + esc(r[0]) + '</p><div class="tc-quick tc-pref">' + list.filter(function (d) { return !d.lang && d.order >= r[1] && d.order <= r[2]; }).map(btn).join('') + '</div>';
    } else {
      html = (prev ? '<button type="button" class="btn primary wide" data-pref="' + prev.id + '"' + (prev.lang ? ' lang="' + prev.lang + '"' : '') + '>前回：' + esc(prev.pref) + '</button>' : '')
        + '<div class="tc-quick tc-pref">' + REGIONS.map(function (r, i) {
          return list.some(function (d) { return !d.lang && d.order >= r[1] && d.order <= r[2]; }) ? '<button type="button" class="btn ghost" data-region="' + i + '">' + esc(r[0]) + '</button>' : '';
        }).join('') + (list.some(function (d) { return d.lang; }) ? '<button type="button" class="btn ghost" data-region="lang">' + esc(D.chars.bruce.langs) + '</button>' : '') + '</div>';
    }
    controls(html + (group != null ? '<button type="button" class="tc-link" data-back="1">地方を選び直す</button>' : '') + '<p class="tc-hint">' + esc(D.chars.bruce.soon) + '</p>');
    on('[data-region]', function (b) { prefMenu(b.dataset.region === 'lang' ? 'lang' : +b.dataset.region); });
    on('[data-back]', function () { prefMenu(); });
    on('[data-pref]', function (b) {
      var d = list.filter(function (x) { return x.id === b.dataset.pref; })[0];
      controls('');
      row('out', esc(d.pref));
      loadDialect(d.id, function (dl) {
        if (!dl) { say([D.chars.bruce.fail], function () { intro(true); }); return; }
        store(PREF, d.id);
        useDialect(dl);
        say(ch().hello, menu);
      });
    });
  }
  function loadDialect(id, done) {
    var all = window.THANKS_DIALECTS = window.THANKS_DIALECTS || {};
    if (all[id]) return done(all[id]);
    var gen = S.gen, sc = document.createElement('script');
    sc.src = HERE + 'dialect/' + id + '.js';
    sc.onload = function () { if (gen === S.gen) done(all[id] || null); };
    sc.onerror = function () { if (gen === S.gen) done(null); };
    document.head.appendChild(sc);
  }
  function useDialect(dl) {
    S.dl = dl;
    D.items.forEach(function (it) {
      if (!it.a || !it.a.buruko) return;
      var b = it.a.buruko, p = dl.items[it.id];
      it.a.bruce = it.id === 'MY' ? [dl.my[0], '{detail}', dl.my[1]]
        : dl.lang ? (p || b) // 外国の言葉の束は、答えを丸ごと訳したもの
        : p ? p.slice(0, -1).concat([b[b.length - 2]], p.slice(-1)) : b; // 県の言葉の束は [はじめ…, おわり]。間に台帳の元文（標準語）を挟む
    });
  }

  // ---------- 2. 質問のボタン＋自由入力 ----------
  function menu(all) {
    var list = all ? D.items : D.quick.map(function (q) { var it = item(q[0]); return { id: it.id, q: q[1] }; });
    var html = '<div class="tc-quick' + (all ? ' all' : '') + '">' + list.map(function (it) {
      return '<button type="button" class="btn ghost" data-q="' + it.id + '">' + esc(qLabel(it, it.q)) + '</button>';
    }).join('') + '</div>'
      + (all ? '' : '<button type="button" class="tc-link" data-more="1">' + esc(T('ui_more', 'ほかの質問も見る')) + '</button>')
      + '<form class="tc-ask" autocomplete="off"><input name="t" maxlength="200" placeholder="' + esc(T('ui_ph', 'ほかに聞きたいことを入力')) + '" aria-label="' + esc(T('ui_ph', '聞きたいこと')) + '"><button type="submit" class="btn primary">' + esc(T('ui_send', '送る')) + '</button></form>'
      + '<p class="tc-hint">' + esc(T('ui_hint', 'お名前・電話番号・ご住所は入れないでください。')) + '</p>'
      + '<div class="tc-foot"><button type="button" class="tc-link" data-human="1">' + esc(T('ui_human', '人へつなぐ')) + '</button>' + BYE() + '</div>';
    controls(html);
    on('[data-q]', function (b) { ask(b.dataset.q, 'ボタン', b.textContent); });
    on('[data-more]', function () { menu(true); });
    on('[data-human]', function () { row('out', esc(T('ui_human_out', '人と話したい'))); handoff('ボタン'); });
    on('[data-bye]', bye);
    S.ctl.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = e.target.t.value.trim();
      if (t) free(t);
    });
  }

  // ---------- 3. 答え ----------
  // 「さっきの予約」に合わせた答え。opts.mine（このページの中だけにある予約の中身）から作り、どこにも送らない。
  // 金額・時間の数字は台帳の決まり（作業時間の目安・到着の幅・駐車場の扱い）から計算するだけで、新しい約束は作らない。
  function V(o, key, vars) {
    if (S.chara !== 'bruce') return o[S.chara] || o.buruko;
    var t = S.dl && S.dl.mine[key];
    return t ? t.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; }) : o.buruko;
  }
  function hm(min) {
    var h = Math.floor(min / 60), m = min % 60, r = [];
    if (h) r.push(T('u_h', h + '時間', {n: h}));
    if (m || !h) r.push(T('u_m', m + '分', {n: m}));
    return r.join(LG() ? ' ' : '');
  }
  var PAY = { onsite: '作業当日に現金', paypay: '作業当日に PayPay', paypal: 'PayPal の請求書（メールで届きます）' };
  var ARRIVE = { '9時〜12時': '8〜9時', '12時〜15時': '12〜14時', '15時〜18時': '15〜18時' };
  // 外国の言葉では、時間帯を 9:00–12:00 の形に（どの言葉でも読める）
  function slot(s) { return LG() ? String(s || '').replace(/時/g, ':00').replace('〜', '–').replace(/^(\d+)–/, '$1:00–') : s; }
  function dayLabel(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
    var t = new Date(d + 'T12:00:00+09:00');
    if (LG()) { try { return new Intl.DateTimeFormat(LG(), { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }).format(t); } catch (e) { /* 日本語の形へ */ } }
    return (t.getUTCMonth() + 1) + '月' + t.getUTCDate() + '日（' + '日月火水木金土'.charAt(t.getUTCDay()) + '）';
  }
  var MINE = {
    A02: function (m) { // 作業時間：通常60〜90分・お掃除機能付き90〜120分・室外機20〜30分（事務マニュアル01）
      var auto = Math.min(m.auto || 0, m.wall || 0), normal = (m.wall || 0) - auto, out = m.outdoorUnits || 0;
      if (!normal && !auto) return null;
      var lo = normal * 60 + auto * 90 + out * 20, hi = normal * 90 + auto * 120 + out * 30;
      var what = T('v_ac', 'エアコン' + (normal + auto) + '台', {n: normal + auto}) + (auto ? T('v_auto', '（うちお掃除機能付き' + auto + '台）', {n: auto}) : '') + (out ? T('v_out', 'と室外機' + out + '台', {n: out}) : '');
      var span = hm(lo) + T('u_to', '〜') + hm(hi);
      var r = [V({
        buruyan: 'お客さんの予約は、' + what + 'やな。', buruko: 'ご予約は、' + what + 'ですね。',
        burusama: 'あなたの予約は、' + what + 'ね。'
      }, 'A02_what', {what: what}), V({
        buruyan: 'それやと、だいたい' + span + 'くらい見といてな。', buruko: 'それだと、だいたい' + span + 'くらいです。',
        burusama: 'それなら、だいたい' + span + 'ってところね。'
      }, 'A02_span', {span: span}) + T('A02_note', '（スタッフ1名で伺う目安です。機種や設置の状況で長くなることがあります）')];
      if (m.tenkase) r.push(T('A02_tenkase', '天井埋め込み（天カセ）' + m.tenkase + '台の分は、機種で変わるので担当者からご案内します。', {n: m.tenkase}));
      return r;
    },
    C04: function (m) {
      var pay = PAY[m.payment] && T('pay_' + m.payment, PAY[m.payment]);
      if (!pay) return null;
      return [V({
        buruyan: 'さっきのフォームで「' + pay + '」を選んでくれてたで。', buruko: 'さきほどのフォームで「' + pay + '」を選んでいただいてます。',
        burusama: 'さっきのフォームで「' + pay + '」を選んでたわよ。'
      }, 'C04_pay', {pay: pay}), T('C04_after', 'お支払いは、作業が終わってからです。'), V({
        buruyan: '変えたい時は、LINE か電話でひと言くれたらええよ。', buruko: '変えたい時は、LINE かお電話でひと言くださいね。',
        burusama: '変えたくなったら、LINE か電話でひと言ちょうだい。'
      }, 'C04_change')];
    },
    A01: function (m) {
      var day = dayLabel(m.date1), arr = ARRIVE[m.time1] && slot(ARRIVE[m.time1]);
      if (!day || !arr) return null;
      return [V({
        buruyan: '第1希望は ' + day + ' の' + m.time1 + 'やな。', buruko: '第1希望は ' + day + ' の' + m.time1 + 'ですね。',
        burusama: '第1希望は ' + day + ' の' + m.time1 + 'ね。'
      }, 'A01_day', {day: day, time: slot(m.time1)}), T('A01_arrive', 'この時間帯だと、到着は ' + arr + ' のあいだです（作業が終わる時刻ではありません）。', {arr: arr}), T('A01_fix', '作業日は、担当者からのご連絡で確定します。')];
    },
    B03: function (m) {
      if (m.parking === '敷地内に駐車可') return [V({
        buruyan: '敷地内に停められるって書いてくれてたな。', buruko: '敷地内に停められると書いていただいてますね。',
        burusama: '敷地内に停められるのね、助かるわ。'
      }, 'B03_in'), T('B03_in_note', '駐車場がない場合にだけ、近くのコインパーキングの実費を別にいただきます。')];
      if (m.parking === '近隣コインパーキング利用') return [V({
        buruyan: '近くのコインパーキングを使う形やな。', buruko: '近くのコインパーキングを使う形ですね。',
        burusama: '近くのコインパーキングを使うのね。'
      }, 'B03_coin'), T('B03_coin_note', 'その場合は、コインパーキングの実費を別にいただきます。')];
      return null;
    },
    C08: function (m) { // クーポン・紹介コード：入れたコードを返し、受付番号を取っておくよう伝える（20%引きの案内は 11/10 三浦さんの指示で外した）
      var codes = [m.coupon && T('v_coupon', 'クーポンコード「' + m.coupon + '」', {code: m.coupon}), m.refCode && T('v_ref', '紹介コード「' + m.refCode + '」', {code: m.refCode})].filter(Boolean).join(T('u_and', 'と'));
      return [codes ? V({
        buruyan: 'さっきの予約に、' + codes + 'が入ってたで。お店で確認して反映するからな。', buruko: 'さきほどのご予約に、' + codes + 'が入っていました。お店で確認して反映しますね。',
        burusama: 'さっきの予約に、' + codes + 'が入ってたわ。お店で確認して反映するわね。'
      }, 'C08_codes', {codes: codes}) : T('C08_none', '予約フォームに入れていただいたクーポンコード・紹介コードは、お店で確認して反映します。'), V({
        buruyan: '受付番号 ' + S.id + ' は、問い合わせの時に使うから取っといてな。', buruko: '受付番号 ' + S.id + ' は、お問い合わせの時に使うので取っておいてくださいね。',
        burusama: '受付番号 ' + S.id + ' は、問い合わせの時に使うから取っておきなさい。'
      }, 'C08_id', {id: S.id})];
    },
    E03: function (m) { // ペットがいる家は1年に1回（11/10 三浦さん）
      if (m.pet !== 'あり') return null;
      return [T('E03_base', 'エアコンクリーニングは、2年に1回が目安です。ただ、ペットを飼っているお家は、毛やにおいがたまりやすいので1年に1回がベストです。おすすめの時期は、春先と秋口です。'), V({
        buruyan: 'さっきの予約、ペットおるって書いてくれてたやろ。せやから、うちは1年に1回がベストやで。', buruko: 'さきほどのご予約でペットがいると書いてくださったので、1年に1回がおすすめですよ。',
        burusama: 'あなたの家はペットがいるんだから、1年に1回にしておきなさい。'
      }, 'E03_pet')];
    },
    F04: function (m) { // 天カセ：予約に入っていればその台数（11/10 三浦さん）
      if (!m.tenkase) return null;
      return [V({
        buruyan: '今回の予約に、天カセが' + m.tenkase + '台入ってるで。', buruko: '今回のご予約に、天カセが' + m.tenkase + '台入っていますね。',
        burusama: '今回の予約には、天カセが' + m.tenkase + '台入ってるわね。'
      }, 'F04_has', {n: m.tenkase}), T('F04_note', '天井埋め込み（天カセ）は1台目23,300円、2台目から22,300円/台です。対応できない地域があるので、担当者からご連絡します。')];
    },
    F05: function (m) { // 指名：予約で選んでいればそれを返す
      if (!m.nominate) return null;
      var who = m.nominateName ? T('v_who', '「' + m.nominateName + '」さん', {name: m.nominateName}) : T('v_staff', 'スタッフ');
      return [V({
        buruyan: 'さっきの予約で、' + who + 'の指名を受けてるで。', buruko: 'さきほどのご予約で、' + who + 'のご指名を承っています。',
        burusama: 'さっきの予約で、' + who + 'を指名してるわね。'
      }, 'F05_has', {who: who}), T('F05_note', 'スタッフの指名は＋3,000円です。')];
    },
    C07: function (m) { // 3点セット：予約に入っていればそれを返す
      if (!m.set3) return null;
      var left = Math.max(0, (m.wall || 0) - m.set3);
      return [V({
        buruyan: '今回の予約に、3点セットがもう' + m.set3 + '台分入ってるで。ええ選択や。', buruko: '今回のご予約に、3点セットが' + m.set3 + '台分入っています。いい選択です！',
        burusama: '今回の予約には、3点セットがもう' + m.set3 + '台分入ってるわよ。見る目あるわね。'
      }, 'C07_has', {n: m.set3}), T('C07_note', '3点セットは、防カビ抗菌コート・室外機クリーニング・ドレンホース洗浄の3つで1台7,500円です（別々だと9,500円）。')
      ].concat(left ? [V({
        buruyan: 'ほかの' + left + '台にも付けたかったら、下のボタンからどうぞ。', buruko: 'ほかの' + left + '台にも付けたい時は、下のボタンからどうぞ。',
        burusama: 'ほかの' + left + '台にも付けたいなら、下のボタンからね。'
      }, 'C07_left', {left: left})] : []);
    },
    B06: function (m) { // 型番：書いてあればそれを返す。無ければ、このあと記入欄を出す
      return [m.model ? V({
        buruyan: '型番は「' + m.model + '」って書いてくれてたな。ありがとうな。', buruko: '型番は「' + m.model + '」と書いていただいてますね。助かります！',
        burusama: '型番は「' + m.model + '」ね。ちゃんと書いてあって偉いわ。'
      }, 'B06_model', {model: m.model}) : V({
        buruyan: '伝えてもらえると、当日の準備がぐっと楽になるねん。', buruko: '伝えていただけると、当日の準備がスムーズになります。',
        burusama: '伝えてもらえると、当日の段取りが楽になるのよ。'
      }, 'B06_none'), T('B06_note', 'お掃除機能付きかどうかで料金が変わるので、分かる範囲で教えてください。')];
    },
    C05: function (m) { // 領収書：予約で書いた宛名を返す。書き忘れた人には、このあと記入欄を出す
      var r = m.receiptName ? V({
        buruyan: '領収書の宛名は「' + m.receiptName + '」で受けとるで。', buruko: '領収書の宛名は「' + m.receiptName + '」で承っています。',
        burusama: '領収書の宛名は「' + m.receiptName + '」で受けてるわよ。'
      }, 'C05_name', {name: m.receiptName}) : V({
        buruyan: '宛名を書き忘れてても大丈夫や。下の欄に書いてな。', buruko: '宛名を書き忘れても大丈夫ですよ。下の欄に書いてくださいね。',
        burusama: '宛名を書き忘れたなら、下の欄に書けばいいのよ。'
      }, 'C05_none');
      return [r, T('C05_note', '領収書の発行のしかたは、担当者からご案内します。')];
    },
    B04: function (m) { // 「大丈夫」を先に言い、そのあとで書いてくれた中身を返す（11/10 三浦さん）
      if (m.pet !== 'あり') return null;
      var n = m.petCount ? T('v_pets', m.petCount + '匹', {n: m.petCount}) : '';
      return [V({
        buruyan: 'ペットがおっても大丈夫やで。', buruko: 'ペットがいても大丈夫ですよ。',
        burusama: 'ペットがいても大丈夫よ。'
      }, 'B04_ok'), V({
        buruyan: 'ペット' + n + 'おるって書いてくれてたな。担当者にもちゃんと伝わるで。', buruko: 'ペットが' + n + 'いると書いていただいてますね。担当者にも伝わります。',
        burusama: 'ペット' + n + 'がいるのね。担当者にもちゃんと伝わるわ。'
      }, 'B04_count', {n: n}), V({
        buruyan: '気になることがあったら、このあと「人と話したい」を押してな。人につなぐで。', buruko: '気になることがあれば、このあと「人と話したい」を押してくださいね。人におつなぎします。',
        burusama: '気になることがあれば、このあと「人と話したい」を押してちょうだい。人につなぐわ。'
      }, 'B04_next')];
    }
  };
  // 「予約した内容を確認したい」：このページの中だけで、予約フォームに入れた中身を全部読み上げる
  var MY_A = {
    buruyan: ['さっきの予約、読み上げるで。', '{detail}', '違うとこあったら、受付番号 {id} と一緒に LINE か電話で教えてな。'],
    buruko: ['さきほどのご予約、確認しますね。', '{detail}', '違うところがあれば、受付番号 {id} と一緒に LINE かお電話で教えてくださいね。'],
    burusama: ['さっきの予約、ちゃんと見せるわね。', '{detail}', '違うところがあったら、受付番号 {id} を添えて LINE か電話で言ってちょうだい。']
  };
  function addMine(m) {
    if (!m || !m.detail || !m.detail.length || item('MY')) return;
    D.items.unshift({ id: 'MY', q: '予約した内容を確認したい', aliases: ['予約内容', '予約の内容', '予約の中身', '何を予約', '何台', '住所', '場所', 'どこに来る', '希望日', '確認したい'], open: true, human: false, a: MY_A });
    D.quick.unshift(['MY', '予約の中身']);
  }
  function mine(it) {
    var f = MINE[it.id], m = S.opts.mine;
    if (!f || !m) return null;
    try { return f(m); } catch (e) { return null; }
  }
  function answerLines(it, lines) {
    lines = lines.map(fill);
    if (it.id === 'C01' && S.opts.summary) lines.splice(1, 0, S.opts.summary); // 「私の料金は？」はこの画面の内訳をそのまま
    if (it.id === 'MY') { var dt = S.opts.mine.detail; S.mine = true; return [lines[0], dt.join('\n')].concat(lines.slice(2)); } // 一覧は1つの吹き出しにまとめる
    var p = mine(it);
    if (p) { S.mine = true; return it.human ? p : [lines[0]].concat(p); } // 一言目は案内係のまま、中身はこの予約の話
    S.mine = false;
    return lines;
  }
  function ask(id, via, shown) {
    var it = item(id);
    S.gen++;
    controls('');
    row('out', esc(shown));
    S.opts.track('質問', via + ':' + id);
    if (!it.open) return handoff('未確定:' + id, true);
    S.miss = 0;
    say(answerLines(it, it.a[S.chara]), function () { after(it); });
  }
  // あとから書き足してもらう欄（領収書の宛名・メーカー型番）。中身は裏側にも計測にも送らない。
  // 受付番号つきの文にして、メールで送ってもらう（登録のメアドから届き、受付番号ですぐ拾える。11/10 三浦さん）。
  //   opts.mailTo があれば、件名と本文が入った状態でメールを開く。無ければ確認メールへの返信で。どちらも無理な時は LINE
  // （予約サイトの GAS は凍結中で、あとから書き足す受け口がまだ無い。受け口ができたらここから直接送る）
  var INFO = {
    receipt: { label: '領収書の宛名', key: 'receiptName', ph: '例：株式会社〇〇　／　〇〇 様', max: 40,
      hintHas: '宛名を変える時だけ書いてください。', hintNone: '領収書の宛名を書き忘れた方は、こちらに書いてください。' },
    set3: { label: '3点セットの追加', key: 'set3More', ph: '何台分？（例：2）', max: 2, num: true, unit: '台',
      hintHas: '', hintNone: '追加したい台数を書いてください。追加できるかは、その日の担当者の前後の作業量によるので、担当者から確認のご連絡をします。' },
    model: { label: 'メーカー・型番', key: 'model', ph: '例：ダイキン AN22XXX', max: 60,
      hintHas: '違っていた時や、ほかの台の分があれば書いてください。', hintNone: 'もし分かれば、こちらに書いてください。本体の横や下のシールに書いてあります。' }
  };
  function copyText(t, done) {
    done = done || function () {};
    try { navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
  }
  function infoForm(kind) {
    var o = S.opts, k = INFO[kind], has = !!(o.mine && o.mine[k.key]);
    var hint = has && k.hintHas ? T('info_' + kind + '_has', k.hintHas) : T('info_' + kind + '_none', k.hintNone);
    controls('<form class="tc-ask tc-info"><input' + (k.num ? ' inputmode="numeric"' : '') + ' maxlength="' + k.max + '" placeholder="' + esc(T('info_' + kind + '_ph', k.ph)) + '" aria-label="' + esc(T('info_' + kind, k.label)) + '"><button class="btn primary">' + esc(T('ui_set', '決める')) + '</button></form>'
      + '<p class="tc-hint">' + esc(hint) + '</p>'
      + '<div class="tc-foot">' + MENU() + BYE() + '</div>');
    on('[data-menu]', function () { S.gen++; controls(''); say([ch().more], menu); });
    on('[data-bye]', bye);
    S.ctl.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var val = S.ctl.querySelector('form input').value.normalize('NFKC').trim().slice(0, k.max);
      if (k.num) { val = String(parseInt(val, 10) || ''); if (!val || +val < 1) return; val += k.unit; }
      if (!val) return;
      var subject = '受付番号 ' + S.id + ' の' + k.label;
      var msg = subject + '：' + val;
      var mail = o.mailTo ? 'mailto:' + o.mailTo + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(msg + '\n') : '';
      S.opts.track('書き足し', k.label);
      row('out', esc(T('info_' + kind, k.label) + T('u_colon', '：') + val));
      controls('');
      copyText(msg); // コピーできない端末は、吹き出しの文から写してもらう
      var how = mail ? V({
        buruyan: '下の「メールで送る」を押したら、この文が入ったメールが開くで。そのまま送ってな。登録したメアドから届くから、受付番号ですぐ見つけられるねん。',
        buruko: '下の「メールで送る」を押すと、この文が入ったメールが開きます。そのまま送ってくださいね。登録のメールアドレスから届くので、すぐに見つけられます。',
        burusama: '下の「メールで送る」を押せば、この文が入ったメールが開くわ。そのまま送ってちょうだい。'
      }, 'INFO_mail') : V({
        buruyan: 'さっき届いた確認メールに「返信」して、この文を貼り付けて送ってな。登録したメアドから届くから、受付番号ですぐ見つけられるねん。',
        buruko: 'さきほど届いた確認メールに「返信」して、この文を貼り付けて送ってくださいね。登録のメールアドレスから届くので、受付番号ですぐに見つけられます。',
        burusama: 'さっき届いた確認メールに「返信」して、この文を貼り付けて送ってちょうだい。登録したメアドから届くから、すぐ見つけられるのよ。'
      }, 'INFO_reply');
      say([V({
        buruyan: '「' + val + '」やな。この文をコピーしといたで。', buruko: '「' + val + '」ですね。この文をコピーしておきました。',
        burusama: '「' + val + '」ね。この文、コピーしておいたわ。'
      }, 'INFO_got', {val: val}), msg, how], function () {
        controls((mail ? '<a class="btn primary wide" data-ch="メール" href="' + esc(mail) + '">' + esc(T('ui_mail', 'メールで送る')) + '</a>' : '')
          + (o.lineUrl ? '<a class="btn ghost wide" data-ch="LINE" href="' + esc(o.lineUrl) + '" target="_blank" rel="noopener">' + esc(T('ui_mail_line', 'メールが使えない時は LINE で送る')) + '</a>' : '')
          + '<button type="button" class="tc-link tc-copy" data-copy="1">' + esc(T('ui_copy_again', 'もう一度コピーする')) + '</button>'
          + '<div class="tc-foot">' + MENU() + BYE() + '</div>');
        on('[data-copy]', function (b) { copyText(msg, function (ok) { b.textContent = ok ? T('ui_copied', 'コピーしました') : msg; }); });
        S.ctl.querySelectorAll('a[data-ch]').forEach(function (a) { a.addEventListener('click', function () { o.track('連絡', a.dataset.ch + ':' + k.label); }); });
        on('[data-menu]', function () { S.gen++; controls(''); say([ch().more], menu); });
        on('[data-bye]', bye);
      });
    });
  }
  function after(it) {
    if (it.id === 'C05') { S.last = it.id; return infoForm('receipt'); }
    if (it.id === 'B06') { S.last = it.id; return infoForm('model'); }
    if (it.id === 'C07') { // 興味を持ってくれた人には「追加したい」ボタン（11/10 三浦さん）
      var m = S.opts.mine || {};
      if ((m.wall || 0) > (m.set3 || 0)) {
        S.last = it.id;
        controls('<button type="button" class="btn primary wide" data-add="1">' + esc(T('ui_add_set3', '3点セットを追加したい')) + '</button>'
          + '<div class="tc-foot">' + MENU() + BYE() + '</div>');
        on('[data-add]', function () { S.opts.track('追加したい', '3点セット'); row('out', esc(T('ui_add_set3', '3点セットを追加したい'))); controls(''); say([V({
          buruyan: 'ええやん！何台分にする？', buruko: 'うれしいです！何台分にしますか？', burusama: 'いい判断よ。何台分にする？'
      }, 'ADD_ask')], function () { infoForm('set3'); }); });
        on('[data-menu]', function () { S.gen++; controls(''); say([ch().more], menu); });
        on('[data-bye]', bye);
        return;
      }
    }
    if (it.human && !S.mine) return contact(); // 人に回す形の問で、この予約から言えることも無いときだけ連絡先を出す
    S.last = it.id;
    say([ch().check], function () {
      // 「いいえ」はやめて「おしまい（特典あり）」に。人と話したい人は、その下の小さいボタンから（11/13 三浦さん）
      controls('<div class="choices tc-yn"><button type="button" class="btn primary" data-y="1">' + esc(T('ui_yes', 'はい')) + '</button><button type="button" class="btn ghost" data-bye="1">' + esc(T('ui_bye', 'おしまい（特典あり）')) + '</button></div>'
        + '<div class="tc-foot"><button type="button" class="tc-link" data-human="1">' + esc(T('ui_human_out', '人と話したい')) + '</button></div>');
      on('[data-y]', function () { S.opts.track('解決', 'はい:' + S.last); row('out', esc(T('ui_yes', 'はい'))); controls(''); say([ch().more], menu); });
      on('[data-bye]', function () { S.opts.track('解決', 'おしまい:' + S.last); bye(); });
      on('[data-human]', function () { S.opts.track('解決', '人と話したい:' + S.last); row('out', esc(T('ui_human_out', '人と話したい'))); handoff('人と話したい:' + S.last); });
    });
  }

  // 自由入力：② 端末内の照合 → ③ 裏側 → どちらもだめなら、2回目で人へ
  function free(raw) {
    var t = mask(raw);
    S.gen++;
    controls('');
    row('out', esc(t));
    var hit = localMatch(t);
    if (hit) {
      S.opts.track('質問', '入力:' + hit.id + ':' + t.slice(0, 80));
      if (!hit.open) return handoff('未確定:' + hit.id, true);
      note(T('ui_about', '「' + hit.q + '」のことでお答えします', {q: qLabel(hit)}));
      S.miss = 0;
      return say(answerLines(hit, hit.a[S.chara]), function () { after(hit); });
    }
    var used = +(store('thanks_ai_' + S.id) || 0);
    if (!S.opts.faqbotUrl || used >= AI_MAX) { S.opts.track('質問', '入力:なし:' + t.slice(0, 80)); return miss(); }
    store('thanks_ai_' + S.id, String(used + 1));
    var gen = S.gen;
    var r = row('in', '<span class="typing" aria-label="入力中"><i></i><i></i><i></i></span>');
    var body = { action: 'ask', id: S.id, chara: S.chara === 'bruce' ? 'buruko' : S.chara, text: t, ctx: S.opts.ctx || {} }; // 県は送らない
    fetch(S.opts.faqbotUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json(); })
      .then(function (j) {
        if (gen !== S.gen) return;
        r.remove();
        var it = j && j.ok && j.kind === 'answer' && item(j.item_id);
        if (it && it.open) {
          S.opts.track('質問', '入力:AI:' + it.id + ':' + t.slice(0, 80));
          note(T('ui_about', '「' + it.q + '」のことでお答えします', {q: qLabel(it)}));
          S.miss = 0;
          var lines = S.chara !== 'bruce' && Array.isArray(j.bubbles) && j.bubbles.length && j.bubbles.length <= 3 ? j.bubbles : it.a[S.chara];
          return say(answerLines(it, lines), function () { after(it); });
        }
        var closed = j && j.ok && j.kind === 'handoff' && item(j.item_id);
        S.opts.track('質問', '入力:' + (j && j.kind === 'limit' ? '上限' : closed ? 'AI:' + closed.id : 'なし') + ':' + t.slice(0, 80));
        if (j && j.kind === 'limit') return handoff('上限', true);
        if (closed) return handoff('未確定:' + closed.id, true);
        miss();
      })
      .catch(function () {
        if (gen !== S.gen) return;
        r.remove();
        S.opts.track('質問', '入力:裏側エラー:' + t.slice(0, 80));
        miss();
      });
  }
  function miss() {
    S.miss = (S.miss || 0) + 1;
    if (S.miss >= 2) return handoff('2回わからない', true);
    say([ch().miss], menu);
  }

  // ---------- 4. 人へつなぐ ----------
  function handoff(reason) {
    S.gen++;
    S.miss = 0;
    controls('');
    S.opts.track('人へ', reason);
    say(ch().handoff, contact);
  }
  // 電話・LINE の欄。人へつなぐ時と、おしまいの画面のいちばん下で使う
  function contactBox() {
    var o = S.opts;
    var msg = '受付番号 ' + S.id + ' について質問です。';
    return {
      html: '<div class="tc-contact"><b>' + esc(T('ui_contact', '人とお話しする')) + '</b>'
        + '<p>' + T('ui_tell_id', '受付番号 {id} をお伝えください。').split('{id}').map(esc).join('<b>' + esc(S.id) + '</b>') + '</p>'
        + (LG() ? '<p>' + esc(T('ui_ja_only', '')) + '</p>' : '') // 電話・LINE・当日のスタッフは日本語
        + '<a class="btn primary wide" href="tel:' + esc(o.phone.replace(/-/g, '')) + '">' + esc(T('ui_call', '電話する')) + ' ' + esc(o.phone) + '</a>'
        + (o.lineUrl ? '<a class="btn line wide" href="' + esc(o.lineUrl) + '" target="_blank" rel="noopener">' + esc(T('ui_line', 'LINE で聞く')) + '</a>'
          : '<p>' + esc(T('ui_line_note', 'LINE 公式「ありがとうエアコンサポート」のトークでも受け付けます。')) + '</p>')
        + '<button type="button" class="tc-link" data-copy="1">' + esc(T('ui_copy_msg', '「' + msg + '」をコピー', {msg: msg})) + '</button></div>',
      bind: function () {
        on('[data-copy]', function (b) {
          try { navigator.clipboard.writeText(msg).then(function () { b.textContent = T('ui_copied', 'コピーしました'); }, function () { b.textContent = msg; }); } catch (e) { b.textContent = msg; }
        });
        S.ctl.querySelectorAll('.tc-contact a').forEach(function (a) { a.addEventListener('click', function () { o.track('連絡', /^tel:/.test(a.getAttribute('href')) ? '電話' : 'LINE'); }); });
      }
    };
  }
  function contact() {
    var cb = contactBox();
    controls(cb.html + '<div class="tc-foot">' + MENU() + BYE() + '</div>');
    cb.bind();
    on('[data-menu]', function () { S.gen++; controls(''); say([ch().more], menu); });
    on('[data-bye]', bye);
  }

  // ---------- 5. おしまい：紹介リンクと星 ----------
  function bye() {
    S.gen++;
    controls('');
    row('out', esc(T('ui_bye_out', 'おしまい')));
    S.opts.track('おしまい', S.id + ':' + S.chara); // だれが押したかは受付番号で分かる（11/10 三浦さん）
    say(ch().bye, function () {
      var c = controls('<div class="tc-share"></div><div class="tc-stars"><b>' + esc(T('ui_stars', 'この案内係はどうでしたか？')) + '</b><div>'
        + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-star="' + n + '" aria-label="星' + n + 'つ">★</button>'; }).join('')
        + '</div></div><div class="tc-foot">' + MENU() + '</div>' + contactBox().html); // 紹介リンクがいちばん上、電話・LINE はいちばん下（11/13 三浦さん）
      contactBox().bind();
      if (S.opts.showShare) S.opts.showShare(c.querySelector('.tc-share'));
      on('[data-star]', function (b) {
        var n = +b.dataset.star;
        S.opts.track('星', S.id + ':' + n + ':' + S.chara); // 案内係を直す目安
        var box = c.querySelector('.tc-stars');
        box.innerHTML = '<b>' + '★★★★★'.slice(0, n) + '<span>' + '★★★★★'.slice(n) + '</span></b><p>' + esc(T('ui_thanks', 'ありがとうございました。')) + '</p>';
      });
      on('[data-menu]', function () { controls(''); say([ch().more], menu); });
    });
  }

  window.ThanksChat = {
    // opts: { id, mount, track(event, note), summary, ctx, mine, faqbotUrl, lineUrl, phone, showShare(el) }
    start: function (opts) {
      if (S) S.timers.forEach(clearTimeout);
      S = { opts: opts, id: opts.id, chara: null, gen: 0, miss: 0, timers: [] };
      addMine(opts.mine);
      opts.mount.innerHTML = '<div class="chat tc-log" aria-live="polite"></div><div class="tc-ctl" hidden></div>'
        + '<p class="tc-ai">このチャットは AI の案内係ロボが答えています。正式なご案内は担当者からの連絡が優先されます。</p>';
      opts.mount.hidden = false;
      S.log = opts.mount.querySelector('.tc-log');
      S.ctl = opts.mount.querySelector('.tc-ctl');
      intro(); // 毎回、最初に案内係を選んでもらう（前に選んだ子は「前回」の印だけ付ける。11/10 三浦さん）
    },
    active: function () { return !!S; },
    pick: function () { if (S) intro(true); }, // 画面は動かさない。新しい吹き出しが出る所だけ見せる
    _mask: mask, _match: localMatch
  };
})();
