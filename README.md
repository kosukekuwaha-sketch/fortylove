# FORTYLOVE — テニスサークル新歓管理

新入生の登録、練習予約・キャンセル、入会申請、管理者向け名簿・イベント管理をまとめた Next.js アプリです。

## セットアップ

1. Supabase で新規プロジェクトを作成し、SQL Editor で `supabase/schema.sql` を実行します。
2. `.env.example` を `.env.local` にコピーし、3つの環境変数を設定します。
3. `npm install`、`npm run dev` で起動します。

## 初期管理者

`supabase/seed.sql` のコメントに従って bcrypt ハッシュを生成し、名前・メールとともに置き換えてから実行します。サービスロールキーはサーバーでのみ利用し、ブラウザへ公開しないでください。

## Vercel

GitHub リポジトリを Vercel にインポートし、Environment Variables に `.env.example` の3項目を登録します。Framework Preset は Next.js、Build Command は `npm run build` のままで動作します。
