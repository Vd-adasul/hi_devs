import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. Get All Review Queue Items
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { status } = req.query; // pending | completed

  try {
    const queueCollection = await dbService.getCollection('reviewQueue');
    const query: any = { org_id: orgId };
    if (status) query.status = status;

    const list = await queueCollection.find(query).sort({ created_at: -1 }).toArray();

    // Populate matter details
    const mattersCollection = await dbService.getCollection('matters');
    const populated = await Promise.all(list.map(async item => {
      const matter = await mattersCollection.findOne({ _id: item.matter_id });
      return {
        ...item,
        matterName: matter ? matter.name : 'Unknown Matter',
      };
    }));

    return res.json({ data: populated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Approve Review Queue Item
router.post('/:id/approve', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { notes } = req.body;

  try {
    const queueCollection = await dbService.getCollection('reviewQueue');
    const updateRes = await queueCollection.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      {
        $set: {
          status: 'completed',
          decision: 'approved',
          decisionNotes: notes || '',
          reviewedAt: new Date(),
          reviewedBy: req.user?.userId || 'system',
        },
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Review item not found.' });
    }

    return res.json({ message: 'Review queue item approved.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Reject Review Queue Item
router.post('/:id/reject', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { notes } = req.body;

  try {
    const queueCollection = await dbService.getCollection('reviewQueue');
    const updateRes = await queueCollection.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      {
        $set: {
          status: 'completed',
          decision: 'rejected',
          decisionNotes: notes || '',
          reviewedAt: new Date(),
          reviewedBy: req.user?.userId || 'system',
        },
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Review item not found.' });
    }

    return res.json({ message: 'Review queue item rejected.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Request Revision / Send Feedback on Review Queue Item
router.post('/:id/revise', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { feedback } = req.body;

  if (!feedback) {
    return res.status(400).json({ error: 'Revision feedback comment is required.' });
  }

  try {
    const queueCollection = await dbService.getCollection('reviewQueue');
    const updateRes = await queueCollection.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      {
        $set: {
          status: 'revision_requested',
          feedback,
          reviewedAt: new Date(),
          reviewedBy: req.user?.userId || 'system',
        },
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Review item not found.' });
    }

    return res.json({ message: 'Revision feedback logged successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
