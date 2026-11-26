// Image upload for business logos and offer banners. Files go under "<business_id>/" (the storage
// policies check the caller may manage that business); a new name per upload avoids stale caches.
"use client";
import type { Result } from "@rewards/shared";
import { api } from "./api";

export function imagePath(businessId: string, kind: "logo" | "banner", file: File): string {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${businessId}/${kind}-${Date.now()}${ext ? `.${ext}` : ""}`;
}

export const uploadImage = (bucket: string, businessId: string, kind: "logo" | "banner", file: File): Promise<Result<{ path: string }>> =>
  api.storage.upload(bucket, imagePath(businessId, kind, file), file);

export const imageUrl = (bucket: string | undefined, path: string | null | undefined): string | null =>
  bucket && path ? api.storage.publicUrl(bucket, path) : null;
