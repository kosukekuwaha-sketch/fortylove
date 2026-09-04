-- super_adminは常時利用可能。adminとmemberへの公開可否だけを保存する。
alter table public.app_settings
  add column if not exists chatbot_admin_enabled boolean not null default false,
  add column if not exists chatbot_member_enabled boolean not null default false;
