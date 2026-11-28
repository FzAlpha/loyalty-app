// Customer account: profile view (F1), profile photo (plan §10) and self-service deletion (plan §17.5, spec §12 #10).
import { MyAccountOutput, RequestAccountDeletionOutput, SetAvatarOutput, type AvatarInfo, type Result } from "@rewards/shared";
import { fail, fromThrown } from "../result.ts";
import type { Ctx } from "../client.ts";

// File extensions the avatar storage policy accepts, by MIME type.
const AVATAR_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function accountsModule(ctx: Ctx) {
  // Best effort: a file left behind is removed with the account's folder on deletion (jobs-runner).
  const removeOld = async (bucket: string, path: string | null) => {
    if (!path) return;
    try { await ctx.supabase.storage.from(bucket).remove([path]); } catch { /* ignored */ }
  };

  return {
    me: () => ctx.rpc("get_my_account", {}, MyAccountOutput),

    // Uploads a new photo into the caller's own folder, records it, then removes the previous file.
    // `avatar` is the summary from me() (bucket and size limit come from app_settings).
    setAvatar: async (avatar: AvatarInfo, file: ArrayBuffer | Blob, contentType: string): Promise<Result<AvatarInfo>> => {
      const ext = AVATAR_EXT[contentType];
      if (!ext) return fail("VALIDATION_FAILED", "contentType");
      const size = file instanceof Blob ? file.size : file.byteLength;
      if (size > avatar.max_bytes) return fail("VALIDATION_FAILED", "file too large");
      try {
        const { data: s } = await ctx.supabase.auth.getSession();
        const uid = s.session?.user.id;
        if (!uid) return fail("UNAUTHENTICATED");
        const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}.${ext}`;
        const path = `${uid}/${name}`;
        const up = await ctx.supabase.storage.from(avatar.bucket).upload(path, file, { contentType, upsert: false });
        // Storage errors (policy refusal, size or type limit) are not server error codes; the message is kept.
        if (up.error) return fail("UNKNOWN_ERROR_CODE", up.error.message);
        const r = await ctx.rpc("set_my_avatar", { p_path: path }, SetAvatarOutput);
        if (r.error) { await removeOld(avatar.bucket, path); return r; }
        await removeOld(avatar.bucket, r.data.previous_path);
        return { data: r.data.avatar };
      } catch (e) {
        return fromThrown(e);
      }
    },

    removeAvatar: async (): Promise<Result<AvatarInfo>> => {
      const r = await ctx.rpc("clear_my_avatar", {}, SetAvatarOutput);
      if (r.error) return r;
      await removeOld(r.data.avatar.bucket, r.data.previous_path);
      return { data: r.data.avatar };
    },

    // Short-lived URL for showing the photo (the bucket is private). null when there is no photo.
    avatarUrl: async (avatar: AvatarInfo): Promise<Result<string | null>> => {
      if (!avatar.path) return { data: null };
      try {
        const { data, error } = await ctx.supabase.storage.from(avatar.bucket).createSignedUrl(avatar.path, avatar.url_ttl_seconds);
        if (error) return fail("UNKNOWN_ERROR_CODE", error.message);
        return { data: data.signedUrl };
      } catch (e) {
        return fromThrown(e);
      }
    },

    requestDeletion: () => ctx.fn("account-deletion", {}, RequestAccountDeletionOutput),
  };
}
