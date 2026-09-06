import { expect, it } from "vitest";
import { restoreStorage, snapshotStorage } from "./storage-snapshot.mjs";

function storageClient(initial = {}) {
  const buckets = new Map(Object.entries(initial));
  return { storage: {
    listBuckets: async () => ({ data: [...buckets.keys()].map((name) => ({ name, public: false, file_size_limit: 15000000 })), error: null }),
    createBucket: async (name) => { if (buckets.has(name)) return { error: "exists" }; buckets.set(name, {}); return { data: {}, error: null }; },
    from: (bucket) => ({
      list: async (prefix, { limit, offset }) => {
        const rows = new Map();
        for (const path of Object.keys(buckets.get(bucket) ?? {})) {
          const base = prefix ? `${prefix}/` : ""; if (!path.startsWith(base)) continue;
          const tail = path.slice(base.length), name = tail.split("/")[0]; rows.set(name, { name, id: tail.includes("/") ? null : `id-${path}` });
        }
        return { data: [...rows.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(offset, offset + limit), error: null };
      },
      download: async (name) => buckets.get(bucket)?.[name] ? { data: new Blob([buckets.get(bucket)[name]], { type: "application/pdf" }), error: null } : { error: "missing" },
      upload: async (name, bytes, options) => {
        expect(options.upsert).toBe(false); const files = buckets.get(bucket); if (files[name]) return { error: "exists" }; files[name] = bytes; return { data: {}, error: null };
      },
    }),
  } };
}
it("exports nested objects, restores into an empty project and verifies downloaded bytes", async () => {
  const snapshot = await snapshotStorage(storageClient({ "event-documents": { "event/sample.pdf": Buffer.from("%PDF synthetic") }, avatars: { "member/a.png": Buffer.from("synthetic avatar") } }));
  expect(snapshot.objects).toHaveLength(2);
  expect(await restoreStorage(storageClient(), snapshot)).toEqual({ verifiedObjects: 2, verifiedBuckets: 2 });
});
it("refuses occupied restore targets, corrupt bytes, traversal and oversize snapshots", async () => {
  const snapshot = await snapshotStorage(storageClient({ avatars: { "a.png": Buffer.from("image") } }));
  await expect(restoreStorage(storageClient({ avatars: {} }), snapshot)).rejects.toThrow("no buckets");
  const corrupt = structuredClone(snapshot); corrupt.objects[0].bytes = Buffer.from("bad").toString("base64");
  await expect(restoreStorage(storageClient(), corrupt)).rejects.toThrow("checksum");
  const traversal = structuredClone(snapshot); traversal.objects[0].name = "../escape";
  await expect(restoreStorage(storageClient(), traversal)).rejects.toThrow("path");
  await expect(snapshotStorage(storageClient({ avatars: { "large.png": Buffer.alloc(10) } }), 1)).rejects.toThrow("memory budget");
});
