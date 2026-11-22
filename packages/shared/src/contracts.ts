// Re-exports the generated backend contracts (BACKEND_PLAN.md §12). Never edit those files by hand;
// run the backend codegen instead.
export type { Database, Json, Tables, Enums } from "@rewards/backend/contracts/database.types";
export { Constants } from "@rewards/backend/contracts/database.types";
export { ERROR_CODES, type ErrorCode } from "@rewards/backend/contracts/errors";
