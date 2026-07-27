"use client";

import { useState } from "react";

const MAX_SIDE = 512;

export function AvatarInput() {
  const [status, setStatus] = useState("選択した画像は自動で圧縮されます");

  return (
    <label className="full">プロフィール画像（任意）
      <input
        name="avatar"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          setStatus("画像を圧縮しています…");

          try {
            const bitmap = await createImageBitmap(file);
            const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();

            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/webp", 0.82),
            );
            if (!blob) throw new Error("compression failed");

            const compressed = new File([blob], "avatar.webp", { type: "image/webp" });
            const files = new DataTransfer();
            files.items.add(compressed);
            input.files = files.files;
            setStatus(`自動圧縮済み（${Math.max(1, Math.round(compressed.size / 1024))}KB）`);
          } catch {
            setStatus("圧縮できなかったため元の画像を使用します（2MBまで）");
          }
        }}
      />
      <small>{status}</small>
    </label>
  );
}
