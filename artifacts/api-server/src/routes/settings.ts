import { Router } from "express";
import { db, officeSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";
import { UpdateOfficeSettingsBody } from "@workspace/api-zod";

const router = Router();

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
