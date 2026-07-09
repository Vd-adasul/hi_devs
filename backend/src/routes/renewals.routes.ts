import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. Get Renewals List
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { status, lookaheadDays } = req.query;

  try {
    const documentsColl = await dbService.getCollection('documents');
    const lookahead = Number(lookaheadDays || 365);
    const limitDate = new Date(Date.now() + lookahead * 24 * 60 * 60 * 1000);

    const query: Record<string, any> = {
      org_id: orgId,
      expiry_date: { $exists: true, $ne: null }
    };

    // Find all executed contracts expiring soon
    const contracts = await documentsColl.find(query).toArray();

    // Map contracts to renewals shape
    const renewals = contracts.map(c => ({
      id: c._id.toString(),
      title: c.name,
      type: c.type || 'contract',
      counterpartyName: c.counterparty_name || 'N/A',
      expiryDate: c.expiry_date,
      effectiveDate: c.effective_date || null,
      value: c.contract_value || 0,
      currency: c.currency || 'USD',
      ownerId: c.owner_id || 'system',
      ownerName: c.owner_name || 'Legal Team',
      renewalDecision: c.renewal_decision || 'unknown', // renew | renegotiate | let_expire | pause | unknown
      renewalDecisionAt: c.renewal_decision_at || null,
      renewalAdvice: c.renewal_advice || {
        recommendation: 'renew',
        confidence: 'medium',
        rationale: 'Standard commercial lease contract. Auto-renew recommended to maintain operations.'
      }
    }));

    return res.json({ data: renewals, renewals });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Get Renewals Stats
router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const documentsColl = await dbService.getCollection('documents');
    const contracts = await documentsColl.find({ org_id: orgId, expiry_date: { $exists: true, $ne: null } }).toArray();

    const now = Date.now();
    const next30 = now + 30 * 24 * 60 * 60 * 1000;
    const next60 = now + 60 * 24 * 60 * 60 * 1000;
    const next90 = now + 90 * 24 * 60 * 60 * 1000;

    const stats = {
      thisMonth: contracts.filter(c => {
        const exp = new Date(c.expiry_date).getTime();
        return exp >= now && exp <= next30;
      }).length,
      next30Days: contracts.filter(c => {
        const exp = new Date(c.expiry_date).getTime();
        return exp > next30 && exp <= next60;
      }).length,
      next60Days: contracts.filter(c => {
        const exp = new Date(c.expiry_date).getTime();
        return exp > next60 && exp <= next90;
      }).length,
      next90Days: contracts.filter(c => {
        const exp = new Date(c.expiry_date).getTime();
        return exp > next90;
      }).length,
      noDecision: contracts.filter(c => !c.renewal_decision || c.renewal_decision === 'unknown').length
    };

    return res.json({ stats });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Make Renewal Decision
router.patch('/:id/decision', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { decision } = req.body;

  if (!['renew', 'renegotiate', 'let_expire', 'pause', 'unknown'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid renewal decision.' });
  }

  try {
    const documentsColl = await dbService.getCollection('documents');
    const updateRes = await documentsColl.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      { 
        $set: { 
          renewal_decision: decision,
          renewal_decision_at: new Date()
        } 
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Contract not found.' });
    }

    return res.json({ message: 'Renewal decision recorded successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
