import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { seal, unseal } from "./monitor.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safePath = (name) => typeof name === "string" && name.length <= 1024 && name.split("/").every((part) => part && part !== "." && part !== ".." && !/[\\\0]/.test(part));
const checked = (result) => { if (result.error) throw new Error("Storage operation failed"); return result.data; };

export async function snapshotStorage(client, maxBytes = 256 * 1024 * 1024) {
  const buckets = checked(await client.storage.listBuckets()).filter((b) => ["avatars", "event-documents"].includes(b.name));
  const objects = []; let total = 0;
  for (const bucket of buckets) {
    const queue = [""];
    for (let index = 0; index < queue.length; index++) {
      if (queue.length > 10000) throw new Error("Storage directory limit exceeded");
      const prefix = queue[index];
      for (let offset = 0; ; offset += 1000) {
        const rows = checked(await client.storage.from(bucket.name).list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } }));
        for (const row of rows) {
          const name = prefix ? `${prefix}/${row.name}` : row.name;
          if (!safePath(name)) throw new Error("Invalid storage path");
          if (!row.id) { queue.push(name); continue; }
          if (objects.length >= 10000) throw new Error("Storage object limit exceeded");
          const file = checked(await client.storage.from(bucket.name).download(name));
          total += file.size;
          if (total > maxBytes) throw new Error("Snapshot exceeds memory budget; use a streamed backup workflow");
          const bytes = Buffer.from(await file.arrayBuffer());
          objects.push({ bucket: bucket.name, name, contentType: file.type || "application/octet-stream", bytes: bytes.toString("base64"), sha256: digest(bytes) });
        }
        if (rows.length < 1000) break;
      }
    }
  }
  return { version: 1, createdAt: new Date().toISOString(), buckets: buckets.map((b) => ({ name: b.name, public: b.public, fileSizeLimit: b.file_size_limit, allowedMimeTypes: b.allowed_mime_types })), objects };
}

export async function restoreStorage(client, snapshot) {
  if (snapshot.version !== 1 || !Array.isArray(snapshot.buckets) || !Array.isArray(snapshot.objects)) throw new Error("Invalid snapshot");
  const names = new Set(snapshot.buckets.map((b) => b.name));
  if (names.size !== snapshot.buckets.length || [...names].some((name) => !["avatars", "event-documents"].includes(name))) throw new Error("Invalid buckets");
  const seen = new Set();
  for (const object of snapshot.objects) {
    const key = `${object.bucket}/${object.name}`;
    if (!names.has(object.bucket) || !safePath(object.name) || seen.has(key) || digest(Buffer.from(object.bytes, "base64")) !== object.sha256) throw new Error("Invalid snapshot checksum or path");
    seen.add(key);
  }
  if (checked(await client.storage.listBuckets()).length) throw new Error("Restore target must have no buckets; existing data will not be overwritten");
  for (const bucket of snapshot.buckets) checked(await client.storage.createBucket(bucket.name, { public: bucket.public, fileSizeLimit: bucket.fileSizeLimit, allowedMimeTypes: bucket.allowedMimeTypes }));
  for (const object of snapshot.objects) {
    checked(await client.storage.from(object.bucket).upload(object.name, Buffer.from(object.bytes, "base64"), { upsert: false, contentType: object.contentType }));
    const restored = checked(await client.storage.from(object.bucket).download(object.name));
    if (digest(Buffer.from(await restored.arrayBuffer())) !== object.sha256) throw new Error("Restored object checksum mismatch");
  }
  return { verifiedObjects: snapshot.objects.length, verifiedBuckets: snapshot.buckets.length };
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (!["export", "restore"].includes(mode) || !file) throw new Error("Usage: storage-snapshot.mjs export|restore snapshot.enc");
  const url = new URL(process.env.BACKUP_SUPABASE_URL), key = process.env.BACKUP_SERVICE_ROLE_KEY;
  if (url.protocol !== "https:" || url.username || url.password || !key) throw new Error("An HTTPS Supabase project and service key are required");
  const client = createClient(url.origin, key, { auth: { persistSession: false } });
  if (mode === "export") {
    const snapshot = await snapshotStorage(client);
    await writeFile(resolve(file), seal(snapshot, process.env.BACKUP_ENCRYPTION_KEY), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ encrypted: true, objects: snapshot.objects.length, buckets: snapshot.buckets.length }));
  } else {
    if (process.env.RESTORE_CONFIRM_HOST !== url.hostname) throw new Error("Explicit RESTORE_CONFIRM_HOST is required for the empty destination project");
    console.log(JSON.stringify(await restoreStorage(client, unseal(await readFile(resolve(file)), process.env.BACKUP_ENCRYPTION_KEY))));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error("Storage snapshot operation failed. Check configuration, size limit, checksum and empty destination. Existing data is never overwritten."); process.exitCode = 1; });
