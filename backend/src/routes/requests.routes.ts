import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. List requests
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { status, search } = req.query;

  try {
    const requestsColl = await dbService.getCollection('requests');
    const query: Record<string, any> = { org_id: orgId };

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { counterparty_name: { $regex: search, $options: 'i' } },
        { request_number: { $regex: search, $options: 'i' } }
      ];
    }

    const list = await requestsColl.find(query).sort({ created_at: -1 }).toArray();
    return res.json({ data: list, requests: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Get requests count badges
router.get('/counts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const requestsColl = await dbService.getCollection('requests');
    const list = await requestsColl.find({ org_id: orgId }).toArray();

    const counts = {
      SUBMITTED: list.filter(r => r.status === 'SUBMITTED').length,
      IN_REVIEW: list.filter(r => r.status === 'IN_REVIEW').length,
      APPROVED: list.filter(r => r.status === 'APPROVED').length,
      REJECTED: list.filter(r => r.status === 'REJECTED').length,
    };

    return res.json({ counts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Create request
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { title, counterpartyName, contractType, priority, description } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Request title is required.' });
  }

  try {
    const requestsColl = await dbService.getCollection('requests');
    const count = await requestsColl.countDocuments({ org_id: orgId });
    const requestNum = `REQ-${(count + 1).toString().padStart(4, '0')}`;

    const newRequest = {
      org_id: orgId,
      request_number: requestNum,
      title,
      counterparty_name: counterpartyName || '',
      contract_type: contractType || 'NDA',
      priority: priority || 'medium',
      description: description || '',
      status: 'SUBMITTED',
      requested_by_id: req.user?.userId || 'system',
      requested_by_name: req.user?.userId || 'System User',
      attachments: [],
      created_at: new Date(),
    };

    const insertRes = await requestsColl.insertOne(newRequest);
    return res.status(201).json({ 
      message: 'Intake request registered successfully.', 
      id: insertRes.insertedId,
      request: { _id: insertRes.insertedId, ...newRequest }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Get Single Request
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const requestsColl = await dbService.getCollection('requests');
    const request = await requestsColl.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    return res.json({ data: request, request });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Update Request
router.patch('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const updates = req.body;

  try {
    const requestsColl = await dbService.getCollection('requests');
    const updateFields: Record<string, any> = {};

    const allowed = ['title', 'counterparty_name', 'contract_type', 'priority', 'description', 'status'];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        updateFields[key] = updates[key];
      }
    }

    updateFields.updated_at = new Date();

    const updateRes = await requestsColl.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      { $set: updateFields }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    return res.json({ message: 'Request updated successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
