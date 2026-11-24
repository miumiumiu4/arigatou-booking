  // ---------- テスト版だけ：空きの○×（予約デスクと連動。設計書「空き表示とデスクの連動」作るもの5） ----------
  // build.mjs がこの部分を welcome-test/index.html に入れる。本番（welcome/）には入れない（1/5 の切替は三浦さんの一言のあと）。
  // AKI_URL（config.json）が空のあいだは「作りものの空き」（どこにも聞かない）。入れると、そのデスク（C999 など）の
  //   GET ?action=availability&zip=…（○×だけ）と POST {kind:"aki.hold"}（日付・枠・市区町村だけの席取りメモ）を使う。
  // 名前・電話・メール・住所は、デスクの窓口へ送らない（予約そのものは今までどおりの送り先へ）。
  // C999 で試す時は、config.json に書かずに、ページの URL の後ろに ?aki=<C999 のウェブアプリの URL> を付けて開く
  //   （ウェブアプリの番号をリポジトリに残さないため。本番の予約の受け口の番号は受け付けない）
  var AKI_URL = __AKI_URL__ || (function () {
    try {
      var q = new URLSearchParams(location.search).get('aki') || '';
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(q) || __AKI_PROD_RE__.test(q)) return '';
      return q;
    } catch (e) { return ''; }
  })();
  var aki = { zip: '', need: 0, slots: null, areaLabel: '', page: 0, picked: null, manual: false, loading: false, msg: '', seq: 0, memoId: '', demoTaken: {} };
  var AKI_DEMO_LABELS = ['①8:00〜9:00', '②12:00〜14:00', '③15:00〜18:00'];
  var AKI_DOW = '日月火水木金土';
  function akiZipNow() { var z = ($('f_zip').value || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/\D/g, ''); return z.length === 7 ? z : ''; }
  // 台数とお掃除機能付き（11/24 会議：台数で要る枠の数が変わる。天カセは何枠かの決定まで○×を出さない）
  function akiCounts() { var units = st.units || 0, auto = Math.min(units, st.auto || 0); return { units: units, auto: auto, tenkase: st.tenkase || 0 }; }
  function akiNeed() { var c = akiCounts(); if (!c.units) return 1; return Math.min(3, Math.max(1, Math.ceil((c.units - c.auto) / 2 + c.auto - 1e-9))); }
  function akiKey() { var c = akiCounts(); return [akiNeed(), c.units, c.auto ? 1 : 0, c.tenkase ? 1 : 0].join('|'); }
  function akiJsonp(url) {
    return new Promise(function (ok, ng) {
      var cb = 'akiCb' + Date.now() + Math.floor(Math.random() * 1e6), s = document.createElement('script'), done = false;
      var t = setTimeout(function () { if (!done) { done = true; cleanup(); ng(new Error('timeout')); } }, 12000);
      function cleanup() { try { delete window[cb]; } catch (_) { window[cb] = undefined; } s.remove(); clearTimeout(t); }
      window[cb] = function (o) { if (done) return; done = true; cleanup(); ok(o); };
      s.onerror = function () { if (done) return; done = true; cleanup(); ng(new Error('load')); };
      s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=' + cb;
      document.head.appendChild(s);
    });
  }
  // 作りものの空き：明後日から来月の終わりまで。日曜は×が多い。押した枠は×になる
  function akiDemo(zip, need) {
    return akiJsonp('https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + zip).then(function (z) {
      var r = z && z.results && z.results[0];
      return r ? r.address1 + r.address2 : '';
    }, function () { return ''; }).then(function (label) {
      if (!label) return { ok: false, error: '郵便番号が見つかりませんでした。もう一度お確かめください' };
      var slots = [], now = new Date(Date.now() + 9 * 36e5), d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));
      var end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
      for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        var ymd = d.toISOString().slice(0, 10), sun = d.getUTCDay() === 0;
        for (var k = 1; k <= 3; k++) {
          var h = 2166136261, key = zip + ymd + k; for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h = h % 1000;
          var open = !aki.demoTaken[ymd + '|' + k] && (sun ? h < 250 : h < 620) && k + need - 1 <= 3;
          slots.push({ date: ymd, windowNo: k, label: AKI_DEMO_LABELS[k - 1], status: open ? '○' : '×' });
        }
      }
      return { ok: true, areaLabel: label, slots: slots, note: '【試し】作りものの空きです。本物のデスクとはまだつながっていません。' };
    });
  }
  function akiLoad() {
    var zip = akiZipNow(), need = akiNeed();
    if (!zip) { aki.zip = ''; aki.slots = null; aki.msg = ''; akiRender(); return; }
    if (zip === aki.zip && akiKey() === aki.key && aki.slots) return;
    var my = ++aki.seq, c = akiCounts();
    aki.zip = zip; aki.need = need; aki.key = akiKey(); aki.loading = true; aki.msg = ''; akiRender();
    var p = AKI_URL
      ? akiJsonp(AKI_URL + '?action=availability&zip=' + zip + '&units=' + c.units + '&auto=' + c.auto + '&tenkase=' + c.tenkase + '&amount=' + total())
      : c.tenkase ? Promise.resolve({ ok: true, slots: [], note: '天井埋め込み（天カセ）は、担当が対応できるスタッフと日程を確かめてからご案内します。下の欄に希望日を書いてお送りください。' })
      : akiDemo(zip, need);
    p.then(function (o) {
      if (my !== aki.seq) return;
      aki.loading = false;
      if (!o || !o.ok) { aki.slots = []; aki.msg = (o && o.error) || 'いま空きを読めません。下の欄に希望日を書いてお送りください。'; }
      else { aki.slots = o.slots || []; aki.areaLabel = o.areaLabel || ''; aki.msg = o.note || ''; }
      if (aki.picked && !aki.slots.some(function (s) { return s.date === aki.picked.date && s.windowNo === aki.picked.windowNo && s.status === '○'; })) aki.picked = null;
      aki.page = 0;
      akiRender();
      track('空き表示', (aki.slots.length ? '表あり' : '表なし') + ' 枠数:' + need);
    }, function () {
      if (my !== aki.seq) return;
      aki.loading = false; aki.slots = []; aki.msg = 'いま空きを読めません。下の欄に希望日を書いてお送りください。'; akiRender();
    });
  }
  function akiUsingTable() { return !aki.manual && !!(aki.slots && aki.slots.length); }
  function akiDateLabel(ymd) { var d = new Date(ymd + 'T00:00:00Z'); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '（' + AKI_DOW.charAt(d.getUTCDay()) + '）'; }
  function akiRender() {
    var box = $('akiBox'); if (!box) return;
    var use = akiUsingTable();
    document.querySelectorAll('.bk .dateblk').forEach(function (b) { b.hidden = use; });
    var h = '<div class="akihead">空いている日時から選ぶ</div>';
    if (!AKI_URL) h += '<p class="akidemo">【試し】いまは作りものの空きです（本物のデスクとはまだつながっていません）</p>';
    if (!aki.zip) h += '<p class="akihint">上の「郵便番号」（7けた）を入れると、その地域を回れるスタッフの空きが ○× で出ます。</p>';
    else if (aki.loading) h += '<p class="akihint">空きを調べています…</p>';
    else if (!use) {
      h += '<p class="akihint">' + esc(aki.msg || '') + '</p>';
      if (aki.manual && aki.slots && aki.slots.length) h += '<button type="button" class="akilink" data-aki="back">○×の表にもどる</button>';
    } else {
      var dates = []; aki.slots.forEach(function (s) { if (dates.indexOf(s.date) < 0) dates.push(s.date); });
      var per = 7, pages = Math.ceil(dates.length / per); if (aki.page >= pages) aki.page = pages - 1;
      var shown = dates.slice(aki.page * per, aki.page * per + per), labels = [1, 2, 3].map(function (k) { var s = aki.slots.find(function (x) { return x.windowNo === k; }); return s ? s.label : ''; });
      h += '<p class="akihint">' + esc(aki.areaLabel) + ' の空き（' + aki.need + '枠ぶんの作業）。○を押して選んでください。</p>';
      h += '<table class="akitbl"><thead><tr><th>日付</th>' + labels.map(function (l) { return '<th>' + esc(l).replace(/^([①②③])/, '$1<br>').replace('〜', '〜<br>') + '<br><small>着</small></th>'; }).join('') + '</tr></thead><tbody>';
      shown.forEach(function (d) {
        var w = new Date(d + 'T00:00:00Z').getUTCDay();
        h += '<tr><th class="' + (w === 0 ? 'sun' : w === 6 ? 'sat' : '') + '">' + akiDateLabel(d) + '</th>';
        [1, 2, 3].forEach(function (k) {
          var s = aki.slots.find(function (x) { return x.date === d && x.windowNo === k; });
          var sel = aki.picked && aki.picked.date === d && aki.picked.windowNo === k;
          h += s && s.status === '○' ? '<td><button type="button" class="akio' + (sel ? ' on' : '') + '" data-d="' + d + '" data-k="' + k + '" aria-label="' + akiDateLabel(d) + ' ' + esc(s.label) + ' 空きあり">' + (sel ? '選択中' : '○') + '</button></td>' : '<td class="akix" aria-label="空きなし">×</td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table><div class="akipager"><button type="button" data-aki="prev"' + (aki.page ? '' : ' disabled') + '>← 前の週</button><span>' + (aki.page + 1) + ' / ' + pages + '</span><button type="button" data-aki="next"' + (aki.page < pages - 1 ? '' : ' disabled') + '>次の週 →</button></div>';
      h += '<p class="akinote">○＝空きあり、×＝埋まり・お休み。時間は「スタッフが伺う時間の幅」です。担当が型番などを確かめてから、確定のご連絡をします。</p>';
      if (aki.picked) h += '<div class="akipicked">選んだ日時：<b>' + akiDateLabel(aki.picked.date) + ' ' + esc(aki.picked.label) + '</b></div>';
      h += '<button type="button" class="akilink" data-aki="manual">合う○が無い・ほかの日を相談する（希望日を3つ書く）</button>';
    }
    box.innerHTML = h;
  }
  // 画面の部品ができてから（build.mjs が $('f_nominate') の行の前で呼ぶ）
  function akiInit() {
    $('akiBox').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d) {
        var s = aki.slots.find(function (x) { return x.date === b.dataset.d && x.windowNo === Number(b.dataset.k); });
        aki.picked = s ? { date: s.date, windowNo: s.windowNo, label: s.label } : null;
        $('formMsg').hidden = true;
        track('空き選択', s ? s.date + ' 枠' + s.windowNo : '');
      } else if (b.dataset.aki === 'prev') aki.page--;
      else if (b.dataset.aki === 'next') aki.page++;
      else if (b.dataset.aki === 'manual') { aki.manual = true; aki.picked = null; track('空き：ほかの日を相談', ''); }
      else if (b.dataset.aki === 'back') aki.manual = false;
    akiRender();
  });
  var akiTimer = null;
  function akiSoon() { clearTimeout(akiTimer); akiTimer = setTimeout(akiLoad, 400); }
  $('f_zip').addEventListener('input', akiSoon);
  $('form').addEventListener('click', function () { if (aki.zip && akiKey() !== aki.key) akiSoon(); });
    akiRender();
  }
  // 表を使っている時：第2・第3希望は聞かない。○を選んでいなければ止める
  function akiSkip(id) { return akiUsingTable() && (id === 'date1' || id === 'date2' || id === 'date3'); }
  function akiFormError() { return akiUsingTable() && !aki.picked ? { el: $('akiBox'), text: '空いている日時の ○ を1つ選んでください（合う○が無ければ「ほかの日を相談する」）。' } : null; }
  function akiApply(data) {
    if (!akiUsingTable() || !aki.picked) return;
    if (!aki.memoId) { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', m = 'AK-'; for (var i = 0; i < 8; i++) m += a.charAt(Math.floor(Math.random() * a.length)); aki.memoId = m; }
    data.date1 = aki.picked.date + ' ' + aki.picked.label; data.date2 = ''; data.date3 = '';
    data.time1 = aki.picked.label; delete data.time2; delete data.time3;
  }
  function akiMark() { return '【空きから選択】' + aki.picked.date + ' ' + aki.picked.label.replace(/\s+/g, '') + ' ' + aki.areaLabel.replace(/\s+/g, '') + ' ' + aki.memoId; }
  // 送る直前：席取りメモ（日付・枠・郵便番号・台数だけ）。たった今ほかの方が取っていたら止めて選びなおしてもらう
  function akiBeforeSend() {
    if (!akiUsingTable() || !aki.picked) return Promise.resolve();
    var c = akiCounts(), pk = aki.picked;
    if (!AKI_URL) { aki.demoTaken[pk.date + '|' + pk.windowNo] = 1; return Promise.resolve(); }
    var body = { kind: 'aki.hold', memoId: aki.memoId, zip: aki.zip, date: pk.date, slotNo: pk.windowNo, units: c.units, auto: c.auto, tenkase: c.tenkase, amount: total() };
    return fetch(AKI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.text(); })
      .then(function (t) { var j; try { j = JSON.parse(t); } catch (_) { j = { ok: true }; } return j; }, function () { return { ok: true }; })
      .then(function (j) {
        if (j.ok) return;
        if (j.error === 'taken') { aki.picked = null; aki.slots = null; aki.zip = ''; akiLoad(); $('akiBox').scrollIntoView({ block: 'center' }); }
        throw new Error(j.message || '選んだ日時を受け付けられませんでした');
      });
  }
