# SETUP — Phase1 / Phase2A

## 起動

必要環境はNode.js 22.16以上です。外部npmパッケージは使用していません。

1. `.env.example`を参考に環境変数を設定する。
2. `node src/server.js`を実行する。
3. ブラウザで`http://localhost:3100`を開く。ログイン操作は不要です。

初回起動時にSQLite DB、2部門、Phase1工程、操作記録用の内部ユーザーを作成します。重量はすべてgで登録します。

検証は`node --test`、構文を含む一括確認は`npm run check`です。

## 実装前資料

1. `README.md`から12成果物を確認する。
2. `REVIEW.md`の決定事項を社長・管理者・開発責任者で確定する。
3. 手書きダッシュボード画像を機密情報を除いて設計資料として追加する。
4. 青果工程、既存マスタCSV、在庫開始残を準備する。
5. 承認日、承認者の役割、修正点を`CHANGELOG.md`へ記録する。

## 実装構成

現行工程管理アプリと同じく Node.js 22系、SQLite、標準Node HTTPサーバーを使用します。

環境変数:

- `PORT`: 待受ポート
- `DATABASE_PATH`: SQLiteファイル
- `ADMIN_PIN`: LINE利用者管理・工数訂正・会社設定を開く管理者PIN
- `ADMIN_SESSION_MINUTES`: PIN確認後の有効時間（既定30分）
- `N8N_SHARED_SECRET`: n8nとのHMAC共有秘密鍵
- `N8N_SIGNATURE_TOLERANCE_SECONDS`: n8n送信時刻の許容差（既定300秒）

秘密値をファイル、Git、画面コードへ保存しません。

## Phase2A接続

1. n8nとアプリに同じ`N8N_SHARED_SECRET`を安全に設定する。
2. n8nへWebhook中継、HMAC署名、同一EventIDでの再送を設定する。
3. 管理画面で登録コードを発行し、従業員がLINEへ送信して紐付ける。
4. n8nへ未終了確認の定期実行と本人・管理者通知を設定する。

URL、Header、Request、Responseは`docs/15-phase2a-api-specification.md`、運用は`docs/14-phase2a-line-n8n-operations.md`を参照してください。SETUPは接続先仕様の正本にしません。

Renderへn8nを新規配置する場合は`docs/17-render-n8n-line-setup-manual.md`を先頭から実施してください。

## 3. 初期移行の予定手順

1. 空DBへスキーママイグレーションを適用
2. 操作記録用の内部ユーザーを作成
3. 部門対応表、単位、工程、従業員、取引先、品目、商品を検証取込
4. 基準日時点のロット別在庫を開始残高として取込
5. 旧新の件数、在庫残、代表期間の歩留まり・製造量を照合
6. 架空データで集計・取消・復元を試験
7. 並行稼働後に新システムを正本化

## 4. 本番化前に未確定のもの

本番はRenderの永続ディスクを使用し、日次バックアップを30日保持します。月1回の復元確認を運用記録へ残します。
## SQLiteバックアップ

`BACKUP_DIR`へSQLiteの日次バックアップを保存し、`BACKUP_RETENTION_DAYS`（標準30日）を超えた世代を削除します。Renderでは永続ディスク上のパスを指定してください。月1回、バックアップのコピーを検証環境で開き、`PRAGMA integrity_check`と主要件数を確認します。秘密値はRender環境変数へ置き、Gitへ保存しません。
