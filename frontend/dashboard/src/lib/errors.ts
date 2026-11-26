// Error code -> user message. Dashboard wording first, then the server catalogue description.
import { ERROR_CODES, type ApiError } from "@rewards/shared";
import { strings } from "./strings";

export function errorMessage(error: ApiError | undefined | null): string {
  if (!error) return strings.errors.generic;
  const own = strings.errors.byCode[error.code];
  if (own) return own;
  const server = (ERROR_CODES as Record<string, { description: string } | undefined>)[error.code];
  return server?.description ?? strings.errors.generic;
}

export const isAccessLost = (error: ApiError | null | undefined) =>
  error?.code === "UNAUTHENTICATED" || error?.code === "FORBIDDEN";
