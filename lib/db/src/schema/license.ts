import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

// Singleton row (id = 1). Holds the offline-enforced license/trial state.
// The annual license is ACTIVATION-BASED: the countdown starts when the key is
// activated (license_expires_at = activated_at + N days), not a fixed calendar date.
export const licenseTable = pgTable("license", {
  id: integer("id").primaryKey(), // always 1
  trialStartedAt: timestamp("trial_started_at"),
  licenseKey: text("license_key"),
  activatedAt: timestamp("activated_at"),
  licenseExpiresAt: timestamp("license_expires_at"),
  lastSeenAt: timestamp("last_seen_at"), // monotonic watermark for clock-rollback detection
  trialDataPurgedAt: timestamp("trial_data_purged_at"), // set once the trial data is wiped after an unactivated trial expires
});

export type License = typeof licenseTable.$inferSelect;
