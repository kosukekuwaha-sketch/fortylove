-- Generate the password hash locally:
-- node -e "require('bcryptjs').hash('CHANGE-ME', 12).then(console.log)"
-- Then replace the placeholder before running this statement.
insert into users (name, password_hash, university, faculty, grade, role)
values ('運営管理者', '$2b$12$REPLACE_WITH_A_REAL_BCRYPT_HASH', '早稲田大学', '運営', 4, 'super_admin');
