create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create type user_role as enum ('super_admin', 'admin', 'member');
create type reservation_status as enum ('reserved', 'cancelled', 'attended');
create type application_status as enum ('pending', 'reviewing', 'rejected', 'approved', 'withdrawn');

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  password_hash text not null,
  university text not null default '',
  faculty text not null default '',
  department text not null default '',
  grade smallint not null default 1 check (grade between 1 and 6),
  email text not null default '',
  line_id text,
  tennis_experience text not null default '',
  has_racket boolean not null default false,
  avatar_url text,
  role user_role not null default 'member',
  created_at timestamptz not null default now()
);
create index users_name_idx on users using gin (name gin_trgm_ops);
create index users_university_idx on users (university);

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  capacity integer not null check (capacity > 0),
  description text,
  event_type text not null default 'tennis' check (event_type in ('tennis', 'event')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_starts_at_idx on events (starts_at);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  status reservation_status not null default 'reserved',
  created_at timestamptz not null default now(),
  unique(user_id, event_id)
);
create index reservations_event_idx on reservations (event_id, status);

create table membership_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  status application_status not null default 'pending',
  applied_at timestamptz not null default now()
);

create table app_settings (
  id smallint primary key default 1 check (id = 1),
  recruiting_open boolean not null default true
);
insert into app_settings (id, recruiting_open) values (1, true);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);

create table membership_withdrawals (
  id bigint generated always as identity primary key,
  former_user_id uuid not null,
  name text not null,
  university text not null default '',
  faculty text not null default '',
  department text not null default '',
  grade smallint,
  email text not null default '',
  line_id text,
  tennis_experience text not null default '',
  has_racket boolean not null default false,
  reservation_history jsonb not null default '[]'::jsonb,
  withdrawal_source text not null check (withdrawal_source in ('self', 'admin')),
  withdrawn_by uuid references users(id) on delete set null,
  withdrawn_at timestamptz not null default now()
);

alter table users enable row level security;
alter table events enable row level security;
alter table reservations enable row level security;
alter table membership_applications enable row level security;
alter table app_settings enable row level security;
alter table audit_logs enable row level security;
alter table membership_withdrawals enable row level security;

-- This app only accesses the database from trusted Next.js server code using the service role.
-- Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
