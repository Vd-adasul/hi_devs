import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. Get LLM Keys
router.get('/llm-keys', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const org = await orgsCollection.findOne({ orgId });
    return res.json({ data: org?.orgApiKeys || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Add LLM Key (BYOK)
router.post('/llm-keys', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { provider, key, model } = req.body;

  if (!provider || !key || !model) {
    return res.status(400).json({ error: 'provider, key, and model are required.' });
  }

  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const keyId = new ObjectId().toString();
    const newKey = {
      id: keyId,
      provider,
      key: key.substring(0, 4) + '*'.repeat(16) + key.substring(key.length - 4), // mask key in response
      rawKey: key, // actual key
      model,
      created_at: new Date(),
    };

    await orgsCollection.updateOne(
      { orgId },
      { $push: { orgApiKeys: newKey } }
    );

    return res.status(201).json({ message: 'LLM Key registered successfully.', data: newKey });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Remove LLM Key
router.delete('/llm-keys/:id', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { id } = req.params;

  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const updateRes = await orgsCollection.updateOne(
      { orgId },
      { $pull: { orgApiKeys: { id } } }
    );

    if (updateRes.modifiedCount === 0) {
      return res.status(404).json({ error: 'LLM Key not found.' });
    }

    return res.json({ message: 'LLM Key deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Get Task-Model Config
router.get('/model-config', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const org = await orgsCollection.findOne({ orgId });

    const defaultConfig = {
      documentProcessing: 'google/gemini-2.5-flash',
      qa: 'google/gemini-2.5-flash',
      risk: 'google/gemini-2.5-flash',
      negotiation: 'google/gemini-2.5-flash',
      research: 'google/gemini-2.5-flash',
      draft: 'google/gemini-2.5-flash',
    };

    return res.json({ data: org?.modelConfig || defaultConfig });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Update Task-Model Config
router.patch('/model-config', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { config } = req.body; // config = { qa: 'google/gemini-2.5-flash', etc }

  if (!config) {
    return res.status(400).json({ error: 'config object is required.' });
  }

  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    await orgsCollection.updateOne(
      { orgId },
      { $set: { modelConfig: config } }
    );

    return res.json({ message: 'Model configuration updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 6. List Team Members
router.get('/team', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    const usersCollection = await dbService.getCollection('users');
    const list = await usersCollection
      .find({ org_id: orgId })
      .project({ password: 0 })
      .toArray();

    return res.json({ data: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 7. Get Billing / Subscription Tier Info
router.get('/billing', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const org = await orgsCollection.findOne({ orgId });

    return res.json({
      data: {
        tier: org?.tier || 'free',
        limits: org?.tier === 'enterprise'
          ? { contracts: -1, diligenceRooms: -1, apiCalls: -1 }
          : org?.tier === 'pro'
          ? { contracts: 100, diligenceRooms: 10, apiCalls: 5000 }
          : { contracts: 5, diligenceRooms: 1, apiCalls: 100 },
        usage: {
          contracts: 2,
          diligenceRooms: 0,
          apiCalls: 45,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 8. Field Definitions — custom contract fields (used by SettingsPage)
router.get('/field-definitions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { contractType } = req.query;
  try {
    const coll = await dbService.getCollection('field_definitions');
    const filter: any = { org_id: orgId };
    if (contractType) filter.contractType = contractType;
    const docs = await coll.find(filter).toArray();
    return res.json({ data: docs });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/field-definitions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { fieldKey, label, contractType, fieldType, required, defaultValue, options } = req.body;
  if (!fieldKey || !label) {
    return res.status(400).json({ error: 'fieldKey and label are required.' });
  }
  try {
    const coll = await dbService.getCollection('field_definitions');
    const newDef = {
      org_id: orgId, fieldKey, label, contractType: contractType || null,
      fieldType: fieldType || 'text', required: required ?? false,
      defaultValue: defaultValue ?? null, options: options ?? [],
      created_at: new Date(),
    };
    const result = await coll.insertOne(newDef);
    return res.status(201).json({ data: { ...newDef, _id: result.insertedId } });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/field-definitions/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { id } = req.params;
  try {
    const { ObjectId } = await import('mongodb');
    const coll = await dbService.getCollection('field_definitions');
    await coll.deleteOne({ _id: new ObjectId(id), org_id: orgId });
    return res.json({ message: 'Field definition deleted.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
