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
- 明確な質問はFAQをそのまま返し、複数FAQにまたがる質問だけGeminiで根拠付き統合
- 曖昧な質問は最大3件の候補ボタンを表示し、ボタンまたは`1`・`2`・`3`入力で選択
- 「新歓はいつまで」など募集期間の質問はイベント日時よりMarkdown FAQを優先
- 新着回答への自動スクロールと、チャット入力欄のブラウザ入力履歴抑制
- 個人情報を入力しない旨と、必要時に質問・Markdown内容をGoogle Geminiへ送信する旨をチャット画面に表示
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

サーバー処理は`app/server-actions/`へ集約し、機能領域ごとに分割しています。既存の会員画面向けimportは互換用の`app/actions.ts`で維持します。

- `app/server-actions/auth-actions.ts`: ログイン、登録、ログアウト
- `app/server-actions/member-actions.ts`: 予約、キャンセル、プロフィール、本人退会
- `app/server-actions/admin-member-actions.ts`: 権限、パスワード、入会・退会者管理
- `app/server-actions/event-actions.ts`: イベント、参加状況、PDF操作
- `app/server-actions/faq-actions.ts`: FAQ・カテゴリ操作
- `app/server-actions/chatbot-actions.ts`: チャットBot回答データ操作
- `app/server-actions/settings-actions.ts`: 新歓受付設定
- `lib/server/action-context.ts`: 管理権限の確認
- `lib/server/avatar-service.ts`: アバターの保存・後処理
- `lib/server/member-account-service.ts`: 原子的な退会処理の呼び出し
- `lib/server/form-data.ts`: FormDataの共通読取り

## 品質要件

品質改善の判断基準は、[Fortylove 改善要件定義書 v1.0 追補（2026-09-04）](docs/quality-requirements/Fortylove_改善要件定義書_v1.0_追補_2026-09-04.docx)にまとめています。信頼性、セキュリティ、データ整合性、テスト、CI/CD、監視、復旧性、保守性を対象とし、優先度を次のように扱います。

- `P0`: データ不整合、認証情報漏えい、定期処理停止など、本番運用前に解消すべきリリースブロッカー
- `P1`: 重大障害の予防・検知・変更安全性を高める改善項目
- `P2`: 保守性、UX、アクセシビリティ、開発効率を継続的に高める項目

2026年9月4日の追補では、登録フォームのパスワード等をWeb Storageへ保存しないことを`P0`、画面・Next.js・Server Action・Supabase Storage間でPDFアップロード上限を一致させることを`P1`として追加しています。変更時は、文書内の受入条件とDefinition of Doneに対応する自動テストおよび運用手順も併せて更新します。

### 2026-09-04追補の実装状況

- `SEC-AUTH-004`：登録下書きは明示的なallowlistに含まれるプロフィール項目だけを`sessionStorage`へ保存します。パスワード、トークン、Secret、未許可項目は保存せず、旧形式の下書きに含まれる場合も次回読込時に削除します。
- `FR-DOC-002`：イベントPDFは画面・Client検証・署名URL発行API・Supabase Storageで一律15MB以下とします。[Vercel Functionsの4.5MB payload上限](https://vercel.com/docs/functions/limitations#request-body-size)を回避するため、PDF本体はServer Actionを経由せず、管理者認証後に発行した一時URLを使ってブラウザから非公開のSupabase Storageへ直接アップロードします。保存確定時にstagingからイベント固有パスへ移動し、同一Storageパスの複数イベント参照をDB制約で防ぎます。
- 境界条件は`lib/registration-draft.test.ts`と`lib/event-document-policy.test.ts`で検証します。上限ちょうどのPDFを許可し、1byte超過・MIME type不一致・不正パスを拒否します。

### P0・P1品質改善の実装状況

- 予約登録は`reserve_event` RPC内でイベント行をロックし、定員確認と登録を同一トランザクションで実行します。定員超過となる競合をDB側で防ぎます。
- 予約キャンセルは`cancel_event_reservation` RPCでイベント行をロックし、DB時刻を基準に開始2時間前の締切を判定します。
- 退会は台帳保存・監査ログ・ユーザー削除を`archive_and_delete_member` RPCの1トランザクションで実行します。Storageのアバター削除はコミット後の後処理とし、失敗時はサーバーログへ記録します。
- ログイン失敗は接続元とログイン名をHMAC-SHA256化した識別子で集計し、10分間に5回失敗すると10分間停止します。名前とIPアドレスそのものはRate Limitテーブルや監査ログへ保存しません。
- 新規登録は接続元をHMAC-SHA256化した識別子で集計し、1時間に5回までに制限します。上限超過は1時間停止し、登録フォームを使ったBot・大量bcrypt処理を抑制します。
- セッションには`session_version`を含め、リクエストごとにDBと照合します。管理者が権限またはパスワードを変更すると既存セッションは即時無効になります。
- 年次学年更新は`promote_member_grades` RPCのトランザクションとadvisory lockで排他・再実行安全にしています。同一年の再実行では更新をスキップします。
- CIはTypeScript・Vitest・本番ビルドに加え、PostgreSQL 17上でスキーマと`supabase/tests/p0_quality.sql`を検証します。DependabotはnpmとGitHub Actionsを週次確認します。

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
CRON_SECRET=replace-with-a-separate-random-secret
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

既存環境へチャットBot管理機能を追加する場合は、`supabase/migrations/20260903_add_chatbot_knowledge.sql`、`supabase/migrations/20260904_add_chatbot_markdown_sources.sql`、`supabase/migrations/20260904_add_chatbot_escalation_email.sql`、`supabase/migrations/20260904_add_chatbot_audience_access.sql`、`supabase/migrations/20260904_add_chatbot_audience_sources.sql`、`supabase/migrations/20260904_add_chatbot_daily_usage.sql`、`supabase/migrations/20260904_add_p0_quality_guards.sql`、`supabase/migrations/20260905_add_registration_and_document_guards.sql`の順に実行してください。P0マイグレーションを適用するまでは、新しいログイン・登録・予約・退会・キャンセル・権限変更・Cron処理は動作しません。実行前後の確認とロールバック判断は[DB変更運用手順](docs/operations/database-migrations.md)に従ってください。

`super_admin`は`/admin/chatbot`で常時テストでき、管理者・一般ユーザーの利用許可とMarkdown参照元を個別に切り替えられます。回答データはUTF-8・最大512KBの`.md`だけで管理し、同名ファイルを再度読み込むと内容を差し替えます。Geminiを使う場合はVercelへ`GEMINI_API_KEY`と`GEMINI_MODEL`を設定してください。メール通知を使う場合は、Brevoで認証済みの送信元を用意し、Vercelにも`BREVO_API_KEY`、`BREVO_SENDER_EMAIL`、`BREVO_SENDER_NAME`を設定してください。通知先は最高情報責任者が管理画面から変更できます。

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
5. PostgreSQL上でのスキーマ・P0統合テスト

本番はGitHubリポジトリをVercelへ接続し、Environment Variablesへ`.env.example`の項目を登録します。`CRON_SECRET`はVercel Cronの認証に使うため、`SESSION_SECRET`とは別の十分長いランダム値にします。`main`へのpush後、CIとVercelデプロイの双方が成功していることを確認してください。GitHubの`main`ブランチには、Pull Request必須・CIの`database`と`verify`必須・承認1名以上・管理者にも適用、のBranch protection ruleを設定してください。

## 運用監視

- `GET /api/health`はアプリとSupabaseの接続状態をJSONで返します。正常時はHTTP 200、DB接続異常時は503です。
- Vercel LogsでServer Action、Cron、ヘルスチェックのエラーを確認します。
- UptimeRobotなどの外形監視から`/api/health`を5分間隔で監視できます。
- 管理操作は`audit_logs`へ記録されます。
- Supabaseのバックアップ設定と復旧手順の定期確認を本番運用前に行ってください。

## 定期処理

`vercel.json`のCronは、毎年4月1日に`/api/cron/promote-grades`で対象ユーザーの学年を更新し、毎日3時（日本時間）に`/api/cron/cleanup-event-uploads`で24時間を超えた未確定PDFを削除します。どちらも`Authorization: Bearer <CRON_SECRET>`だけを受け付けます。本番では実行後にVercel Logsを確認し、学年更新では`audit_logs`の`grade.promote.<年>`も確認してください。

## セキュリティ上の注意

- service role keyと`SESSION_SECRET`は漏えい時に即時ローテーションしてください。
- 管理者権限は必要最小限にしてください。
- PDF・画像アップロードには形式と容量制限があります。
- 公開前にSupabaseの権限、Storage bucket、Vercel環境変数を再確認してください。

## 現在のテスト範囲

パスワードポリシー、登録下書きの機密情報除外、ログインRate Limit識別子、イベントPDFのサイズ・形式・アップロードパス、チャットBotの回答判定などを単体テストしています。PostgreSQL統合テストでは予約定員、キャンセル、退会、学年更新の冪等性、ログイン失敗上限を確認します。実ブラウザでの登録・予約・PDFアップロード・閲覧を連結したE2Eテストは今後の対象です。
