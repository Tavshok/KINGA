export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  /**
   * System Acceptance Testing mode.
   * When true: all email sends are suppressed (logged only), subjects prefixed
   * with "[TEST MODE]", and background retry loops are disabled.
   */
  systemTestMode: process.env.SYSTEM_TEST_MODE === "true",
  /** Dev/staging email redirect — all outbound emails go here instead of real recipients. */
  devEmailOverride: process.env.DEV_EMAIL_OVERRIDE ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
