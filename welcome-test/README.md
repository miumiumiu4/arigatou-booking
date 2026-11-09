# 予約フォームのテスト版（welcome-test/）

本番の予約ページ `welcome/` と見た目も動きも同じで、**送り先だけ**を本番から外した版。
本番の予約台帳（読者限定キャンペーン予約管理の予約タブ）にテストデータを入れずに、通しで試すためのもの。

公開後の URL：`https://miumiumiu4.github.io/arigatou-booking/welcome-test/`

## 本番と違うところ（これ以外は同じ）

- 上に黄色い帯「テスト用のページです」、上の帯の名前とタブの題に【テスト】
- 検索に出さない（`noindex`）
- 送り先：`config.json` の `TEST_GAS_URL`
  - 空のあいだは **画面だけ**：どこにも送らず、受付番号 `T1109-TEST1` のような番号を出す
  - 入れると、【テスト】予約フォームの受け口（`receiver/`）のシートに1件1行で入る。番号は `T1109-001`
- 本番の予約 GAS へは1回も送らない（`build.mjs` が本番の URL の残りを見つけたら止まる）
- 確認メールは届かない（受け口はメールを送らない）
- 送ったあとの画面に「【テスト】送った中身を見る」
- 計測（【テスト】汎用イベント計測ログ）は `test=hp-chat-test`・`page=welcome-test` で、本番の `hp-chat` と混ざらない

## 本番（welcome/）を直したら

`welcome-test/index.html` は手で直さない。本番を直したあとに次の1行で作り直す。

```
node welcome-test/build.mjs
```

作り直し忘れは GitHub の「welcome-test が本番と合っているか」チェックが赤になって知らせる。
本番の形が変わって置き換えが当たらなくなったときも、`build.mjs` が止まって知らせる（黙って本番へ送る版は作らない）。

## 確かめ方

```
NODE_PATH=$(npm root -g) node welcome-test/test/e2e.cjs     # スマホの大きさで通し
node welcome-test/test/receiver.test.mjs                   # 受け口
```

## 受け口（receiver/）

新しいスプレッドシート「【テスト】予約フォームの受け口」に付ける Apps Script。タブ「テスト予約」に
受付日時・受付番号・お名前・電話・メール・住所・台数・概算・内訳・備考・どこから・送られた中身（全部）を書く。
本番の予約 GAS とは別物で、本番には触らない。メールも送らない。
ウェブアプリとして出したら、その URL を `config.json` の `TEST_GAS_URL` に入れて `node welcome-test/build.mjs`。
