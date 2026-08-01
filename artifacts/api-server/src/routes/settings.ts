import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { db, officeSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireOffice } from "../lib/auth.js";
import { UpdateOfficeSettingsBody } from "@workspace/api-zod";

const router = Router();

// PUBLIC — used on the login page before any session exists.
// Mounted separately in routes/index.ts BEFORE any auth-guarded routers.
export const publicSettingsRouter = Router();

// Returns the branding (office name + logo) of the most recently updated office.
publicSettingsRouter.get("/settings/branding", async (_req, res): Promise<void> => {
  const [row] = await db
    .select({ officeName: officeSettingsTable.officeName, officeLogo: officeSettingsTable.officeLogo })
    .from(officeSettingsTable)
    .orderBy(desc(officeSettingsTable.updatedAt))
    .limit(1);

  res.json({ officeName: row?.officeName ?? "", officeLogo: row?.officeLogo ?? "" });
});

// Everything below requires an authenticated office session.
router.use("/settings", requireOffice);

const BrandingBody = z.object({
  officeLogo: z.string().nullish(),
});

async function saveBranding(req: Request, res: Response): Promise<void> {
  const officeId = req.session.officeId!;
  const parsed = BrandingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db
    .insert(officeSettingsTable)
    .values({ userId: officeId, officeLogo: parsed.data.officeLogo ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: officeSettingsTable.userId,
      set: { officeLogo: parsed.data.officeLogo ?? null, updatedAt: new Date() },
    })
    .returning();

  res.json({ officeName: row.officeName ?? "", officeLogo: row.officeLogo ?? "" });
}

router.post("/settings/branding", saveBranding);
router.put("/settings/branding", saveBranding);

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
