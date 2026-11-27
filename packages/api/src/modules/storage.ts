// Image files (business logos, offer banners) in Supabase Storage (plan §10).
// Bucket names come from app_settings via api.get_storage_buckets. Writes are checked by the
// storage.objects policies (api.storage_can_write): the first path segment must be a business id
// the caller may manage.
import { StorageBuckets, type Result } from "@rewards/shared";
import { fail, fromThrown } from "../result.ts";
import type { Ctx } from "../client.ts";

export function storageModule(ctx: Ctx) {
  return {
    buckets: () => ctx.rpc("get_storage_buckets", {}, StorageBuckets),

    // Uploads (or replaces) one file. Returns the stored path to save on the row (logo_path, banner_path).
    upload: async (bucket: string, path: string, file: Blob): Promise<Result<{ path: string }>> => {
      try {
        const { data, error } = await ctx.supabase.storage.from(bucket)
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        // Storage errors (policy refusal, size or type limit) are not server error codes; the message is kept.
        if (error) return fail("UNKNOWN_ERROR_CODE", error.message);
        return { data: { path: data.path } };
      } catch (e) {
        return fromThrown(e);
      }
    },

    // Public URL for a stored path (the buckets are public-read).
    publicUrl: (bucket: string, path: string): string => ctx.supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl,
  };
}
