// Staff accounts through the staff-admin Edge Function (owner).
import type { z } from "zod";
import {
  CreateStaffInput, ReassignStaffInput, ResetStaffPasswordInput, StaffAdminOutput, StaffUserInput,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";

export function staffModule(ctx: Ctx) {
  return {
    create: (input: z.input<typeof CreateStaffInput>) => withInput(CreateStaffInput, input, (v) =>
      ctx.fn("staff-admin", {
        action: "create", phone: v.phone, temp_password: v.tempPassword, display_name: v.displayName, role: v.role,
        business_id: v.businessId,
      }, StaffAdminOutput)),

    reassign: (input: z.input<typeof ReassignStaffInput>) => withInput(ReassignStaffInput, input, (v) =>
      ctx.fn("staff-admin", {
        action: "reassign", user_id: v.userId, role: v.role, business_id: v.businessId, display_name: v.displayName,
      }, StaffAdminOutput)),

    enable: (input: z.input<typeof StaffUserInput>) => withInput(StaffUserInput, input, (v) =>
      ctx.fn("staff-admin", { action: "enable", user_id: v.userId }, StaffAdminOutput)),

    disable: (input: z.input<typeof StaffUserInput>) => withInput(StaffUserInput, input, (v) =>
      ctx.fn("staff-admin", { action: "disable", user_id: v.userId }, StaffAdminOutput)),

    resetPassword: (input: z.input<typeof ResetStaffPasswordInput>) => withInput(ResetStaffPasswordInput, input, (v) =>
      ctx.fn("staff-admin", { action: "reset_password", user_id: v.userId, temp_password: v.tempPassword },
        StaffAdminOutput)),
  };
}
