# 早大Fortylove 新歓管理アプリ

早稲田大学のテニスサークル「Fortylove」向けに、新歓受付、イベント予約、参加者管理をまとめて行うWebアプリです。

## 主な機能

- 新歓受付、ログイン、プロフィール管理
- 練習・イベントの閲覧、予約、キャンセル
- 参加予定のカレンダー表示
- イベント資料の閲覧
- 権限に応じた運営管理画面
- Markdown資料を参照するWebチャットBot
- 問い合わせの有人対応への引き継ぎ

## 技術構成

- Next.js / React / TypeScript
- Supabase（Database / Storage）
- Vercel
- Vitest / Playwright
- GitHub Actions

## 開発

Node.js 22以上とpnpm 11を使用します。

```bash
pnpm install
pnpm dev
```

環境変数は`.env.example`を参考にローカル環境へ設定してください。APIキーやSecretなどの実値はGitへ保存しないでください。

主な確認コマンドは次のとおりです。

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 品質管理

品質方針と受入基準は、[Fortylove 品質要件定義書](docs/quality-requirements/Fortylove_品質要件定義書.md)で管理しています。変更はPull Requestを経由し、自動テストとレビューを通して反映します。

## セキュリティ

- 認証情報、個人情報、本番環境の設定値をリポジトリへ記録しないでください。
- 権限や外部サービスの設定は、必要な担当者だけが管理してください。
- セキュリティ上の問題は公開Issueへ詳細を書かず、管理者へ個別に連絡してください。
