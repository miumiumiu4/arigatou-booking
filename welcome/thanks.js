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
  // 絵はこのファイルと同じ場所（welcome/）から読む。welcome-test/ から読まれても同じ絵になる
  var HERE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');
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
    var src = HERE + (c ? D.chars[c].img : 'chara/base.svg');
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
      var c = D.chars[k], last = store(KEY) === k;
      return '<button type="button" class="tc-card' + (last ? ' last' : '') + '" data-c="' + k + '">' + (last ? '<i>前回</i>' : '') + '<img src="' + HERE + c.img + '" alt=""><b>' + esc(c.name) + '</b><span>' + esc(c.pick) + '</span></button>';
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
  // 「さっきの予約」に合わせた答え。opts.mine（このページの中だけにある予約の中身）から作り、どこにも送らない。
  // 金額・時間の数字は台帳の決まり（作業時間の目安・到着の幅・駐車場の扱い）から計算するだけで、新しい約束は作らない。
  function V(o) { return o[S.chara] || o.buruko; }
  function hm(min) { var h = Math.floor(min / 60), m = min % 60; return (h ? h + '時間' : '') + (m ? m + '分' : (h ? '' : '0分')); }
  var PAY = { onsite: '作業当日に現金', paypay: '作業当日に PayPay', paypal: 'PayPal の請求書（メールで届きます）' };
  var ARRIVE = { '9時〜12時': '8〜9時', '12時〜15時': '12〜14時', '15時〜18時': '15〜18時' };
  function dayLabel(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return '';
    var t = new Date(d + 'T12:00:00+09:00');
    return (t.getUTCMonth() + 1) + '月' + t.getUTCDate() + '日（' + '日月火水木金土'.charAt(t.getUTCDay()) + '）';
  }
  var MINE = {
    A02: function (m) { // 作業時間：通常60〜90分・お掃除機能付き90〜120分・室外機20〜30分（事務マニュアル01）
      var auto = Math.min(m.auto || 0, m.wall || 0), normal = (m.wall || 0) - auto, out = m.outdoorUnits || 0;
      if (!normal && !auto) return null;
      var lo = normal * 60 + auto * 90 + out * 20, hi = normal * 90 + auto * 120 + out * 30;
      var what = 'エアコン' + (normal + auto) + '台' + (auto ? '（うちお掃除機能付き' + auto + '台）' : '') + (out ? 'と室外機' + out + '台' : '');
      var span = hm(lo) + '〜' + hm(hi);
      var r = [V({
        buruyan: 'お客さんの予約は、' + what + 'やな。', buruko: 'ご予約は、' + what + 'ですね。',
        burusama: 'あなたの予約は、' + what + 'ね。', buruseijin: '記録によると、' + what + 'であります。'
      }), V({
        buruyan: 'それやと、だいたい' + span + 'くらい見といてな。', buruko: 'それだと、だいたい' + span + 'くらいです。',
        burusama: 'それなら、だいたい' + span + 'ってところね。', buruseijin: '計算結果は、およそ' + span + 'です。'
      }) + '（スタッフ1名で伺う目安です。機種や設置の状況で長くなることがあります）'];
      if (m.tenkase) r.push('天井埋め込み（天カセ）' + m.tenkase + '台の分は、機種で変わるので担当者からご案内します。');
      return r;
    },
    C04: function (m) {
      var pay = PAY[m.payment];
      if (!pay) return null;
      return [V({
        buruyan: 'さっきのフォームで「' + pay + '」を選んでくれてたで。', buruko: 'さきほどのフォームで「' + pay + '」を選んでいただいてます。',
        burusama: 'さっきのフォームで「' + pay + '」を選んでたわよ。', buruseijin: '記録によると、選択は「' + pay + '」であります。'
      }), 'お支払いは、作業が終わってからです。', V({
        buruyan: '変えたい時は、LINE か電話でひと言くれたらええよ。', buruko: '変えたい時は、LINE かお電話でひと言くださいね。',
        burusama: '変えたくなったら、LINE か電話でひと言ちょうだい。', buruseijin: '変更の際は、LINE か電話での連絡を推奨します。'
      })];
    },
    A01: function (m) {
      var day = dayLabel(m.date1), arr = ARRIVE[m.time1];
      if (!day || !arr) return null;
      return [V({
        buruyan: '第1希望は ' + day + ' の' + m.time1 + 'やな。', buruko: '第1希望は ' + day + ' の' + m.time1 + 'ですね。',
        burusama: '第1希望は ' + day + ' の' + m.time1 + 'ね。', buruseijin: '第1希望は ' + day + ' の' + m.time1 + 'と記録しています。'
      }), 'この時間帯だと、到着は ' + arr + ' のあいだです（作業が終わる時刻ではありません）。', '作業日は、担当者からのご連絡で確定します。'];
    },
    B03: function (m) {
      if (m.parking === '敷地内に駐車可') return [V({
        buruyan: '敷地内に停められるって書いてくれてたな。', buruko: '敷地内に停められると書いていただいてますね。',
        burusama: '敷地内に停められるのね、助かるわ。', buruseijin: '敷地内に駐車可能、と記録しています。'
      }), '駐車場がない場合にだけ、近くのコインパーキングの実費を別にいただきます。'];
      if (m.parking === '近隣コインパーキング利用') return [V({
        buruyan: '近くのコインパーキングを使う形やな。', buruko: '近くのコインパーキングを使う形ですね。',
        burusama: '近くのコインパーキングを使うのね。', buruseijin: '近隣のコインパーキング使用、と記録しています。'
      }), 'その場合は、コインパーキングの実費を別にいただきます。'];
      return null;
    },
    C05: function (m) { // 領収書：予約で書いた宛名を返す。書き忘れた人には、このあと記入欄を出す
      var r = m.receiptName ? V({
        buruyan: '領収書の宛名は「' + m.receiptName + '」で受けとるで。', buruko: '領収書の宛名は「' + m.receiptName + '」で承っています。',
        burusama: '領収書の宛名は「' + m.receiptName + '」で受けてるわよ。', buruseijin: '領収書の宛名は「' + m.receiptName + '」と記録しています。'
      }) : V({
        buruyan: '宛名を書き忘れてても大丈夫や。下の欄に書いてな。', buruko: '宛名を書き忘れても大丈夫ですよ。下の欄に書いてくださいね。',
        burusama: '宛名を書き忘れたなら、下の欄に書けばいいのよ。', buruseijin: '宛名の記入漏れは、下の欄で補えます。'
      });
      return [r, '領収書の発行のしかたは、担当者からご案内します。'];
    },
    B04: function (m) {
      if (m.pet !== 'あり') return null;
      var n = m.petCount ? m.petCount + '匹' : '';
      return [V({
        buruyan: 'ペット' + n + 'おるって書いてくれてたな。', buruko: 'ペットが' + n + 'いると書いていただいてますね。',
        burusama: 'ペット' + n + 'がいるのね。', buruseijin: 'ペット' + n + '、と記録しています。'
      }), 'フォームに書いていただいた内容は、担当者に伝わります。', V({
        buruyan: '気になることがあったら、下の「人へつなぐ」から聞いてな。', buruko: '気になることがあれば、下の「人へつなぐ」からどうぞ。',
        burusama: '気になることがあれば、下の「人へつなぐ」から聞いてちょうだい。', buruseijin: '詳細の確認は、下の「人へつなぐ」を推奨します。'
      })];
    }
  };
  // 「予約した内容を確認したい」：このページの中だけで、予約フォームに入れた中身を全部読み上げる
  var MY_A = {
    buruyan: ['さっきの予約、読み上げるで。', '{detail}', '違うとこあったら、受付番号 {id} と一緒に LINE か電話で教えてな。'],
    buruko: ['さきほどのご予約、確認しますね。', '{detail}', '違うところがあれば、受付番号 {id} と一緒に LINE かお電話で教えてくださいね。'],
    burusama: ['さっきの予約、ちゃんと見せるわね。', '{detail}', '違うところがあったら、受付番号 {id} を添えて LINE か電話で言ってちょうだい。'],
    buruseijin: ['先ほどの予約の記録を、読み上げます。', '{detail}', '相違があれば、受付番号 {id} を添えて LINE か電話での連絡を推奨します。以上であります。']
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
  // 領収書の宛名の記入欄。宛名は裏側にも計測にも送らず、受付番号つきの文にして確認メールへの返信で送ってもらう（登録のメアドから届き、受付番号で拾える。11/10 三浦さん）。見つからない時は LINE
  // （予約サイトの GAS は凍結中で、あとから宛名を書き足す受け口がまだ無い。受け口ができたらここから直接送る）
  function copyText(t, done) {
    done = done || function () {};
    try { navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
  }
  function receiptForm() {
    var o = S.opts, has = !!(o.mine && o.mine.receiptName);
    controls('<form class="tc-ask tc-rcpt"><input maxlength="40" placeholder="例：株式会社〇〇　／　〇〇 様" aria-label="領収書の宛名"><button class="btn primary">決める</button></form>'
      + '<p class="tc-hint">' + (has ? '宛名を変える時だけ書いてください。' : '領収書の宛名を書き忘れた方は、こちらに書いてください。') + '</p>'
      + '<div class="tc-foot"><button type="button" class="tc-link" data-menu="1">ほかの質問</button><button type="button" class="tc-link" data-bye="1">おしまい</button></div>');
    on('[data-menu]', function () { S.gen++; controls(''); say([ch().more], menu); });
    on('[data-bye]', bye);
    S.ctl.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = S.ctl.querySelector('form input').value.trim().slice(0, 40);
      if (!name) return;
      var msg = '受付番号 ' + S.id + ' の領収書の宛名：' + name;
      S.opts.track('領収書', '宛名を入力');
      row('out', esc('宛名：' + name));
      controls('');
      copyText(msg); // コピーできない端末は、吹き出しの文から写してもらう
      say([V({
        buruyan: '「' + name + '」やな。この文をコピーしといたで。', buruko: '「' + name + '」ですね。この文をコピーしておきました。',
        burusama: '「' + name + '」ね。この文、コピーしておいたわ。', buruseijin: '「' + name + '」、受信しました。下の文を複製済みであります。'
      }), msg, V({
        buruyan: 'さっき届いた確認メールに「返信」して、この文を貼り付けて送ってな。登録したメアドから届くから、受付番号ですぐ見つけられるねん。',
        buruko: 'さきほど届いた確認メールに「返信」して、この文を貼り付けて送ってくださいね。登録のメールアドレスから届くので、受付番号ですぐに見つけられます。',
        burusama: 'さっき届いた確認メールに「返信」して、この文を貼り付けて送ってちょうだい。登録したメアドから届くから、すぐ見つけられるのよ。',
        buruseijin: '先ほど受信した確認メールに「返信」し、この文を貼り付けて送信してください。登録アドレスからの通信は、受付番号で即座に照合できます。'
      }), 'メールが見つからない時は、LINE でも受け付けます。'], function () {
        controls((o.lineUrl ? '<a class="btn ghost wide" href="' + esc(o.lineUrl) + '" target="_blank" rel="noopener">メールが見つからない時は LINE で送る</a>' : '')
          + '<button type="button" class="tc-link tc-copy" data-copy="1">もう一度コピーする</button>'
          + '<div class="tc-foot"><button type="button" class="tc-link" data-menu="1">ほかの質問</button><button type="button" class="tc-link" data-bye="1">おしまい</button></div>');
        on('[data-copy]', function (b) { copyText(msg, function (ok) { b.textContent = ok ? 'コピーしました' : msg; }); });
        S.ctl.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { o.track('連絡', 'LINE:領収書'); }); });
        on('[data-menu]', function () { S.gen++; controls(''); say([ch().more], menu); });
        on('[data-bye]', bye);
      });
    });
  }
  function after(it) {
    if (it.id === 'C05') { S.last = it.id; return receiptForm(); }
    if (it.human && !S.mine) return contact(); // 人に回す形の問で、この予約から言えることも無いときだけ連絡先を出す
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
    pick: function () { if (S) { S.opts.mount.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); intro(true); } },
    _mask: mask, _match: localMatch
  };
})();
