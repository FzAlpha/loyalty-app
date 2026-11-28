// Profile photo (BACKEND_PLAN §10): pick from the library, square-crop and shrink on the phone, upload
// through api.accounts.setAvatar, and show it through a short-lived signed URL.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import type { AvatarInfo } from "@rewards/shared";
import { api } from "./api";
import { keys, unwrap } from "./queries";

// Client image tuning (not business rules; the server enforces the size limit and file types).
const PHOTO_PX = 512;
const PHOTO_QUALITY = 0.8;
// Refetch the signed URL well before it expires.
const URL_REFRESH_FRACTION = 0.8;

const avatarUrlKey = (path: string | null) => ["avatar-url", path] as const;

export function useAvatarUrl(avatar: AvatarInfo | undefined): string | null {
  const path = avatar?.path ?? null;
  const ttlMs = (avatar?.url_ttl_seconds ?? 0) * 1000;
  const q = useQuery({
    queryKey: avatarUrlKey(path),
    queryFn: () => unwrap(api.accounts.avatarUrl(avatar!)),
    enabled: !!avatar && !!path,
    staleTime: ttlMs * URL_REFRESH_FRACTION,
    refetchInterval: ttlMs * URL_REFRESH_FRACTION || false,
  });
  return path ? q.data ?? null : null;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Opens the photo library. Returns a square JPEG ready to upload, or null if the member cancelled.
async function pickSquarePhoto(): Promise<ArrayBuffer | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  // allowsEditing does not crop on every platform (e.g. web), so centre-crop here as well.
  const side = Math.min(a.width, a.height);
  const ctx = ImageManipulator.manipulate(a.uri);
  if (side > 0 && a.width !== a.height) {
    ctx.crop({ originX: (a.width - side) / 2, originY: (a.height - side) / 2, width: side, height: side });
  }
  ctx.resize({ width: Math.min(PHOTO_PX, side || PHOTO_PX) });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY, base64: true });
  if (!out.base64) throw new Error("photo encode failed");
  return base64ToArrayBuffer(out.base64);
}

// Change or remove the photo, then refresh the account.
export function useAvatarActions(avatar: AvatarInfo | undefined) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: keys.me });
  const change = useMutation({
    mutationFn: async () => {
      const file = await pickSquarePhoto();
      if (!file || !avatar) return null;
      return unwrap(api.accounts.setAvatar(avatar, file, "image/jpeg"));
    },
    onSuccess: (r) => (r ? done() : undefined),
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.accounts.removeAvatar()),
    onSuccess: done,
  });
  return { change, remove };
}
