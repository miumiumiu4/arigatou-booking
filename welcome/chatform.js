// 会話型の予約フォーム（11/19 三浦さん「会話型の予約フォームに変更して」）
// キャラが1問ずつ聞き、答えをいつもの予約フォーム（#form）の欄にそのまま入れる。
// 送るときは、いつものフォームの「この内容で予約する」と同じ処理（同じ必須チェック・同じ送り先・同じ中身）を使う。
// なので、予約の受付（凍結中の予約サイト GAS）から見ると、今までのフォームと区別がつかない。
// 使い方：index.html が ChatForm.init(api) → ChatForm.begin()。welcome-test/ からも同じファイルを読む。
(function () {
  'use strict';
  var A = null, box = null, cur = -1, hist = [], editTo = '', busy = false, autoUnknown = false;

  function $(id) { return A.$(id); }
  function st() { return A.getSt(); }
  function make(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fire(e) { e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function setVal(id, v) { var e = $(id); e.value = v; fire(e); }
  function radios(name) { return [].slice.call(document.querySelectorAll('#form input[name="' + name + '"]')); }
  function radioVal(name) { var r = document.querySelector('#form input[name="' + name + '"]:checked'); return r ? r.value : ''; }
  function setRadio(name, v) { radios(name).forEach(function (r) { if (r.value === v) { r.checked = true; fire(r); } }); }
  function options(id) { return [].slice.call($(id).options).filter(function (o) { return o.value !== ''; }); }
  function clamp() { var s = st(); Object.keys(s).forEach(function (k) { if (s[k] > A.maxOf(k)) s[k] = A.maxOf(k); }); A.renderEst(); }
  function yen(n) { return A.yen(n) + '円'; }
  function digits(s) { return String(s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/\D/g, ''); }
  function han(s) { return String(s).replace(/[０-９Ａ-Ｚａ-ｚ＠．－＿]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/[ー−‐]/g, '-'); }
  function dateLabel(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    var t = new Date(d + 'T12:00:00+09:00');
    return (t.getUTCMonth() + 1) + '/' + t.getUTCDate() + '（' + '日月火水木金土'.charAt(t.getUTCDay()) + '）';
  }

  // ---------- 部品 ----------
  function chips(list, onPick, cls) {
    var w = make('div', 'cf-chips' + (cls ? ' ' + cls : ''));
    list.forEach(function (c) {
      var b = make('button', 'btn ' + (c.primary ? 'primary' : 'ghost'), c.label);
      b.type = 'button';
      b.addEventListener('click', function () { if (!busy) onPick(c); });
      w.appendChild(b);
    });
    return w;
  }
  // 1行の入力＋「決定」。check が文字を返したら、キャラがそれを言って入れ直してもらう
  function field(o) {
    var f = make('form', 'cf-field');
    f.noValidate = true;
    var i = make('input');
    i.type = o.type || 'text';
    ['placeholder', 'autocomplete', 'inputMode', 'min', 'max'].forEach(function (k) { if (o[k] != null) i[k] = o[k]; });
    i.value = o.value || '';
    i.setAttribute('aria-label', o.aria || o.placeholder || '入力');
    var b = make('button', 'btn primary', o.button || '決定');
    b.type = 'submit';
    f.appendChild(i); f.appendChild(b);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var v = i.value.trim(), bad = o.check ? o.check(v) : (v ? '' : 'ご入力をお願いします。');
      if (bad) { hint(bad); i.focus(); return; }
      o.done(v);
    });
    setTimeout(function () { if (o.focus !== false) try { i.focus({ preventScroll: true }); } catch (_) {} }, 50);
    return f;
  }
  function hint(text) {
    var h = box.querySelector('.cf-err');
    if (!h) { h = make('p', 'cf-err'); h.setAttribute('role', 'alert'); box.insertBefore(h, box.firstChild); }
    h.textContent = text;
  }
  function counter(key, label, sub) {
    var row = make('div', 'cf-ctr');
    var t = make('div', 't'); t.appendChild(make('b', '', label)); t.appendChild(make('span', '', sub));
    var c = make('div', 'ctr');
    var minus = make('button', '', '−'), out = make('output', '', String(st()[key])), plus = make('button', '', '＋');
    minus.type = plus.type = 'button';
    minus.setAttribute('aria-label', label + 'を減らす'); plus.setAttribute('aria-label', label + 'を増やす');
    function show() { out.textContent = st()[key]; minus.disabled = st()[key] <= 0; plus.disabled = st()[key] >= A.maxOf(key); }
    minus.addEventListener('click', function () { st()[key] = Math.max(0, st()[key] - 1); clamp(); refresh(); });
    plus.addEventListener('click', function () { st()[key] = st()[key] + 1; clamp(); refresh(); });
    c.appendChild(minus); c.appendChild(out); c.appendChild(plus);
    row.appendChild(t); row.appendChild(c);
    row._show = show;
    return row;
  }
  function refresh() {
    [].forEach.call(box.querySelectorAll('.cf-ctr'), function (r) { r._show(); });
    var e = box.querySelector('.cf-est b'); if (e) e.textContent = yen(A.total());
  }
  function estLine() { var p = make('p', 'cf-est'); p.appendChild(document.createTextNode('概算 ')); p.appendChild(make('b', '', yen(A.total()))); p.appendChild(document.createTextNode('（税込・駐車場代別）')); return p; }

  // ---------- 質問（順番どおり） ----------
  var S = [
    { key: 'units', group: 'menu',
      q: function () { return 'では、ご予約の内容をひとつずつうかがいますね。\nエアコンは何台ですか？（壁に掛けるタイプの台数）'; },
      ui: function () {
        var l = [1, 2, 3, 4, 5].map(function (n) { return { label: n + '台', n: n }; });
        l.push({ label: '6台以上', more: true }, { label: '壁掛けはない（天井埋め込みだけ）', n: 0 });
        return chips(l, function (c) {
          if (c.more) { put(field({ type: 'number', inputMode: 'numeric', min: 6, max: 20, placeholder: '台数（6〜20）', check: function (v) { var n = +digits(v); return n >= 6 && n <= 20 ? '' : '6〜20 の数字で入れてください。21台以上は備考に書いてください。'; }, done: function (v) { setUnits(+digits(v)); } })); return; }
          setUnits(c.n);
        }, 'cf-grid3');
        function setUnits(n) { st().units = n; clamp(); answer(n ? n + '台' : '壁掛けはない'); }
      } },
    { key: 'tenkase', group: 'menu',
      q: function () { return '天井に埋め込むタイプ（天カセ・業務用）もありますか？\n（1台目 23,300円・2台目から 22,300円/台。対応できない地域は担当者からご連絡します）'; },
      ui: function () {
        return chips([{ label: 'ない', n: 0 }, { label: '1台', n: 1 }, { label: '2台', n: 2 }, { label: '3台以上', more: true }], function (c) {
          if (c.more) { put(field({ type: 'number', inputMode: 'numeric', min: 3, max: 20, placeholder: '台数（3〜20）', check: function (v) { var k = +digits(v); return k >= 3 && k <= 20 ? '' : '3〜20 の数字で入れてください。'; }, done: function (v) { set(+digits(v)); } })); return; }
          set(c.n);
        }, 'cf-grid3');
        function set(k) {
          st().tenkase = k; clamp();
          if (st().units + st().tenkase < 1) { hint('エアコンの台数が0台になっています。壁掛けか天井埋め込みの台数を選んでください。'); return; }
          answer(k ? k + '台' : 'ない');
        }
      } },
    { key: 'name', group: 'contact',
      q: function () { return 'ここまでの概算は ' + yen(A.total()) + '（税込・駐車場代別）です。\nつづいて、ご予約のお名前を教えてください。'; },
      ui: function () { return field({ value: $('f_name').value, placeholder: '例：山田 太郎', autocomplete: 'name', done: function (v) { setVal('f_name', v); answer(v); } }); } },
    { key: 'kana', group: 'contact',
      q: function () { return 'ありがとうございます。お名前のふりがなもお願いします。'; },
      ui: function () { return field({ value: $('f_kana').value, placeholder: '例：やまだ たろう', done: function (v) { setVal('f_kana', v); answer(v); } }); } },
    { key: 'phone', group: 'contact',
      q: function () { return '当日つながる電話番号を教えてください。'; },
      ui: function () {
        return field({ type: 'tel', inputMode: 'tel', autocomplete: 'tel', value: $('f_phone').value, placeholder: '例：090-1234-5678',
          check: function (v) { var d = digits(v); return d.length >= 10 && d.length <= 13 ? '' : '電話番号を数字で入れてください（例：090-1234-5678）。'; },
          done: function (v) { v = han(v); setVal('f_phone', v); answer(v); } });
      } },
    { key: 'email', group: 'contact',
      q: function () { return 'メールアドレスを教えてください。\n（ご予約の確認メールをお送りします）'; },
      ui: function () {
        return field({ type: 'email', inputMode: 'email', autocomplete: 'email', value: $('f_email').value, placeholder: '例：taro@example.com',
          check: function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(han(v)) ? '' : 'メールアドレスの形をご確認ください（例：taro@example.com）。'; },
          done: function (v) { v = han(v); setVal('f_email', v); answer(v); } });
      } },
    { key: 'area', group: 'place',
      q: function () { return '作業する場所をうかがいます。都府県を選んでください。'; },
      ui: function () {
        return chips(options('f_area').map(function (o) { return { label: o.value.replace(/（.*）$/, ''), v: o.value }; }), function (c) { setVal('f_area', c.v); answer(c.label); }, 'cf-grid3');
      } },
    { key: 'address', group: 'place',
      q: function () { return 'ご住所を、市区町村から番地・建物名・お部屋の番号までお願いします。' + (/^その他/.test($('f_area').value) ? '\n（都道府県から書いてください）' : ''); },
      ui: function () { return field({ value: $('f_address').value, autocomplete: 'street-address', placeholder: '例：横浜市中区〇〇町1-2-3 〇〇マンション101', done: function (v) { setVal('f_address', v); answer(v); } }); } },
    { key: 'housing', group: 'place',
      q: function () { return 'お住まいのタイプはどれですか？'; },
      ui: function () { return chips(radios('housing').map(function (r) { return { label: r.value, v: r.value }; }), function (c) { setRadio('housing', c.v); answer(c.label); }); } }
  ];
  ['1', '2', '3'].forEach(function (n) {
    S.push({ key: 'date' + n, group: 'date',
      q: function () {
        var min = $('date1').min ? dateLabel($('date1').min) + '以降' : '明後日以降';
        if (n === '1') return '作業のご希望日を3つうかがいます。\nまず第1希望の日にちと時間を選んでください（' + min + '）。';
        return '第' + n + '希望の日にちと時間を選んでください。';
      },
      ui: function () {
        var w = make('div', 'cf-card'), d = make('input');
        d.type = 'date'; d.min = $('date' + n).min; d.value = $('date' + n).value; d.setAttribute('aria-label', '第' + n + '希望の日にち');
        w.appendChild(make('p', 'cf-label', '日にち'));
        w.appendChild(d);
        w.appendChild(make('p', 'cf-label', '時間（押すと決まります）'));
        w.appendChild(chips(radios('time' + n).map(function (r) { return { label: r.value, v: r.value }; }), function (c) {
          var v = d.value;
          if (!v) { hint('先に日にちを選んでください。'); return; }
          if (d.min && v < d.min) { hint(dateLabel(d.min) + '以降の日にちを選んでください。'); return; }
          var same = ['1', '2', '3'].filter(function (m) { return m !== n && $('date' + m).value === v && radioVal('time' + m) === c.v; });
          if (same.length) { hint('第' + same[0] + '希望と同じ日にち・時間です。別の日にちか時間を選んでください。'); return; }
          setVal('date' + n, v); setRadio('time' + n, c.v);
          answer(dateLabel(v) + ' ' + c.v);
        }, 'cf-grid2'));
        return w;
      } });
  });
  S.push(
    { key: 'pet', group: 'pay',
      q: function () { return 'ペットはいますか？'; },
      ui: function () {
        return chips([{ label: 'いない', v: 'なし' }, { label: 'いる', v: 'あり' }], function (c) {
          setRadio('pet', c.v);
          if (c.v === 'なし') { setVal('f_petCount', ''); answer('いない'); return; }
          box.innerHTML = '';
          box.appendChild(make('p', 'cf-label', '何匹いますか？'));
          put(chips([1, 2, 3].map(function (k) { return { label: k + '匹', k: k }; }).concat([{ label: '4匹以上', more: true }]), function (p) {
            if (p.more) { put(field({ type: 'number', inputMode: 'numeric', min: 4, max: 20, placeholder: '数（4〜20）', check: function (v) { var k = +digits(v); return k >= 4 && k <= 20 ? '' : '4〜20 の数字で入れてください。'; }, done: function (v) { setVal('f_petCount', String(+digits(v))); answer('いる（' + (+digits(v)) + '匹）'); } })); return; }
            setVal('f_petCount', String(p.k)); answer('いる（' + p.k + '匹）');
          }, 'cf-grid2'));
          put(foot());
        }, 'cf-grid2');
      } },
    { key: 'optional', group: 'other',
      q: function () { return '必ずうかがうことは以上です。ありがとうございます。\nここから下は任意です。必要なところだけ入れて「確認へ進む」を押してください（なければ、そのまま進めます）。\n※ご希望日での対応が難しい場合は、1〜2日以内に日程の再調整のご連絡をします。'; },
      ui: optionalCard },
    { key: 'confirm', group: 'confirm',
      q: function () { return 'ありがとうございます。ご予約の内容をご確認ください。'; },
      ui: confirmCard }
  );
  function idx(key) { for (var i = 0; i < S.length; i++) if (S[i].key === key) return i; return -1; }

  // 任意の項目は1問ずつ聞かず、表（カード）でまとめて入れる（11/22 決定：会話は必ず要る項目だけ。長いと途中でやめる人が増えるため）。
  // 入れた値は、いつものフォームの欄にそのまま書き写す
  function optionalCard() {
    var w = make('div', 'cf-card cf-extra');
    function label(t) { w.appendChild(make('p', 'cf-label', t)); }
    function checks(name, title) {
      label(title);
      var g = make('div', 'cf-checks');
      document.querySelectorAll('#form input[name="' + name + '"]').forEach(function (orig) {
        var l = make('label'), c = make('input');
        c.type = 'checkbox'; c.checked = orig.checked;
        c.addEventListener('change', function () { orig.checked = c.checked; fire(orig); refresh(); });
        l.appendChild(c); l.appendChild(document.createTextNode(orig.parentNode.textContent.trim()));
        g.appendChild(l);
      });
      w.appendChild(g);
    }
    function text(id, title, ph, multi, attrs) {
      label(title);
      var orig = $(id), e = make(multi ? 'textarea' : 'input');
      e.value = orig.value; if (ph) e.placeholder = ph; e.setAttribute('aria-label', title);
      Object.keys(attrs || {}).forEach(function (k) { e[k] = attrs[k]; });
      e.addEventListener('input', function () { orig.value = e.value; fire(orig); });
      w.appendChild(e);
      return e;
    }
    function select(id, title) {
      label(title);
      var orig = $(id), e = make('select');
      [].forEach.call(orig.options, function (o) { var n = make('option', '', o.textContent); n.value = o.value; e.appendChild(n); });
      e.value = orig.value; e.setAttribute('aria-label', title);
      e.addEventListener('change', function () { setVal(id, e.value); });
      w.appendChild(e);
    }
    var skip = chips([{ label: 'とくにない（そのまま確認へ）' }], function () { answer('任意の項目はなし'); }, 'cf-one');
    w.appendChild(skip);
    if (st().units) {
      label('お掃除機能付きの台数（＋6,000円/台）');
      w.appendChild(counter('auto', 'お掃除機能付き', 'フィルターを自動でお掃除する機種'));
      var ul = make('label', 'cf-check1'), uc = make('input');
      uc.type = 'checkbox'; uc.checked = autoUnknown;
      uc.addEventListener('change', function () { autoUnknown = uc.checked; });
      ul.appendChild(uc); ul.appendChild(document.createTextNode('お掃除機能付きか分からない'));
      w.appendChild(ul);
    }
    label('オプション（エアコンの台数分まで）');
    w.appendChild(counter('set3', '3点セット', '防カビ抗菌コート＋室外機＋ドレンホース｜7,500円/台（別々より2,000円お得）'));
    w.appendChild(counter('coat', '防カビ・抗菌コート', '3,000円/台'));
    w.appendChild(counter('outdoor', '室外機クリーニング', '4,000円/台'));
    w.appendChild(counter('drain', 'ドレンホース洗浄', '2,500円/台'));
    w.appendChild(counter('omatome', 'おまとめセット', '室外機＋防カビ・抗菌コート｜5,000円/台'));
    checks('extra', 'その他のお掃除（概算に入ります）');
    label('スタッフの指名');
    var nl = make('label', 'cf-check1'), nc = make('input');
    nc.type = 'checkbox'; nc.checked = $('f_nominate').checked;
    nl.appendChild(nc); nl.appendChild(document.createTextNode('指名を希望する（＋3,000円）'));
    w.appendChild(nl);
    var nn = text('f_nominateName', 'ご希望のスタッフ名', '');
    function nomShow() { nn.hidden = nn.previousSibling.hidden = !nc.checked; }
    nc.addEventListener('change', function () { $('f_nominate').checked = nc.checked; fire($('f_nominate')); nomShow(); refresh(); });
    nomShow();
    w.appendChild(estLine());
    select('f_payment', 'お支払い方法');
    select('f_parking', '作業の車を停める場所（駐車場代は別途実費）');
    text('f_zip', '郵便番号', '例：231-0001', false, { inputMode: 'numeric' });
    text('f_model', 'メーカー名と型式番号（わかる範囲で）', '例：ダイキン AN22XXX');
    checks('consult', 'エアコン以外のお掃除のご相談（料金は担当者からご案内します）');
    text('f_receiptName', '領収書の宛名（必要な方）', '例：株式会社〇〇　／　〇〇 様');
    select('f_how', '当店を何でお知りになりましたか');
    text('f_note', 'ご要望・備考', '設置場所、気になる症状、10年以上の機種かどうか など', true);
    text('f_coupon', 'クーポンコード', '');
    text('ref_code', '紹介コード（ご紹介された方）', '例：R0929-311');
    w.appendChild(chips([{ label: '確認へ進む', primary: true }], function () {
      var s = st(), said = [];
      var NAMES = { set3: '3点セット', coat: '防カビ・抗菌コート', outdoor: '室外機', drain: 'ドレンホース', omatome: 'おまとめセット' };
      if (s.auto) said.push('お掃除機能付き ' + s.auto + '台'); else if (autoUnknown) said.push('お掃除機能付きか分からない');
      Object.keys(NAMES).forEach(function (k) { if (s[k]) said.push(NAMES[k] + ' ' + s[k] + '台'); });
      document.querySelectorAll('#form input[name=extra]:checked').forEach(function (c) { said.push(c.value.replace(/（.*）$/, '')); });
      if ($('f_nominate').checked) said.push('スタッフ指名');
      if (document.querySelector('#form input[name=consult]:checked')) said.push('ほかのお掃除の相談');
      ['f_zip', 'f_model', 'f_receiptName', 'f_how', 'f_note', 'f_coupon'].forEach(function (id) { if ($(id).value.trim()) said.push({ f_zip: '郵便番号', f_model: '型番', f_receiptName: '領収書の宛名', f_how: 'きっかけ', f_note: '備考', f_coupon: 'クーポン' }[id]); });
      answer(said.length ? said.join('、') + ' を入れました' : '任意の項目はなし');
    }, 'cf-one'));
    setTimeout(refresh, 0);
    return w;
  }

  // 確認：内容を一覧で見せ、「この内容で予約する」か「直す」
  var FIX = [
    { label: '台数', key: 'units', end: 'tenkase' },
    { label: 'お名前・連絡先', key: 'name', end: 'email' },
    { label: '作業の場所', key: 'area', end: 'housing' },
    { label: '希望日', key: 'date1', end: 'date3' },
    { label: 'ペット', key: 'pet', end: 'pet' },
    { label: 'オプション・そのほか', key: 'optional', end: 'optional' }
  ];
  function confirmCard() {
    var s = st(), w = make('div', 'cf-card cf-confirm');
    var NAMES = { set3: '3点セット', coat: '防カビ・抗菌コート', outdoor: '室外機クリーニング', drain: 'ドレンホース洗浄', omatome: 'おまとめセット' };
    var menu = [];
    if (s.units) menu.push('エアコン（壁掛け）' + s.units + '台' + (s.auto ? '（うちお掃除機能付き ' + s.auto + '台）' : autoUnknown ? '（お掃除機能付きか分からない）' : ''));
    if (s.tenkase) menu.push('天井埋め込み ' + s.tenkase + '台');
    Object.keys(NAMES).forEach(function (k) { if (s[k]) menu.push(NAMES[k] + ' ' + s[k] + '台'); });
    document.querySelectorAll('#form input[name=extra]:checked').forEach(function (c) { menu.push(c.value.replace(/（.*）$/, '')); });
    if ($('f_nominate').checked) menu.push('スタッフ指名' + ($('f_nominateName').value.trim() ? '（' + $('f_nominateName').value.trim() + '）' : ''));
    var pay = $('f_payment'), rows = [
      ['ご依頼の内容', menu.join('\n')],
      ['概算', yen(A.total()) + '（税込・駐車場代別）'],
      ['お名前', $('f_name').value + '（' + $('f_kana').value + '）様'],
      ['電話', $('f_phone').value],
      ['メール', $('f_email').value],
      ['作業の場所', ($('f_zip').value ? '〒' + $('f_zip').value + ' ' : '') + $('f_area').value.replace(/（.*）$/, '') + ' ' + $('f_address').value + '\n' + radioVal('housing')],
      ['希望日', ['1', '2', '3'].map(function (n) { return '第' + n + ' ' + dateLabel($('date' + n).value) + ' ' + radioVal('time' + n); }).join('\n')],
      ['お支払い', pay.options[pay.selectedIndex].textContent],
      ['駐車場', $('f_parking').value],
      ['ペット', radioVal('pet') === 'あり' ? 'いる（' + ($('f_petCount').value || '?') + '匹）' : 'いない']
    ];
    var more = [];
    document.querySelectorAll('#form input[name=consult]:checked').forEach(function (c) { more.push(c.parentNode.textContent.trim()); });
    if (more.length) rows.push(['ご相談', more.join('、')]);
    [['f_model', 'メーカー・型番'], ['f_receiptName', '領収書の宛名'], ['f_coupon', 'クーポン'], ['ref_code', '紹介コード'], ['f_how', 'きっかけ'], ['f_note', '備考']].forEach(function (p) { if ($(p[0]).value.trim()) rows.push([p[1], $(p[0]).value.trim()]); });
    var dl = make('dl');
    rows.forEach(function (r) { dl.appendChild(make('dt', '', r[0])); dl.appendChild(make('dd', '', r[1])); });
    w.appendChild(dl);
    w.appendChild(make('p', 'cf-note', '送信後、確認メールをお送りします。作業日はご予約から5営業日以内に担当者よりご連絡し確定します。'));
    var msg = $('formMsg'); w.appendChild(msg);
    var go = chips([{ label: 'この内容で予約する', primary: true }], submit, 'cf-one');
    w.appendChild(go);
    w.appendChild(make('p', 'cf-label', '直したいところ'));
    w.appendChild(chips(FIX.map(function (f) { return { label: f.label, f: f }; }), function (c) {
      A.track('会話フォーム:直す', c.f.label);
      A.addRow('out', A.esc(c.f.label + 'を直したい'));
      editTo = c.f.end; hist = []; ask(idx(c.f.key));
    }, 'cf-grid2'));
    return w;
  }

  function submit() {
    var bad = A.formError();
    if (bad) {
      // いつものフォームと同じ必須チェック。足りないところの質問へ戻る
      var to = { f_name: 'name', f_kana: 'kana', f_phone: 'phone', f_email: 'email', f_area: 'area', f_address: 'address', date1: 'date1', date2: 'date2', date3: 'date3', housing: 'housing', o_units: 'units', pet: 'pet' }[bad.el.id] || 'units';
      editTo = 'confirm'; hist = [];
      A.say(bad.text, function () { ask(idx(to), true); });
      return;
    }
    // 「お掃除機能付きか分からない」は備考の頭に1行（担当者が当日の段取りに使う）。送り直しても重ならないように
    var MARK = '【お掃除機能付き】分からない（会話フォームで回答）';
    var note = $('f_note').value.split('\n').filter(function (l) { return l !== MARK; }).join('\n');
    $('f_note').value = autoUnknown ? MARK + (note ? '\n' + note : '') : note;
    var btn = box.querySelector('.cf-confirm .cf-one .btn');
    btn.disabled = true; btn.textContent = '送信中…';
    busy = true;
    A.track('会話フォーム:送信');
    var f = $('form');
    if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true }));
    // 送れなかったとき（いつものフォームの処理が formMsg を出す）は、押し直せるように戻す
    var orig = f.querySelector('button[type=submit]'), t = setInterval(function () {
      if (orig.disabled) return;
      clearInterval(t); busy = false;
      if (!$('formMsg').hidden) { btn.disabled = false; btn.textContent = 'この内容で予約する'; }
    }, 300);
  }

  // ---------- 進め方 ----------
  function put(node) { box.appendChild(node); box.hidden = false; scrollToBox(); }
  // 長い表（任意の項目）は、下端ではなく上端（「とくにない」のボタン）が見えるように寄せる
  function scrollToBox() { setTimeout(function () { try { var top = cur >= 0 && S[cur] && S[cur].key === 'optional'; box.scrollIntoView({ block: top ? 'start' : 'end', behavior: A.reduce ? 'auto' : 'smooth' }); } catch (_) {} }, 30); }
  function ask(i, quiet) {
    while (i < S.length && S[i].skip && S[i].skip()) i++;
    cur = i;
    var s = S[i];
    restoreMsg(); // 確認カードの中の「送れませんでした」欄を、消す前にフォームへ戻す
    box.hidden = true; box.innerHTML = '';
    var show = function () {
      box.innerHTML = '';
      var u = s.ui(); if (u) box.appendChild(u);
      box.appendChild(foot());
      box.hidden = false;
      scrollToBox();
    };
    if (quiet) show(); else A.say(s.q(), show);
    if (s.key === 'confirm') A.track('会話フォーム:確認画面');
  }
  function answer(text) {
    A.addRow('out', A.esc(text));
    hist.push(cur);
    var key = S[cur].key;
    if (key === 'tenkase') A.track('会話フォーム:台数', '壁掛け:' + st().units + ' 天カセ:' + st().tenkase);
    if (key === 'email') A.track('会話フォーム:連絡先');
    if (key === 'date3') A.track('会話フォーム:希望日');
    if (editTo && key === editTo) { editTo = ''; ask(idx('confirm')); return; }
    ask(cur + 1);
  }
  function foot() {
    var f = make('div', 'cf-foot');
    if (hist.length && S[cur].key !== 'confirm') {
      var b = make('button', 'cf-link', '← ひとつ前に戻る');
      b.type = 'button';
      b.addEventListener('click', function () { if (busy) return; var p = hist.pop(); A.addRow('out', 'ひとつ前に戻る'); ask(p); });
      f.appendChild(b);
    }
    var k = make('button', 'cf-link', 'フォームでまとめて入力する');
    k.type = 'button';
    k.addEventListener('click', function () {
      if (busy) return;
      restoreMsg();
      A.showForm('会話から切替');
    });
    f.appendChild(k);
    return f;
  }

  // 確認カードへ移した「送れませんでした」の欄を、いつものフォームへ戻す
  function restoreMsg() {
    var m = $('formMsg'), f = $('form');
    if (m.parentNode !== f) f.insertBefore(m, f.querySelector('[type=submit]').parentNode);
  }

  window.ChatForm = {
    init: function (api) { A = api; box = A.$('cf'); },
    // はい・メニューから始める。台数などはいつもの初期値（壁掛け1台）から
    begin: function (note) {
      hist = []; editTo = ''; busy = false; autoUnknown = false;
      $('hdrEst').hidden = false;
      A.track('会話フォーム:開始', note || '');
      ask(0);
    },
    reset: function () {
      hist = []; editTo = ''; busy = false; autoUnknown = false; cur = -1;
      if (box) { box.innerHTML = ''; box.hidden = true; }
      if (A) restoreMsg();
    }
  };
})();
