-- 管理者・一般ユーザーが参照するMarkdownファイル名を個別に保持する。
alter table public.app_settings
  add column if not exists chatbot_admin_sources text[] not null default '{}',
  add column if not exists chatbot_member_sources text[] not null default '{}';

-- 既にSQLを実行済みでも、PostgRESTのスキーマキャッシュを確実に更新する。
notify pgrst, 'reload schema';
