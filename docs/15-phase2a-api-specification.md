# Phase2A API仕様

## n8n共通認証

対象APIは以下のHeaderを必須とする。

|Header|内容|
|---|---|
|`x-wf-event-id`|LINEまたはn8n側の一意なEventID。再送時も変更しない|
|`x-wf-timestamp`|ISO 8601形式の送信時刻|
|`x-wf-signature`|HMAC-SHA256署名の16進文字列|

署名対象は`eventId + "." + timestamp + "." + rawBody`。許容時間外は401、署名不正は401、未設定は503。同一EventIDの再送は200で保存済み応答と`duplicate: true`を返す。

## LINEイベント

`POST /api/v1/integrations/n8n/line-events`

Request共通項目:

|項目|必須|内容|
|---|---|---|
|`action`|必須|`register`、`status`、`menu`、`start`、`break_start`、`resume`、`finish`。既存互換のため`end`も受付|
|`line_user_id`|必須|LINE UserID|
|`occurred_at`|任意|LINEイベント発生日時|
|`event_id`|任意（推奨）|`x-wf-event-id`と同じ値。指定時に不一致なら400|
|`registration_code`|登録時|管理画面で発行したコード|
|`menu_code` / `menu_item_id`|開始時|選択した編集可能メニュー|

`outside_group`を選択した場合は`state: "submenu"`とし、`menu`へ「納品準備」「納品」「外回り」「その他業務」の4項目を返す。旧「配達」は「納品」、旧「仕入れ」は「外回り」へ集約し、独立メニューとして返さない。

`produce_group`を選択した場合は`state: "submenu"`とし、`menu`へ「ねぎ」「きゅうり」を返す。`break_start`は待機中のみ成功し、作業中は終了を要求する。`finish`は作業中なら作業を、休憩中なら独立休憩を終了して`idle`を返す。

Responseは`state`、`message`を基本とし、必要時に`menu`、`buttons`、`session`を返す。業務エラーは400で`state: error`を返す。受信本文は成否にかかわらず`line_events`へ保存する。

成功時はHTTP 200で`{"data":{"state":"...","message":"..."}}`を返す。同一EventIDの再送はHTTP 200で、保存済み結果へ`duplicate: true`を加える。署名・時刻エラーはHTTP 401、HMAC共有鍵未設定は503、JSON・入力・業務状態エラーは400で`{"error":{"message":"..."}}`または`{"data":{"state":"error","message":"...","notify":["employee","manager"]}}`を返す。

### n8n送信例

開始:

```json
{"action":"start","menu_code":"boiled_lotus","line_user_id":"Uxxxxxxxx","occurred_at":"2026-07-20T10:00:00+09:00","event_id":"xxxxxxxx"}
```

終了:

```json
{"action":"finish","menu_code":null,"line_user_id":"Uxxxxxxxx","occurred_at":"2026-07-20T10:30:00+09:00","event_id":"xxxxxxxx"}
```

本文`event_id`とHeader `x-wf-event-id`には同一値を設定する。

## 未終了確認

`POST /api/v1/integrations/n8n/unfinished-check`

任意の`now`を受け取り、標準終業時刻＋猶予を超えた未終了セッションと通知先を返す。自動終了しない。n8nが定期実行と実通知を担当する。

## 管理者PIN

`POST /api/v1/admin/unlock`へPINを送り、成功時にHttpOnly・SameSite Strict Cookieを発行する。通常のダッシュボードと入力APIには要求しない。

## 管理API

- `GET /api/v1/admin/line-users`
- `POST /api/v1/admin/line-registration-codes`
- `POST /api/v1/admin/line-users/:employeeId/unlink`
- `GET /api/v1/admin/work-sessions`
- `PATCH /api/v1/admin/work-sessions/:id`
- `GET|PATCH /api/v1/admin/company-settings`
- `POST|DELETE /api/v1/admin/fixed-breaks*`
- `POST|PATCH /api/v1/admin/menu-items*`
- `GET /api/v1/admin/work-session-candidates`
- `POST /api/v1/admin/work-session-links`

工数訂正は`reason`必須。加工実績候補は作業日・担当者・工程の一致で検索し、複数セッションを一つの個人加工実績へ紐付けられる。
