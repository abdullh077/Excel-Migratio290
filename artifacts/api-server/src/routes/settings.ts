import { Router } from "express";
import { db, officeSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";
import { UpdateOfficeSettingsBody } from "@workspace/api-zod";

const router = Router();

// Only these three fields ever carry uploaded images (as base64 data URLs).
const IMAGE_FIELDS = ["officeLogo", "stampImage", "signatureImage"] as const;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // matches the client-side cap in office.tsx
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/;

/**
 * Server-side validation for the office logo/stamp/signature uploads. The
 * client already checks size and file type via the picker, but a browser
 * check is not a security control — validate independently here so a
 * crafted request can't smuggle an oversized payload or a non-image
 * (e.g. an SVG with an embedded script, or an arbitrary MIME type) into the
 * database. Returns an error message, or null if every provided field is OK.
 */
function validateImageFields(body: Record<string, unknown>): string | null {
  for (const field of IMAGE_FIELDS) {
    const value = body[field];
    if (value == null || value === "") continue; // unset/cleared is fine
    if (typeof value !== "string") return `${field}: invalid value`;
    const match = DATA_URL_RE.exec(value);
    if (!match) return `${field}: يجب أن تكون صورة بصيغة PNG أو JPEG أو WEBP`;
    // Base64 -> byte length without a full decode.
    const base64 = match[2];
    const byteLength = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
    if (byteLength > MAX_IMAGE_BYTES) return `${field}: حجم الصورة كبير جداً (الحد الأقصى 1.5 ميغابايت)`;
  }
  return null;
}

// Everything below requires an authenticated office session.
// NOTE: the old public pre-login branding endpoint was removed — it leaked the
// most-recently-updated office's logo to anyone before login.
router.use("/settings", requireOffice);

// NOTE: the office-logo branding feature was removed entirely — the login
// screen now uses a fixed OBOOR image, and the logo upload was error-prone.

router.get("/settings/office", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const [row] = await db.select().from(officeSettingsTable).where(eq(officeSettingsTable.userId, officeId));

  if (!row) {
    // Return defaults if no settings yet
    res.json({
      officeName: null, officePhone: null, officePhone2: null, officeAddress: null,
      officeLogo: null, stampImage: null, signatureImage: null,
      whatsappUmrahTemplate: null, whatsappOtherTemplate: null, configured: false,
    });
    return;
  }

  res.json({
    officeName: row.officeName,
    officePhone: row.officePhone,
    officePhone2: row.officePhone2,
    officeAddress: row.officeAddress,
    officeLogo: row.officeLogo,
    stampImage: row.stampImage,
    signatureImage: row.signatureImage,
    whatsappUmrahTemplate: row.whatsappUmrahTemplate,
    whatsappOtherTemplate: row.whatsappOtherTemplate,
    configured: row.configured,
  });
});

router.put("/settings/office", async (req, res): Promise<void> => {
  const officeId = req.session.officeId!;
  const parsed = UpdateOfficeSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const imageError = validateImageFields(parsed.data);
  if (imageError) { res.status(400).json({ error: imageError }); return; }

  const [row] = await db
    .insert(officeSettingsTable)
    .values({ userId: officeId, ...parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: officeSettingsTable.userId,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning();

  res.json({
    officeName: row.officeName, officePhone: row.officePhone, officePhone2: row.officePhone2,
    officeAddress: row.officeAddress, officeLogo: row.officeLogo, stampImage: row.stampImage,
    signatureImage: row.signatureImage, whatsappUmrahTemplate: row.whatsappUmrahTemplate,
    whatsappOtherTemplate: row.whatsappOtherTemplate, configured: row.configured,
  });
});

export default router;
