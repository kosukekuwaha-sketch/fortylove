# DB変更運用手順

## 適用前

1. Supabase Dashboardで直近バックアップの完了時刻と復元可能期間を確認する。
2. 対象SQLをレビューし、削除・型変更・NOT NULL追加・長時間ロックの有無を確認する。
   `20260905_add_registration_and_document_guards.sql`の前には、`select file_path, count(*) from event_documents group by file_path having count(*) > 1;`が0件であることを確認する。
3. Pull Requestの`database`と`verify`が成功していることを確認する。
4. 利用が少ない時間帯を選び、実施者と確認者を決める。

## 適用

1. Supabase SQL Editorで未適用のマイグレーションだけをファイル名順に実行する。
2. エラーが出た場合は後続SQLを実行せず、出力を保存する。
3. `20260904_add_p0_quality_guards.sql`と`20260905_add_registration_and_document_guards.sql`適用後はPostgRESTのschema reload通知まで含めて成功したことを確認する。

## 適用後確認

1. `/api/health`がHTTP 200を返すことを確認する。
2. テスト利用者でログイン、予約、キャンセルを各1回確認する。
3. `super_admin`でチャットBotのMarkdown参照元保存とプレビューを確認する。
4. Vercel LogsとSupabase Logsに新しいエラーがないことを確認する。

## 異常時

- トランザクション内で失敗したSQLは再実行前に対象オブジェクトの有無を確認する。`IF NOT EXISTS`や`CREATE OR REPLACE`を含むマイグレーションでも、途中状態を推測しない。
- データ破損を伴わない場合は、アプリを直前のVercel deploymentへ戻し、原因修正後に再適用する。
- データ破損が疑われる場合は書込みを止め、Supabaseのバックアップから別プロジェクトへ復元して差分を確認する。本番へ直接上書き復元しない。
- 復旧後は発生時刻、影響範囲、実施SQL、復旧内容、再発防止策を記録する。

四半期ごとにバックアップから別環境への復元演習を行い、所要時間と手順の不足をREADMEまたは運用記録へ反映する。
