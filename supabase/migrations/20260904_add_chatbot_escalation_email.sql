-- チャットBot有人対応の通知先。super_adminだけがサーバー経由で編集する。
alter table public.app_settings
  add column if not exists chatbot_escalation_email text
  check (
    chatbot_escalation_email is null
    or (
      char_length(chatbot_escalation_email) <= 254
      and chatbot_escalation_email ~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$'
    )
  );
