import { db } from "@/lib/db";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

type AvatarUploadResult =
  | { avatarUrl: string; error?: never }
  | { avatarUrl?: never; error: "avatar-type" | "avatar-size" | "avatar-upload" };

export async function uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult> {
  const extension = AVATAR_EXTENSIONS[file.type];
  if (!extension) return { error: "avatar-type" };
  if (file.size > AVATAR_MAX_BYTES) return { error: "avatar-size" };

  const client = db();
  const { data: bucket } = await client.storage.getBucket(AVATAR_BUCKET);
  if (!bucket) {
    const { error } = await client.storage.createBucket(AVATAR_BUCKET, {
      public: true,
      fileSizeLimit: AVATAR_MAX_BYTES,
      allowedMimeTypes: Object.keys(AVATAR_EXTENSIONS),
    });
    if (error) return { error: "avatar-upload" };
  }

  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error } = await client.storage.from(AVATAR_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { error: "avatar-upload" };
  return { avatarUrl: client.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl };
}

export async function removeAvatarFiles(userId: string) {
  const client = db();
  const { data: files, error: listError } = await client.storage.from(AVATAR_BUCKET).list(userId);
  if (listError) {
    console.error("Post-withdrawal avatar listing failed", { userId, message: listError.message });
    return;
  }
  if (!files?.length) return;
  const { error } = await client.storage.from(AVATAR_BUCKET).remove(files.map((file) => `${userId}/${file.name}`));
  if (error) console.error("Post-withdrawal avatar cleanup failed", { userId, message: error.message });
}
