import rateLimit from "express-rate-limit";

// Coarse, IP-based throttle for the whole API. This is defense in depth
// against scripted abuse/DoS; it is intentionally generous so normal
// office usage (dashboard polling, list screens) never trips it.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عدد كبير من الطلبات، الرجاء المحاولة لاحقاً" },
});

// Tight, IP-based throttle for login specifically. The app already locks
// a given *account* out after 5 bad passwords (see routes/auth.ts), but
// that does nothing against an attacker spraying many different usernames
// from one IP. This closes that gap without touching the per-account logic.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Only count failed attempts so a legitimate user isn't punished for
  // their own successful logins earlier in the window.
  skipSuccessfulRequests: true,
  message: { error: "عدد كبير من محاولات الدخول، الرجاء المحاولة لاحقاً" },
});

// IP-based throttle for other sensitive, low-frequency-by-nature endpoints:
// full data backup downloads/restores and credential changes. A legitimate
// office never needs more than a handful of these in 15 minutes; scripted
// scraping or credential-stuffing against them does.
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عدد كبير من الطلبات الحساسة، الرجاء المحاولة لاحقاً" },
});
