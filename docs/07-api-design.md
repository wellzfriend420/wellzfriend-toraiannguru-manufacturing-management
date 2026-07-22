# ⑦ API設計

## Phase2A

- `POST /api/v1/admin/unlock`
- `POST /api/v1/integrations/n8n/line-events`
- `POST /api/v1/integrations/n8n/unfinished-check`
- `/api/v1/admin/line-users*`、`line-registration-codes`
- `/api/v1/admin/work-sessions*`、`work-session-candidates`、`work-session-links`
- `/api/v1/admin/company-settings`、`fixed-breaks*`、`menu-items*`

n8n APIは署名用3ヘッダーを必須とする。管理APIはPIN確認済みのHttpOnly Cookieを必要とする。

## 共通

- ベース: `/api/v1`
- Cookieセッション、CSRF対策、同一生成元を基本とする
- 更新は `Idempotency-Key` 必須
- 応答: `{ data, meta }`、エラー: `{ error: { code, message, fields? } }`
- Phase1ではログインおよび閲覧専用アカウント区分を設けない。画面利用者はダッシュボード閲覧と管理入力を利用できる
- 日付範囲は `from` を含み `to` を含む業務日として統一

## 共通設定

|Method|Path|制限|用途|
|---|---|---|---|
|GET|`/settings/ui`|なし|部門タブ、週開始曜日、単位表示|

## ダッシュボード

|Method|Path|用途|
|---|---|---|
|GET|`/dashboard?department=lotus&period=day&anchor=2026-07-17`|社長画面一括取得|
|GET|`/dashboard/details/{metric}?department=&from=&to=`|KPI根拠明細|
|GET|`/dashboard/inventory?department=&asOf=`|時点在庫|
|GET|`/dashboard/process-analysis?department=&from=&to=`|工程別投入・加工後・廃棄・歩留まり・時間|
|GET|`/dashboard/workforce-analysis?department=&from=&to=`|人別時間・人別工程時間・人別歩留まり・生産性|
|GET|`/dashboard/product-profitability?department=&from=&to=`|商品別売上・直接原価・粗利・粗利率|

トップ画面の一括応答は `period`, `range`, `closure`, `processFlow`, `finishedProductInventory`, `flavorInventory`, `shipmentSalesTotal`, `detailLinks` を含めます。商品別採算全件、人別詳細、原料在庫サマリーはトップ応答へ展開しません。

青果部門では商品ごとに`measuredQtyG`, `processInputQtyG`, `processOutputQtyG`, `processWasteQtyG`, `yieldRate`, `shippedQtyG`, `salesAmount`を返し、`harvestQtyG`、在庫一覧、取引先別売上を返しません。`measuredQtyG`は検品票の実測数量、加工歩留まりは加工出来高÷加工使用量を原本とする。

Dashboard系APIはGETのみとし、専用の更新APIを設けません。応答は取引原本から再計算し、集計キャッシュを使用する場合も原本から再構築可能にします。

`processFlow`の各要素は`processId`, `processName`, `inputQty`, `outputQty`, `wasteQty`, `yieldRate`を持ち、工程マスタ順で返します。加工投入量と先頭工程投入量が同一原本の場合は一つの値として返し、クライアント側で重複カードを生成させません。完成重量・完成数量はフロー終端として返します。

## 取引

|Method|Path|用途|
|---|---|---|
|GET/POST|`/receipts`|検品一覧・登録。紙帳票順の10項目を受け、内部ロットと原料在庫移動を同一取引で作成|
|GET/PATCH|`/receipts/{id}`|詳細・訂正／取消|
|GET/POST|`/purchase-costs`|納品書に基づく原料仕入金額の一覧・登録。対象検品明細へ紐付け|
|GET/PATCH|`/purchase-costs/{id}`|仕入金額の詳細・理由付き訂正|
|GET/POST|`/delivery-preparations`|納品準備の資材使用一覧・登録。在庫減算と直接資材原価を同時記録|
|GET/POST|`/process-runs`|工程実績一覧・登録|
|GET/PATCH|`/process-runs/{id}`|詳細・訂正／取消|
|GET/POST|`/individual-process-results`|個人別加工実績一覧・登録。通常登録に時間入力なし|
|GET/PATCH|`/individual-process-results/{id}`|個人別実績の訂正／取消|
|GET/POST|`/production-batches`|製造一括入力|
|GET/PATCH|`/production-batches/{id}`|詳細・訂正／取消|
|GET/POST|`/shipments`|出荷・売上一覧／登録|
|GET/PATCH|`/shipments/{id}`|詳細・訂正／取消|
|GET|`/shipments/{id}/profitability`|商品別売上・直接原価・粗利・粗利率の根拠|
|GET/POST|`/work-sessions`|工数一覧／手入力|
|POST|`/labor-cost-rates`|原価配賦用の時給・月給者管理単価登録|
|GET/PATCH|`/work-sessions/{id}`|工数訂正・取消|
|GET|`/inventory`|現在庫・条件検索|
|GET|`/inventory/movements`|在庫元帳|
|POST|`/stocktakes`|棚卸開始・登録|
|POST|`/inventory-adjustments`|理由付き在庫調整|
|POST|`/daily-closures`|日次確認|
|POST|`/daily-closures/{id}/reopen`|理由付き再開|
|GET|`/receivables?partner=&dueFrom=&dueTo=&status=`|Phase1で作成した売掛残高・入金予定の参照|

PATCHは更新内容と `reason`、現在の `version` を要求し、競合時は409を返します。

検品登録Requestは`receivedDate`, `partnerId`, `itemId`, `boxCount`, `employeeId`, `deliveredQuantity`, `measuredQuantity`, `inspectionWasteQuantity`, `inspectionWasteReason`, `memo`をこの業務順で扱う。`inspectionWasteReason`は必須とし、在庫加算量はサーバー側で`measuredQuantity - inspectionWasteQuantity`として計算する。箱数から数量を換算せず、内部ロット番号はサーバーが自動採番する。検品時破棄を加工時破棄APIへ混在させない。

原料仕入金額は検品Requestへ追加せず、管理者が納品書を基に`/purchase-costs`へ`receiptLineId`, `purchaseAmount`を登録する。登録者・登録日時・訂正履歴を保存し、未入力の検品明細を一覧取得できるようにする。

納品登録では`deliveryDate`と`settlementType`を必須とし、売上は`deliveryDate`で認識します。`receivable`は`dueDate`を保持して売掛を生成し、`cash`は納品時点で入金済みとします。納品確定時に商品別の売上と直接原価内訳を保存します。

出荷明細の直接原価は完成品ロット原価内訳、指定した納品準備実績、直接外注費を合算してサーバー側で算出する。クライアントから直接原価合計を受け付けず、原価内訳、直接原価、粗利益、粗利率を同一取引で固定保存する。部門共通労務費はSKU直接原価へ加算しない。

## 資金繰りアプリ連携予約

|Method|Path|用途|
|---|---|---|
|GET|`/integrations/cashflow/shipments?from=&to=&cursor=`|売掛／現金、売上、入金状態を差分取得|
|POST|`/integrations/cashflow/acknowledgements`|連携先取込結果と外部IDを記録|

認証方式、送受信方向、再送条件は資金繰りアプリ仕様との競合確認後に確定します。

## マスタ

`/masters/departments`, `/products`, `/items`, `/processes`, `/employees`, `/partners`, `/flavors`, `/locations`, `/units` を共通形式で提供します。削除APIは設けず `active=false` とします。

工程マスタ更新は並び順と使用停止を含みます。商品・フレーバーマスタは既存IDを保持した移行後も追加・編集・使用停止を可能にします。商品別包材構成は`/masters/product-packaging-components`で管理します。

## 原価・労務費

|Method|Path|用途|
|---|---|---|
|GET|`/costs/process-labor?department=&from=&to=`|工程別時間・労務費・生産性|
|GET|`/costs/products/{productId}?from=&to=`|材料・フレーバー・包材・外注・労務費内訳|
|GET/POST|`/masters/labor-cost-rates`|適用賃率の一覧・登録|
|PATCH|`/masters/labor-cost-rates/{id}`|有効期間付き賃率変更|

月給者は`salaryAmount`, `weekdayCount`, `hoursPerDay=8`から管理時間単価を算出します。給与計算APIは設けません。チップス労務費は`chips_total`原価プールへ集約し、商品・フレーバー・内容量別配賦APIは設けません。

重量フィールドはg整数で送受信し、重量単位指定やkg自動変換を受け付けません。

## Phase2予約 — 入金・CSV・帳票

|Method|Path|用途|
|---|---|---|
|POST|`/payments`|入金登録|
|POST|`/payments/{id}/allocations`|売掛消込|
|POST|`/imports/{type}/validate`|書込前検証|
|POST|`/imports/{type}/commit`|検証済ジョブの確定|
|GET|`/imports/{jobId}`|結果・エラー票|
|GET|`/exports/{type}.csv?from=&to=&department=`|CSV出力|
|GET|`/reports/{type}.pdf?from=&to=&department=`|PDF帳票出力|

監査検索`GET /audit-logs`はPhase1の理由付き訂正確認に使用するためPhase1に残す。

## Phase1 LINE

|Method|Path|用途|
|---|---|---|
|POST|`/integrations/line/events`|署名検証付きLINE webhook|
|GET|`/admin/line/work-sessions?date=&status=`|管理者の未終了・異常確認|
|PATCH|`/admin/line/work-sessions/{id}`|理由付き訂正|
|POST|`/admin/work-time-exceptions`|LINE障害・紐付け不能時の理由付き代替時間|

LINEイベントは開始・終了だけを受け付けます。製造数量、入荷、在庫、出荷、歩留まりはLINEイベントから更新できません。LINE連携後、個人加工実績APIは時間を入力値として受け取らず、対応するwork sessionからサーバー側で算出します。

## Phase2予約

|Method|Path|用途|
|---|---|---|
|POST|`/integrations/n8n/events`|共有鍵・冪等外部イベント|
|POST|`/ocr/documents`|画像受付|
|POST|`/external-events/{id}/retry`|管理者再処理|
|GET|`/lots/search`|ロット検索|
|GET|`/lots/{id}/trace`|ロット追跡・トレーサビリティ|
|GET|`/lots/reverse-trace`|出荷・完成品からの逆引き|

Phase2Aでn8n連携APIを公開済み。URL・Header・Request・Responseの正本は`15-phase2a-api-specification.md`とし、本書はAPI全体索引として扱う。
