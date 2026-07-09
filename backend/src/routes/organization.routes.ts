import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
const dbService = DbService.getInstance();

// 1. Get current organization
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const orgsColl = await dbService.getCollection('organizations');
    let org = await orgsColl.findOne({ org_id: orgId });

    if (!org) {
      // Seed default organization if missing
      org = {
        org_id: orgId,
        name: 'Default Firm',
        slug: 'default-firm',
        subscriptionTier: 'free',
        logoUrl: '',
        brandColor: '#6366f1',
        settings: {
          onboardingCompleted: true
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await orgsColl.insertOne(org);
    }

    return res.json({
      id: org.org_id,
      name: org.name,
      slug: org.slug,
      subscriptionTier: org.subscriptionTier,
      logoUrl: org.logoUrl || '',
      brandColor: org.brandColor || '#6366f1',
      settings: org.settings || { onboardingCompleted: true },
      createdAt: org.createdAt,
      updatedAt: org.updatedAt
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Update organization details
router.patch('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { name, logoUrl, brandColor, settings } = req.body;

  try {
    const orgsColl = await dbService.getCollection('organizations');
    const updateFields: Record<string, any> = { updatedAt: new Date() };

    if (name) updateFields.name = name;
    if (logoUrl !== undefined) updateFields.logoUrl = logoUrl;
    if (brandColor !== undefined) updateFields.brandColor = brandColor;
    if (settings) updateFields.settings = settings;

    await orgsColl.updateOne(
      { org_id: orgId },
      { $set: updateFields },
      { upsert: true }
    );

    return res.json({ message: 'Organization settings updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Install industry pack (stubs)
router.post('/install-pack', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  return res.json({ message: 'Industry pack installed successfully.' });
});

export default router;
