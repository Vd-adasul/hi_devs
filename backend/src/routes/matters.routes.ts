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
  const { status } = req.query;

  try {
    const mattersCollection = await dbService.getCollection('matters');
    const docsCollection = await dbService.getCollection('documents');
    const requestsCollection = await dbService.getCollection('requests');

    const filter: any = { org_id: orgId };
    if (status && status !== 'all') {
      filter.status = String(status).toLowerCase();
    }

    const matters = await mattersCollection.find(filter).sort({ created_at: -1 }).toArray();
    
    const mappedMatters = await Promise.all(matters.map(async (m: any) => {
      const contractCount = await docsCollection.countDocuments({ matter_id: m._id });
      const requestCount = await requestsCollection.countDocuments({ matter_id: m._id });
      
      return {
        id: m._id.toString(),
        name: m.name,
        description: m.description || null,
        status: m.status === 'archived' ? 'ARCHIVED' : (m.status === 'closed' || m.status === 'CLOSED' ? 'CLOSED' : 'OPEN'),
        counterpartyName: m.client_name || null,
        ownerName: 'Admin',
        tags: m.tags || [],
        contractCount,
        requestCount,
        threadCount: 0,
        createdAt: (m.created_at || new Date()).toISOString(),
        updatedAt: (m.updated_at || m.created_at || new Date()).toISOString(),
        closedAt: m.closed_at ? m.closed_at.toISOString() : null,
      };
    }));

    return res.json({ items: mappedMatters, total: mappedMatters.length, matters: mappedMatters, data: mappedMatters });
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
    const docsCollection = await dbService.getCollection('documents');
    const requestsCollection = await dbService.getCollection('requests');

    const m = await mattersCollection.findOne({
      _id: new ObjectId(matterId),
      org_id: orgId,
    });

    if (!m) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    const contracts = await docsCollection.find({ matter_id: m._id }).toArray();
    const mappedContracts = contracts.map((c: any) => ({
      id: c._id.toString(),
      title: c.name,
      type: c.type || 'OTHER',
      status: c.status === 'completed' ? 'EXECUTED' : 'DRAFT',
      value: c.contract_value || c.value || null,
      currency: c.currency || 'USD',
      riskScore: c.riskScore || null,
      counterpartyName: c.counterparty_name || null,
      effectiveDate: c.effective_date ? new Date(c.effective_date).toISOString() : null,
      expiryDate: c.expiry_date ? new Date(c.expiry_date).toISOString() : null,
      updatedAt: (c.updated_at || c.created_at || new Date()).toISOString(),
    }));

    const requests = await requestsCollection.find({ matter_id: m._id }).toArray();
    const mappedRequests = requests.map((r: any) => ({
      id: r._id.toString(),
      requestNumber: r.requestNumber || null,
      title: r.title,
      type: r.type || 'OTHER',
      status: r.status || 'PENDING',
      priority: r.priority || 'MEDIUM',
      counterpartyName: r.counterparty_name || null,
      createdAt: (r.created_at || new Date()).toISOString(),
    }));

    const responseData = {
      id: m._id.toString(),
      name: m.name,
      description: m.description || null,
      status: m.status === 'archived' ? 'ARCHIVED' : (m.status === 'closed' || m.status === 'CLOSED' ? 'CLOSED' : 'OPEN'),
      counterpartyId: null,
      counterpartyName: m.client_name || null,
      owner: { id: 'admin', name: 'Admin', email: 'admin@firm.com', avatarUrl: null },
      counterparty: null,
      tags: m.tags || [],
      contracts: mappedContracts,
      requests: mappedRequests,
      threads: [],
      livingState: m.livingState || { mergedClauses: [], supersededClauses: [], lastMergedAt: null },
      conflicts: m.conflicts || [],
      createdAt: (m.created_at || new Date()).toISOString(),
      updatedAt: (m.updated_at || m.created_at || new Date()).toISOString(),
      closedAt: m.closed_at ? m.closed_at.toISOString() : null,
      // Backwards compatibility wrapper
      matter: m,
    };

    return res.json(responseData);
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
