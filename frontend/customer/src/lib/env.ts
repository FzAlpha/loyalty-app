// Public build-time config (EXPO_PUBLIC_* only; inlined by Expo at bundle time).
// Never read the service-role key here.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export const env = {
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  defaultDialCode: required("EXPO_PUBLIC_DEFAULT_DIAL_CODE", process.env.EXPO_PUBLIC_DEFAULT_DIAL_CODE),
};
