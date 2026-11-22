// app_settings changes (owner). Keys and value checks are enforced by the server.
import type { z } from "zod";
import { SetSettingInput, SetSettingOutput } from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function settingsModule(ctx: Ctx) {
  return {
    set: (input: z.input<typeof SetSettingInput>) => withInput(SetSettingInput, input, (v) =>
      ctx.rpc("set_setting", { p_key: v.key, p_value: v.value, p_business_id: v.businessId }, SetSettingOutput)),
  };
}
