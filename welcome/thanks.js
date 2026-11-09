// 予約を送ったあとの「案内係を選んで、当日までの質問に答える」チャット。
// 設計：予約後のキャラ選択チャット 設計書（2026-11-09）3節 画面の流れ・6節 裏側3段階・7節 個人情報・8節 計測
//   ① ボタン → ② この端末の中で台帳と照合 → ③ 当たらないときだけ裏側（FAQBOT_URL、空なら使わない）
// 話す中身は THANKS_DATA（FAQ台帳から作る）だけ。お名前・住所・電話・メールはここに来ない。
(function () {
  'use strict';
  var D = window.THANKS_DATA;
  var KEY = 'thanks_chara';
  var AI_MAX = 20; // 1受付番号あたり（裏側でも数える）
  var S = null;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function later(fn, ms) { S.timers.push(setTimeout(fn, reduce ? 0 : ms)); }
  function fill(t) { return String(t).replace(/\{id\}/g, S.id); }
  function ch() { return D.chars[S.chara]; }
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
      [it.q].concat(it.aliases || []).forEach(function (a) {
        var n = norm(a);
        if (n.length >= 2 && t.indexOf(n) >= 0 && n.length > score) { score = n.length; best = it; }
      });
    });
    return best;
  }

  // ---------- 吹き出し ----------
  function avatar(c) {
    var src = c ? D.chars[c].img : 'chara/base.svg';
    return '<div class="avatar chara" aria-hidden="true"><img src="' + src + '" alt=""></div>';
  }
  function row(side, html) {
    var r = document.createElement('div');
    r.className = 'row ' + side;
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
  function controls(html) {
    S.ctl.innerHTML = html || '';
    S.ctl.hidden = !html;
    return S.ctl;
  }
  function on(sel, fn) { S.ctl.querySelectorAll(sel).forEach(function (b) { b.addEventListener('click', function (e) { fn(b, e); }); }); }

  // ---------- 1. 案内係を選ぶ ----------
  function intro(again) {
    S.gen++;
    var prev = S.chara;
    S.chara = null;
    controls('');
    S.opts.track('キャラ表示', again ? '変える:' + prev : '');
    say([again ? '案内係を選び直せます。どの子にしますか？' : '当日までのこと、聞いておきませんか？ 案内係を選んでください。'], picker);
  }
  function picker() {
    var html = '<div class="tc-pick">' + Object.keys(D.chars).map(function (k) {
      var c = D.chars[k];
      return '<button type="button" class="tc-card" data-c="' + k + '"><img src="' + c.img + '" alt=""><b>' + esc(c.name) + '</b><span>' + esc(c.pick) + '</span></button>';
    }).join('') + '</div>';
    controls(html);
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
    say(ch().hello, menu);
  }

  // ---------- 2. 質問のボタン＋自由入力 ----------
  function menu(all) {
    var list = all ? D.items : D.quick.map(function (q) { var it = item(q[0]); return { id: it.id, q: q[1] }; });
    var html = '<div class="tc-quick' + (all ? ' all' : '') + '">' + list.map(function (it) {
      return '<button type="button" class="btn ghost" data-q="' + it.id + '">' + esc(it.q) + '</button>';
    }).join('') + '</div>'
      + (all ? '' : '<button type="button" class="tc-link" data-more="1">ほかの質問も見る</button>')
      + '<form class="tc-ask" autocomplete="off"><input name="t" maxlength="200" placeholder="ほかに聞きたいことを入力" aria-label="聞きたいこと"><button type="submit" class="btn primary">送る</button></form>'
      + '<p class="tc-hint">お名前・電話番号・ご住所は入れないでください。</p>'
      + '<div class="tc-foot"><button type="button" class="tc-link" data-human="1">人へつなぐ</button><button type="button" class="tc-link" data-bye="1">おしまい</button></div>';
    controls(html);
    on('[data-q]', function (b) { ask(b.dataset.q, 'ボタン', item(b.dataset.q).q); });
    on('[data-more]', function () { menu(true); });
    on('[data-human]', function () { row('out', '人と話したい'); handoff('ボタン'); });
    on('[data-bye]', bye);
    S.ctl.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = e.target.t.value.trim();
      if (t) free(t);
    });
  }

  // ---------- 3. 答え ----------
  function answerLines(it, lines) {
    lines = lines.map(fill);
    if (it.id === 'C01' && S.opts.summary) lines.splice(1, 0, S.opts.summary); // 「私の料金は？」はこの画面の内訳をそのまま
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
  function after(it) {
    if (it.human) return contact(); // 人に回す形の問は、答えのあとに連絡先を出す
    S.last = it.id;
    say([ch().check], function () {
      controls('<div class="choices tc-yn"><button type="button" class="btn primary" data-y="1">はい</button><button type="button" class="btn ghost" data-n="1">いいえ</button></div>');
      on('[data-y]', function () { S.opts.track('解決', 'はい:' + S.last); row('out', 'はい'); controls(''); say([ch().more], menu); });
      on('[data-n]', function () { S.opts.track('解決', 'いいえ:' + S.last); row('out', 'いいえ'); handoff('いいえ:' + S.last); });
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
      note('「' + hit.q + '」のことでお答えします');
      S.miss = 0;
      return say(answerLines(hit, hit.a[S.chara]), function () { after(hit); });
    }
    var used = +(store('thanks_ai_' + S.id) || 0);
    if (!S.opts.faqbotUrl || used >= AI_MAX) { S.opts.track('質問', '入力:なし:' + t.slice(0, 80)); return miss(); }
    store('thanks_ai_' + S.id, String(used + 1));
    var gen = S.gen;
    var r = row('in', '<span class="typing" aria-label="入力中"><i></i><i></i><i></i></span>');
    var body = { action: 'ask', id: S.id, chara: S.chara, text: t, ctx: S.opts.ctx || {} };
    fetch(S.opts.faqbotUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json(); })
      .then(function (j) {
        if (gen !== S.gen) return;
        r.remove();
        var it = j && j.ok && j.kind === 'answer' && item(j.item_id);
        if (it && it.open) {
          S.opts.track('質問', '入力:AI:' + it.id + ':' + t.slice(0, 80));
          note('「' + it.q + '」のことでお答えします');
          S.miss = 0;
          var lines = Array.isArray(j.bubbles) && j.bubbles.length && j.bubbles.length <= 3 ? j.bubbles : it.a[S.chara];
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
  function contact() {
    var o = S.opts;
    var msg = '受付番号 ' + S.id + ' について質問です。';
    var html = '<div class="tc-contact"><b>人とお話しする</b>'
      + '<p>受付番号 <b>' + esc(S.id) + '</b> をお伝えください。</p>'
      + '<a class="btn primary wide" href="tel:' + esc(o.phone.replace(/-/g, '')) + '">電話する ' + esc(o.phone) + '</a>'
      + (o.lineUrl ? '<a class="btn line wide" href="' + esc(o.lineUrl) + '" target="_blank" rel="noopener">LINE で聞く</a>'
        : '<p>LINE 公式「ありがとうエアコンサポート」のトークでも受け付けます。</p>')
      + '<button type="button" class="tc-link" data-copy="1">「' + esc(msg) + '」をコピー</button></div>'
      + '<div class="tc-foot"><button type="button" class="tc-link" data-menu="1">ほかの質問</button><button type="button" class="tc-link" data-bye="1">おしまい</button></div>';
    controls(html);
    on('[data-copy]', function (b) {
      try { navigator.clipboard.writeText(msg).then(function () { b.textContent = 'コピーしました'; }); } catch (e) { b.textContent = msg; }
    });
    S.ctl.querySelectorAll('.tc-contact a').forEach(function (a) { a.addEventListener('click', function () { o.track('連絡', /^tel:/.test(a.getAttribute('href')) ? '電話' : 'LINE'); }); });
    on('[data-menu]', function () { S.gen++; controls(''); say([ch().more], menu); });
    on('[data-bye]', bye);
  }

  // ---------- 5. おしまい：紹介リンクと星 ----------
  function bye() {
    S.gen++;
    controls('');
    row('out', 'おしまい');
    S.opts.track('おしまい', S.chara);
    say(ch().bye, function () {
      var c = controls('<div class="tc-share"></div><div class="tc-stars"><b>この案内係はどうでしたか？</b><div>'
        + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-star="' + n + '" aria-label="星' + n + 'つ">★</button>'; }).join('')
        + '</div></div><div class="tc-foot"><button type="button" class="tc-link" data-menu="1">ほかの質問</button></div>');
      if (S.opts.showShare) S.opts.showShare(c.querySelector('.tc-share'));
      on('[data-star]', function (b) {
        var n = +b.dataset.star;
        S.opts.track('星', n + ':' + S.chara);
        var box = c.querySelector('.tc-stars');
        box.innerHTML = '<b>' + '★★★★★'.slice(0, n) + '<span>' + '★★★★★'.slice(n) + '</span></b><p>ありがとうございました。</p>';
      });
      on('[data-menu]', function () { controls(''); say([ch().more], menu); });
    });
  }

  window.ThanksChat = {
    // opts: { id, mount, track(event, note), summary, ctx, faqbotUrl, lineUrl, phone, showShare(el) }
    start: function (opts) {
      if (S) S.timers.forEach(clearTimeout);
      S = { opts: opts, id: opts.id, chara: null, gen: 0, miss: 0, timers: [] };
      opts.mount.innerHTML = '<div class="chat tc-log" aria-live="polite"></div><div class="tc-ctl" hidden></div>'
        + '<p class="tc-ai">このチャットは AI の案内係ロボが答えています。正式なご案内は担当者からの連絡が優先されます。</p>';
      opts.mount.hidden = false;
      S.log = opts.mount.querySelector('.tc-log');
      S.ctl = opts.mount.querySelector('.tc-ctl');
      var saved = store(KEY);
      if (saved && D.chars[saved]) choose(saved, true); else intro();
    },
    active: function () { return !!S; },
    pick: function () { if (S) { S.opts.mount.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); intro(true); } },
    _mask: mask, _match: localMatch
  };
})();
