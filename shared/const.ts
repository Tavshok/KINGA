export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/**
 * Financial approval threshold: claims with a total amount above this value
 * require executive / manager sign-off before payment is authorised.
 * Value is stored in cents (ZAR 25,000 = 2,500,000 cents).
 * Single source of truth — referenced by executive, claims-manager, and
 * claim-completion routers.
 */
export const FINANCIAL_APPROVAL_THRESHOLD_CENTS = 2_500_000;
