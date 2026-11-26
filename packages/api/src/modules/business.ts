// Group companies list (public, F1) and business management (owner).
import type { z } from "zod";
import {
  CreateBusinessInput, DeleteBusinessInput, DeleteBusinessOutput, ListBusinessesOutput, ListManagedBusinessesOutput, UpdateBusinessInput,
  UpdateBusinessOutput, type Json,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function businessModule(ctx: Ctx) {
  return {
    list: () => ctx.rpc("list_businesses", {}, ListBusinessesOutput),

    update: (input: z.input<typeof UpdateBusinessInput>) => withInput(UpdateBusinessInput, input, (v) =>
      ctx.rpc("update_business", { p_business_id: v.businessId, p_patch: v.patch as Json }, UpdateBusinessOutput)),

    // Owner only: every business incl. inactive, add, delete (BUSINESS_IN_USE if it has history).
    listManaged: () => ctx.rpc("list_managed_businesses", {}, ListManagedBusinessesOutput),

    create: (input: z.input<typeof CreateBusinessInput>) => withInput(CreateBusinessInput, input, (v) =>
      ctx.rpc("create_business", { p_business: v as Json }, UpdateBusinessOutput)),

    // Deletes the row, then its files (logo etc.) under "<business_id>/" in the assets bucket.
    // The row is already gone if file cleanup fails, so that is reported as filesLeft, not as an error.
    remove: (input: z.input<typeof DeleteBusinessInput>) => withInput(DeleteBusinessInput, input, async (v) => {
      const r = await ctx.rpc("delete_business", { p_business_id: v.businessId }, DeleteBusinessOutput);
      if (r.error) return r;
      return { data: { filesLeft: await removeFolder(ctx, r.data.asset_bucket, r.data.asset_prefix) } };
    }),
  };
}

// Removes every object under "<prefix>/" (nested folders too). Returns true if anything could not be removed.
async function removeFolder(ctx: Ctx, bucket: string, prefix: string): Promise<boolean> {
  try {
    const store = ctx.supabase.storage.from(bucket);
    const paths: string[] = [];
    const walk = async (dir: string): Promise<boolean> => {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await store.list(dir, { limit: 100, offset });
        if (error) return false;
        for (const item of data) {
          // Folders come back with id null (the type says string); files have an id.
          if ((item.id as string | null) === null) { if (!(await walk(`${dir}/${item.name}`))) return false; }
          else paths.push(`${dir}/${item.name}`);
        }
        if (data.length < 100) return true;
      }
    };
    if (!(await walk(prefix))) return true;
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await store.remove(paths.slice(i, i + 100));
      if (error) return true;
    }
    return false;
  } catch {
    return true;
  }
}
