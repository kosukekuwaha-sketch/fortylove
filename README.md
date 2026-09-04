# 早大Fortylove 新歓管理アプリ

早稲田大学のテニスサークル「Fortylove」の新歓受付、練習・イベント予約、参加者管理を一元化するWebアプリです。一般ユーザー向け画面と、権限別の管理画面を備えています。

## 主な機能

### 一般ユーザー

- 新歓受付登録・ログイン
- 大学／学部／学科、学年、テニス経験、ラケット所持状況の登録
- プロフィール・アイコン編集
- 練習／イベントの予約・キャンセル
- 参加予定カレンダー
- イベントPDF資料の閲覧（FAQは準備中のためナビゲーション非表示）
- FAQにない質問の投稿
- アカウント削除

### 管理者

- 新歓受付名簿・入会者リストの閲覧
- イベントの作成・編集・削除、定員・貸出ラケット数の確認
- 参加者属性の確認
- FAQ・カテゴリ管理
- 新歓生からの質問への回答・FAQ公開
- チャットBotの常時動作確認（最高情報責任者のみ）
- 管理者・一般ユーザーそれぞれへのチャットBot利用許可設定（最高情報責任者のみ）
- 管理者・一般ユーザー別のMarkdown参照元設定と切替テスト（最高情報責任者のみ）
- 右下のチャットボタンと小型チャットウィンドウ
- Markdown検索を優先し、必要な場合だけGemini APIで回答を生成
- 管理者・一般ユーザーは1人1日10件まで（超過時は有人対応へ案内）
- Markdown資料を見出しごとに回答データへ反映し、同名ファイルの再読込で差し替え（最高情報責任者のみ）
- 回答不能時の有人対応確認（「はい」の場合のみ管理者の対応待ちへ登録）
- 有人対応の通知先メールアドレス設定（最高情報責任者のみ）とBrevoメール通知
- 新歓受付の停止・再開（最高情報責任者のみ）
- 管理者権限の付与（最高情報責任者のみ）
- 退会者台帳の閲覧・復旧・完全削除（最高情報責任者のみ）
- 管理操作の監査ログ保存

## 技術構成

- Next.js 15 App Router / React 19 / TypeScript
- Supabase PostgreSQL・Storage
- bcryptによるパスワードハッシュ
- 署名済みHttpOnly Cookieによるセッション管理
- Vercel（Webホスティング・Cron）
- Vitest（単体テスト）
- GitHub Actions（型検査・テスト・本番ビルド）

サーバー処理は責務別に分割しています。

- `app/actions.ts`: 認証、プロフィール、会員・権限管理
- `app/event-actions.ts`: イベント、参加状況、PDF操作
- `app/faq-actions.ts`: FAQ・カテゴリ操作
- `app/chatbot-actions.ts`: チャットBot回答データ操作
- `lib/server/`: Server Action共通処理と外部ストレージ処理

## 品質要件

品質改善の判断基準は、[Fortylove 改善要件定義書 v1.0 追補（2026-09-04）](docs/quality-requirements/Fortylove_改善要件定義書_v1.0_追補_2026-09-04.docx)にまとめています。信頼性、セキュリティ、データ整合性、テスト、CI/CD、監視、復旧性、保守性を対象とし、優先度を次のように扱います。

- `P0`: データ不整合、認証情報漏えい、定期処理停止など、本番運用前に解消すべきリリースブロッカー
- `P1`: 重大障害の予防・検知・変更安全性を高める改善項目
- `P2`: 保守性、UX、アクセシビリティ、開発効率を継続的に高める項目

2026年9月4日の追補では、登録フォームのパスワード等をWeb Storageへ保存しないことを`P0`、画面・Next.js・Server Action・Supabase Storage間でPDFアップロード上限を一致させることを`P1`として追加しています。変更時は、文書内の受入条件とDefinition of Doneに対応する自動テストおよび運用手順も併せて更新します。

## ローカルセットアップ

必要環境はNode.js 22以上、pnpm 11です。

```bash
pnpm install
```

`.env.example`を`.env.local`へコピーし、次の値を設定します。

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SESSION_SECRET=replace-with-at-least-32-random-characters
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=verified-sender@example.com
BREVO_SENDER_NAME=Fortylove
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

`SUPABASE_SERVICE_ROLE_KEY`はサーバー専用です。`NEXT_PUBLIC_`を付けたり、GitHubへコミットしたり、ブラウザ側のコードから参照したりしないでください。

Supabase SQL Editorで`supabase/schema.sql`を実行後、開発サーバーを起動します。

```bash
pnpm dev
```

既存環境へチャットBot管理機能を追加する場合は、`supabase/migrations/20260903_add_chatbot_knowledge.sql`、`supabase/migrations/20260904_add_chatbot_markdown_sources.sql`、`supabase/migrations/20260904_add_chatbot_escalation_email.sql`、`supabase/migrations/20260904_add_chatbot_audience_access.sql`、`supabase/migrations/20260904_add_chatbot_audience_sources.sql`、`supabase/migrations/20260904_add_chatbot_daily_usage.sql`の順にSupabase SQL Editorで実行してください。`super_admin`は`/admin/chatbot`で常時テストでき、管理者・一般ユーザーの利用許可とMarkdown参照元を個別に切り替えられます。回答データはUTF-8・最大512KBの`.md`だけで管理し、同名ファイルを再度読み込むと内容を差し替えます。Geminiを使う場合はVercelへ`GEMINI_API_KEY`と`GEMINI_MODEL`を設定してください。メール通知を使う場合は、Brevoで認証済みの送信元を用意し、Vercelにも`BREVO_API_KEY`、`BREVO_SENDER_EMAIL`、`BREVO_SENDER_NAME`を設定してください。通知先は最高情報責任者が管理画面から変更できます。

Markdown参照元の保存時に設定列がない旨が表示された場合は、`supabase/migrations/20260904_add_chatbot_audience_sources.sql`をSupabase SQL Editorで再実行してください。このSQLは再実行可能で、PostgRESTのスキーマキャッシュも更新します。

## 初期管理者

`supabase/seed.sql`のコメントに従い、名前、パスワード、所属を変更して実行します。初期投入後は管理画面から権限を管理してください。平文パスワードはデータベースへ保存されません。

## 開発用コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | 開発サーバーを起動 |
| `pnpm typecheck` | TypeScript型検査 |
| `pnpm test` | 単体テストを1回実行 |
| `pnpm test:watch` | 単体テストを監視実行 |
| `pnpm build` | Vercel相当の本番ビルド |
| `pnpm check` | 型検査・テスト・ビルドを連続実行 |

## パスワード方針

新規登録、管理者による再設定、退会者復旧では8文字以上を必須とします。移行時に既存利用者を締め出さないため、以前に登録された短いパスワードはログイン時のみ引き続き利用できます。再設定時には新基準が適用されます。

## CI・デプロイ

`.github/workflows/ci.yml`により、`main`へのpushとPull Requestで以下を自動実行します。

1. 依存関係の固定インストール
2. TypeScript型検査
3. Vitest単体テスト
4. Next.js本番ビルド

本番はGitHubリポジトリをVercelへ接続し、Environment Variablesへ`.env.example`の項目を登録します。`main`へのpush後、CIとVercelデプロイの双方が成功していることを確認してください。

## 運用監視

- `GET /api/health`はアプリとSupabaseの接続状態をJSONで返します。正常時はHTTP 200、DB接続異常時は503です。
- Vercel LogsでServer Action、Cron、ヘルスチェックのエラーを確認します。
- UptimeRobotなどの外形監視から`/api/health`を5分間隔で監視できます。
- 管理操作は`audit_logs`へ記録されます。
- Supabaseのバックアップ設定と復旧手順の定期確認を本番運用前に行ってください。

## 定期処理

`vercel.json`のCronが毎年4月1日に`/api/cron/promote-grades`を実行し、対象ユーザーの学年を更新します。本番ではVercel Cronの実行ログも確認してください。

## セキュリティ上の注意

- service role keyと`SESSION_SECRET`は漏えい時に即時ローテーションしてください。
- 管理者権限は必要最小限にしてください。
- PDF・画像アップロードには形式と容量制限があります。
- 公開前にSupabaseの権限、Storage bucket、Vercel環境変数を再確認してください。

## 現在のテスト範囲

パスワードポリシーなど副作用のないロジックから単体テストを追加しています。予約の同時実行、権限制御、主要画面の操作については今後、Supabaseテスト環境を使った統合テストとE2Eテストを追加する余地があります。
