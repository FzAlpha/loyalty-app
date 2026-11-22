// Result envelope shared by every packages/api function: { data } | { error: { code } } (plan §12).
import { ERROR_CODES, type ErrorCode } from "./contracts.ts";

// Client-side only. These never come from the server and are not in public.error_codes:
// NETWORK_ERROR: the request did not reach the server or no response came back.
// INVALID_RESPONSE: the server answered with a shape this client does not expect (contract drift).
export const CLIENT_ERROR_CODES = ["NETWORK_ERROR", "INVALID_RESPONSE"] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type ApiErrorCode = ErrorCode | ClientErrorCode;
export type ApiError = { code: ApiErrorCode; detail?: string };
export type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: ApiError };

export function isServerErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ERROR_CODES, value);
}

export function isClientErrorCode(value: unknown): value is ClientErrorCode {
  return typeof value === "string" && (CLIENT_ERROR_CODES as readonly string[]).includes(value);
}
