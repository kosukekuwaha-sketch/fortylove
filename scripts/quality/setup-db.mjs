import { execFileSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { ids } from "./test-environment.mjs";

// Destructive resets are intentionally unsupported. CI must provide an empty, disposable local database.
if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST) || process.env.PGDATABASE !== "fortylove_quality") throw new Error("Requires isolated local fortylove_quality database");
const psql = process.env.PSQL_BIN || "psql";
const run = (args) => {
  const sqlIndex = args.indexOf("-c");
  return execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", ...(sqlIndex >= 0 ? [...args.slice(0, sqlIndex), "-f", "-"] : args)], { stdio: "pipe", env: { ...process.env, PGCLIENTENCODING: "UTF8" }, ...(sqlIndex >= 0 ? { input: Buffer.from(args[sqlIndex + 1]) } : {}) }).toString();
};
if (!process.argv.includes("--seed-only")) {
if (run(["-Atc", "select count(*) from information_schema.tables where table_schema='public'"]).trim() !== "0") throw new Error("Test database is not empty; create a fresh database");
run(["-c", "do $$ begin if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;"]);
run(["-f", "supabase/schema.sql"]);
run(["-f", "supabase/tests/storage_stub.sql"]);
} else if (run(["-Atc", "select count(*) from users"]).trim() !== "0") throw new Error("Seed-only requires empty test users");
// Supabase provisions service_role object privileges automatically; plain PostgreSQL does not.
run(["-c", "grant usage on schema public to service_role; grant all on all tables in schema public to service_role; grant usage,select on all sequences in schema public to service_role;"]);
const password = bcrypt.hashSync("QualityTest!123", 10);
run(["-c", `insert into users(id,name,password_hash,role,university,faculty) values
('${ids.member}','Quality Member','${password}','member','早稲田大学','法学部'),
('${ids.admin}','Quality Admin','${password}','admin','早稲田大学','法学部'),
('${ids.superAdmin}','Quality Owner','${password}','super_admin','早稲田大学','法学部');
insert into events(id,title,starts_at,ends_at,location,capacity) values('${ids.event}','Quality Reservation Event',now()+interval '10 days',now()+interval '10 days 2 hours','テストコート',2);
insert into faqs(question,answer,category,is_published) values('初心者でも参加できますか？','初心者も参加できます。','参加',true);
update app_settings set chatbot_member_enabled=true,chatbot_admin_enabled=true;
notify pgrst,'reload schema';`]);
console.log("PASS: empty local test database initialized with synthetic users/events; no production data");
