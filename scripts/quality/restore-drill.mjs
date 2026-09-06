import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

if (!["127.0.0.1", "localhost"].includes(process.env.PGHOST) || process.env.PGDATABASE !== "fortylove_quality") throw new Error("Restore drill only supports disposable local fortylove_quality databases");
const started = Date.now(), target = `fortylove_quality_restore_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const psql = process.env.PSQL_BIN || "psql", pgDump = process.env.PG_DUMP_BIN || "pg_dump", pgRestore = process.env.PG_RESTORE_BIN || "pg_restore";
const run = (sql, database = process.env.PGDATABASE) => execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-d", database, "-c", sql], { env: process.env, encoding: "utf8" }).trim();
// Never overwrite or drop a database, even in the test environment.
if (run(`select count(*) from pg_database where datname='${target}'`, "postgres") !== "0") throw new Error("Restore target already exists; use a fresh disposable cluster");
const directory = resolve(".backup-drill", randomUUID()); await mkdir(directory, { recursive: true, mode: 0o700 });
const snapshotAt = Date.now();
execFileSync(pgDump, ["--format=custom", "--file", join(directory, "database.dump")], { env: process.env, stdio: "pipe" });
run(`create database ${target}`, "postgres");
execFileSync(pgRestore, ["--exit-on-error", "--no-owner", "--dbname", target, join(directory, "database.dump")], { env: process.env, stdio: "pipe" });
const tables = run("select tablename from pg_tables where schemaname='public' order by tablename").split(/\r?\n/).filter(Boolean);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const table of tables) {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Unexpected table identifier");
  const query = `select coalesce(jsonb_agg(row order by row::text),'[]'::jsonb)::text from (select to_jsonb(t) row from public.${table} t) s`;
  if (hash(run(query)) !== hash(run(query, target))) throw new Error(`Restored rows differ: ${table}`);
}
for (const query of [
  "select typname,enumlabel,enumsortorder from pg_enum join pg_type on pg_type.oid=enumtypid join pg_namespace n on n.oid=typnamespace where n.nspname='public' order by 1,3",
  "select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by 1,2",
  "select c.relname,c.relrowsecurity,coalesce(c.relacl::text,'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1",
  "select p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by 1,2",
]) if (hash(run(query)) !== hash(run(query, target))) throw new Error("Restored schema, functions or permissions differ");
run("begin; select reserve_event('70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001'); rollback;", target);

// Storage bytes are a separate backup unit. These synthetic object fixtures are NEVER real member files.
const objects = [{ path: "event-documents/quality.pdf", bytes: Buffer.from("%PDF-1.4\n% Synthetic restore fixture\n%%EOF") }, { path: "avatars/quality.svg", bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>') }];
const manifest = [];
for (const object of objects) {
  const original = join(directory, "storage-snapshot", object.path), restored = join(directory, "storage-restored", object.path);
  await mkdir(join(original, ".."), { recursive: true }); await writeFile(original, object.bytes);
  await mkdir(join(restored, ".."), { recursive: true }); await cp(original, restored, { errorOnExist: true, force: false });
  const digest = hash(await readFile(original)); if (digest !== hash(await readFile(restored))) throw new Error("Storage checksum mismatch");
  manifest.push({ path: object.path, bytes: object.bytes.length, sha256: digest });
}
const report = { measuredAt: new Date().toISOString(), environment: "isolated local PostgreSQL / synthetic storage byte fixtures", tablesVerified: tables.length, schemaAndPermissionsVerified: true, reservationRpcAfterRestore: true, storageObjectsVerified: manifest.length, durationSeconds: (Date.now() - started) / 1000, snapshotAgeSeconds: (Date.now() - snapshotAt) / 1000, rtoTargetSeconds: 14400, rpoTargetSeconds: 86400, caveat: "実データ量・Supabase Storage API・本番のバックアップ取得周期は別途演習する。本番RPO/RTO達成の証明ではない。" };
await mkdir(".ops-reports", { recursive: true }); await writeFile(".ops-reports/restore-drill.json", JSON.stringify(report, null, 2));
await writeFile(join(directory, "storage-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(report));
if (report.durationSeconds > report.rtoTargetSeconds) throw new Error("Local restore exceeded RTO target");
