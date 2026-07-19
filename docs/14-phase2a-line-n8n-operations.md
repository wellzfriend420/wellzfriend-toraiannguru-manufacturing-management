# Phase2A LINE・えんちゃん連携運用

## 役割

LINEは現場入力、えんちゃん（n8n）はWebhook受付・API中継・再送・通知、本アプリは状態判断と工数計算、SQLiteは原本保存を担当する。

## n8nからの呼出し

本文例:

```json
{"action":"start","line_user_id":"U123","menu_code":"boiled_lotus","occurred_at":"2026-07-19T09:00:00+09:00"}
```

送信ヘッダー:

- `x-wf-event-id`: LINE Webhook event ID。再送でも同じ値
- `x-wf-timestamp`: ISO 8601送信時刻
- `x-wf-signature`: `HMAC-SHA256(secret, eventId + "." + timestamp + "." + rawBody)`の16進文字列

許容時間を超える送信と署名不一致は拒否する。同じイベントIDは保存済み応答を返し、二重打刻しない。

## action

- `register`: `registration_code`を添えて従業員登録
- `status` / `menu`: 現在状態と選択肢を取得
- `start`: `menu_code`または`menu_item_id`で開始
- `break_start`: 休憩開始
- `resume`: 再開
- `end`: 終了

レスポンスの`state`、`message`、`menu`、`buttons`をn8nでLINE Flex Messageまたはクイックリプライへ変換する。「納品準備・外回り」は`submenu`を返すため、返却された子メニューを表示する。

## 初期運用

1. 会社設定でLINE利用、休憩方式、終業時刻、猶予、未終了通知を設定する。
2. LINE利用者管理で従業員ごとの登録コードを発行する。
3. 従業員がコードを送信し、n8nが`register`として中継する。
4. n8nは各イベントを一意なイベントIDで中継し、失敗時も同じIDで再送する。
5. 定期実行で未終了確認APIを呼び、対象を本人と管理者へ通知する。自動終了はしない。
6. 誤打刻は作業履歴・訂正で理由付き修正する。

## 障害時

通信障害時はn8nが同じイベントIDで再送する。スマホ故障や打刻忘れは通常の加工表へ時間を追加せず、時間例外入力または作業履歴訂正を使う。秘密鍵、管理者PIN、LINEチャネルシークレットはGitへ保存しない。

`line_events.raw_json`には障害解析用の生イベントが入るため、DBバックアップを含め社内管理者だけが扱う。保持期間と定期削除はPhase2Bで決定し、Phase2Aでは監査記録を自動削除しない。
