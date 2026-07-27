-- 退会済みの状態を入会申請ステータスへ追加
alter type application_status
add value if not exists 'withdrawn';
