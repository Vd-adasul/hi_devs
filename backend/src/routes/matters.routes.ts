import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. Create a Matter
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { name, client_name } = req.body;
  const orgId = req.user?.orgId || 'org_default_firm';

  if (!name || !client_name) {
    return res.status(400).json({ error: 'Name and client_name are required' });
  }

  try {
    const mattersCollection = await dbService.getCollection('matters');
    
    const newMatter = {
      org_id: orgId,
      name,
      client_name,
      status: 'active' as const,
      created_at: new Date(),
    };

    const result = await mattersCollection.insertOne(newMatter);

    return res.status(201).json({
      message: 'Matter created successfully',
      matterId: result.insertedId.toString(),
      matter: { _id: result.insertedId, ...newMatter },
    });
  } catch (error: any) {
    console.error('Error creating matter:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. List all Matters
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const mattersCollection = await dbService.getCollection('matters');
    const matters = await mattersCollection.find({ org_id: orgId }).sort({ created_at: -1 }).toArray();
    return res.json({ matters, data: matters });
  } catch (error: any) {
    console.error('Error fetching matters:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 3. Get single Matter state
router.get('/:matterId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const mattersCollection = await dbService.getCollection('matters');
    const matter = await mattersCollection.findOne({
      _id: new ObjectId(matterId),
      org_id: orgId,
    });

    if (!matter) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    return res.json({ matter });
  } catch (error: any) {
    console.error('Error fetching single matter:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 4. Get all clauses in a Matter
router.get('/:matterId/clauses', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const clausesCollection = await dbService.getCollection('clauses');
    const clauses = await clausesCollection.find({
      matter_id: new ObjectId(matterId),
      org_id: orgId,
    }).toArray();

    return res.json({ clauses });
  } catch (error: any) {
    console.error('Error fetching clauses:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 5. Get all obligations in a Matter
router.get('/:matterId/obligations', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const obligationsCollection = await dbService.getCollection('obligations');
    const obligations = await obligationsCollection.find({
      matter_id: new ObjectId(matterId),
      org_id: orgId,
    }).toArray();

    return res.json({ obligations });
  } catch (error: any) {
    console.error('Error fetching obligations:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 6. Get all risks in a Matter
router.get('/:matterId/risks', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const risksCollection = await dbService.getCollection('risks');
    const risks = await risksCollection.find({
      matter_id: new ObjectId(matterId),
      org_id: orgId,
    }).toArray();

    return res.json({ risks });
  } catch (error: any) {
    console.error('Error fetching risks:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
