import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. Register a Webhook URL
router.post('/', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { url, events } = req.body; // events = ['document.processed', etc]

  if (!url || !events || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'url and non-empty events array are required.' });
  }

  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');
    const webhookId = new ObjectId().toString();

    const newWebhook = {
      id: webhookId,
      url,
      events,
      secret,
      active: true,
      created_at: new Date(),
    };

    await orgsCollection.updateOne(
      { orgId },
      { $push: { webhooks: newWebhook } }
    );

    return res.status(201).json({ message: 'Webhook registered successfully.', data: newWebhook });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. List Webhooks
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const org = await orgsCollection.findOne({ orgId });
    return res.json({ data: org?.webhooks || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Delete Webhook
router.delete('/:id', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { id } = req.params;

  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const updateRes = await orgsCollection.updateOne(
      { orgId },
      { $pull: { webhooks: { id } } }
    );

    if (updateRes.modifiedCount === 0) {
      return res.status(404).json({ error: 'Webhook not found.' });
    }

    return res.json({ message: 'Webhook deleted successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Generate Developer API Key
router.post('/api-keys', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Key name is required.' });
  }

  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const rawKey = 'los_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyId = new ObjectId().toString();

    const newKeyRecord = {
      id: keyId,
      name,
      prefix: rawKey.substring(0, 8),
      hash: keyHash,
      created_at: new Date(),
    };

    await orgsCollection.updateOne(
      { orgId },
      { $push: { developerApiKeys: newKeyRecord } }
    );

    // Return the actual rawKey once (will never show raw again)
    return res.status(201).json({
      message: 'Developer API key generated successfully. Copy this key as it will not be displayed again.',
      data: {
        id: keyId,
        name,
        apiKey: rawKey,
        created_at: newKeyRecord.created_at,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. List Developer API Keys (Masked)
router.get('/api-keys', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const org = await orgsCollection.findOne({ orgId });
    const keys = (org?.developerApiKeys || []).map((k: any) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      created_at: k.created_at,
    }));
    return res.json({ data: keys });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 6. Delete Developer API Key
router.delete('/api-keys/:id', authMiddleware, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { id } = req.params;

  try {
    const orgsCollection = await dbService.getCollection('organizations') as any;
    const updateRes = await orgsCollection.updateOne(
      { orgId },
      { $pull: { developerApiKeys: { id } } }
    );

    if (updateRes.modifiedCount === 0) {
      return res.status(404).json({ error: 'API key not found.' });
    }

    return res.json({ message: 'Developer API key deleted.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
