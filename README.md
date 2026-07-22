# 製造管理システム リニューアル設計

状態: **Phase1運用初版・Phase2Aアプリ側実装済み**
基準日: 2026-07-22

本ディレクトリは、とらいアンぐる経営管理システムの既存資産を活かし、現行工程管理アプリと同じ Node.js / SQLite 基盤で新規開発するための設計正本です。

## 設計上の最優先順位

1. 社長が朝に前日実績を見て、その日の段取りを決められること
2. 現行運用を止めず、管理者入力でPhase1を開始できること
3. Phase1でLINE開始・終了による工数を取得し、Phase2のOCR・AI・n8n連携へ拡張できること

## 解析対象

設計者は、次の順番で必ず読んでください。

1. [仕様情報源と優先順位](docs/00-specification-source-management.md)
2. [社長補足仕様](docs/00-supplement-01-confirmed-specification.md)
3. [社長手書きメモ](docs/00-president-handwritten-memo-01.md)
4. [個人別加工帳票](docs/00-individual-processing-record-01.md)
5. 既存アプリ解析
   - [既存アプリ解析書](docs/01-existing-application-analysis.md)
   - [既存Excelデータ解析](docs/01-existing-workbook-analysis.md)
   - [既存アプリ基準コミット解析](docs/01-github-commit-b13e06f-analysis.md)

補助資料として、[既存アプリ導入前の試行Excel解析](docs/01-historical-workbook-analysis.md)を参照します。これは正式仕様の正本ではありません。

判断できない内容は推測で埋めず、「判読確認待ち」または「競合確認待ち」としてユーザーレビューへ回します。既存アプリ解析前に、新しい入力項目、集計ロジック、DB構造を独自に決定することは禁止します。
- 業務仕様の原型: `C:/Users/tnaka/Downloads/toraiannguru_system_latest.zip`
- 改良版の参考: `projects/toraiannguru-management-system`
- Node.js基盤の参考: `wellnot-order-profit-management`

ZIPは元設計として扱います。ただし、GET更新・URL直書き等は流用せず、Node.js基盤のSQLite、監査、バックアップ方式へ置き換えます。社内限定利用のPhase1では認証・権限制御を実装しません。

正式仕様は、**ChatGPTとの壁打ちで整理された補足内容、社長手書きメモ、既存製造管理アプリ**の3つを統合します。競合時はこの順で優先します。

## 成果物

|成果物|ファイル|
|---|---|
|①既存アプリ解析書|[01-existing-application-analysis.md](docs/01-existing-application-analysis.md)|
|②差分一覧|[02-gap-classification.md](docs/02-gap-classification.md)|
|③改善提案|[03-improvement-proposals.md](docs/03-improvement-proposals.md)|
|④DB設計|[04-database-design.md](docs/04-database-design.md)|
|⑤画面一覧|[05-screen-list.md](docs/05-screen-list.md)|
|⑥画面遷移図|[06-screen-flow.md](docs/06-screen-flow.md)|
|⑦API設計|[07-api-design.md](docs/07-api-design.md)|
|⑧マスタ一覧|[08-master-list.md](docs/08-master-list.md)|
|⑨集計ロジック一覧|[09-aggregation-logic.md](docs/09-aggregation-logic.md)|
|⑩ダッシュボード設計|[10-president-dashboard.md](docs/10-president-dashboard.md)|
|⑪Phase1実装計画|[11-phase1-plan.md](docs/11-phase1-plan.md)|
|⑫Phase2実装計画|[12-phase2-plan.md](docs/12-phase2-plan.md)|
|入力画面・帳票対応設計|[13-input-screen-ledger-mapping.md](docs/13-input-screen-ledger-mapping.md)|
|Phase2A運用・連携仕様|[14-phase2a-line-n8n-operations.md](docs/14-phase2a-line-n8n-operations.md)|
|Phase2A API仕様|[15-phase2a-api-specification.md](docs/15-phase2a-api-specification.md)|
|Phase2A ER図・移行|[16-phase2a-er-and-migration.md](docs/16-phase2a-er-and-migration.md)|
|Render・n8n・LINE構築手順|[17-render-n8n-line-setup-manual.md](docs/17-render-n8n-line-setup-manual.md)|

設計レビューは2026-07-19に承認され、Phase1実装を開始しました。残る「共通フレーバー原料の配賦方法」は非阻害事項として拡張構造だけを先行実装します。

## 現在実装済みのPhase1範囲

- Node.js標準HTTP＋SQLite基盤
- 認証を伴わない社内利用と操作監査ログ
- 工程、入荷、個人加工、製造、在庫、納品、売掛、工数、労務費の原本DB
- れんこん工程フローDashboard、青果簡易Dashboard
- 工程、人員、商品別採算の詳細API
- 登録コードによるLINE利用者紐付け、開始・終了・休憩の状態管理
- n8n向けHMAC署名、時刻検証、イベント重複防止、未終了通知キュー
- 管理者PINで保護したLINE利用者管理、工数訂正、会社設定
- 紙の検品票順の入力、実測－検品破棄による原料在庫、内部ロット自動採番
- 納品書に基づく仕入原価、工程間中間在庫、製造・完成、納品準備資材、出荷・売上
- 出荷時の直接原価内訳、粗利益、粗利率スナップショット
- 棚卸・理由付き在庫調整、在庫一覧、最低限マスタの追加・名称変更・使用停止
- 人別・工程別時間／労務費と、SKUへ配賦しない部門共通労務費
- 従業員コード・所属・時給・LINE対象・在籍状態を一元管理する従業員マスタ
