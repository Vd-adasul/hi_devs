import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. List Counterparties
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const cpCollection = await dbService.getCollection('counterparties');
    const list = await cpCollection.find({ org_id: orgId }).toArray();
    return res.json({ data: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Create Counterparty
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { name, domain, contacts, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Counterparty name is required.' });
  }

  try {
    const cpCollection = await dbService.getCollection('counterparties');
    const newCp = {
      org_id: orgId,
      name,
      domain: domain || '',
      contacts: contacts || [],
      pastDeals: [],
      riskScore: 50, // default neutral
      notes: notes || '',
      memoryText: 'No negotiation preference recorded yet.',
      created_at: new Date(),
    };

    const insertRes = await cpCollection.insertOne(newCp);
    return res.status(201).json({ message: 'Counterparty created successfully.', id: insertRes.insertedId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Get Counterparty Details (including AI preferences memory)
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const cpCollection = await dbService.getCollection('counterparties');
    const item = await cpCollection.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!item) {
      return res.status(404).json({ error: 'Counterparty not found.' });
    }

    return res.json({ data: item });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Update Counterparty Profile
router.patch('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { name, domain, contacts, notes, riskScore, memoryText } = req.body;

  try {
    const cpCollection = await dbService.getCollection('counterparties');
    const updateRes = await cpCollection.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      {
        $set: {
          ...(name && { name }),
          ...(domain !== undefined && { domain }),
          ...(contacts !== undefined && { contacts }),
          ...(notes !== undefined && { notes }),
          ...(riskScore !== undefined && { riskScore: Number(riskScore) }),
          ...(memoryText !== undefined && { memoryText }),
          updated_at: new Date(),
        },
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Counterparty not found.' });
    }

    return res.json({ message: 'Counterparty updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
