import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. List Invoices
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { status } = req.query;

  try {
    const invoicesColl = await dbService.getCollection('invoices');
    const query: Record<string, any> = { org_id: orgId };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    const list = await invoicesColl.find(query).sort({ invoice_date: -1 }).toArray();
    return res.json({ data: list, invoices: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Get Invoice Stats
router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const invoicesColl = await dbService.getCollection('invoices');
    const invoices = await invoicesColl.find({ org_id: orgId }).toArray();

    const stats = {
      totalCount: invoices.length,
      pendingCount: invoices.filter(i => i.status === 'PENDING').length,
      reconciledCount: invoices.filter(i => i.status === 'RECONCILED').length,
      disputedCount: invoices.filter(i => i.status === 'DISPUTED').length,
      totalAmount: invoices.reduce((acc, curr) => acc + (curr.amount || 0), 0)
    };

    return res.json({ stats });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Create Invoice + Auto-match
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { vendorName, invoiceNumber, amount, currency, invoiceDate, dueDate, description, contractId } = req.body;

  if (!vendorName || !amount) {
    return res.status(400).json({ error: 'Vendor name and amount are required.' });
  }

  try {
    const invoicesColl = await dbService.getCollection('invoices');
    
    // Auto-match logic: find obligations for this org and try to find a matching one
    const obligationsColl = await dbService.getCollection('obligations');
    const openObligations = await obligationsColl.find({ org_id: orgId, status: 'pending' }).toArray();

    let matchedObligation = null;
    let matchScore = 0;
    let matchReason = 'No match found';

    // Simple heuristic matcher
    for (const ob of openObligations) {
      if (Math.abs(ob.amount - amount) < 1.0 && ob.currency === currency) {
        matchedObligation = ob;
        matchScore = 0.95;
        matchReason = 'Amount and currency matched perfectly.';
        break;
      }
    }

    const newInvoice = {
      org_id: orgId,
      vendor_name: vendorName,
      invoice_number: invoiceNumber || '',
      amount: Number(amount),
      currency: currency || 'USD',
      invoice_date: new Date(invoiceDate),
      due_date: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      description: description || '',
      status: matchedObligation ? 'MATCHED' : 'PENDING',
      contract_id: contractId ? new ObjectId(contractId) : (matchedObligation ? matchedObligation.contract_id : null),
      matched_obligation_id: matchedObligation ? matchedObligation._id : null,
      match_score: matchScore,
      match_reason: matchReason,
      created_at: new Date(),
    };

    const insertRes = await invoicesColl.insertOne(newInvoice);
    return res.status(201).json({ 
      message: 'Invoice registered successfully.', 
      id: insertRes.insertedId,
      invoice: { _id: insertRes.insertedId, ...newInvoice }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Get Single Invoice
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const invoicesColl = await dbService.getCollection('invoices');
    const invoice = await invoicesColl.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    return res.json({ data: invoice, invoice });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Confirm Match (Reconcile)
router.post('/:id/reconcile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const invoicesColl = await dbService.getCollection('invoices');
    const invoice = await invoicesColl.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    // Update invoice status to RECONCILED
    await invoicesColl.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'RECONCILED' } }
    );

    // If there is a matched obligation, close it (mark as completed)
    if (invoice.matched_obligation_id) {
      const obligationsColl = await dbService.getCollection('obligations');
      await obligationsColl.updateOne(
        { _id: new ObjectId(invoice.matched_obligation_id) },
        { $set: { status: 'completed', completed_at: new Date() } }
      );
    }

    return res.json({ message: 'Invoice reconciled successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 6. Dispute Match
router.post('/:id/dispute', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { reason } = req.body;

  try {
    const invoicesColl = await dbService.getCollection('invoices');
    const updateRes = await invoicesColl.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      { 
        $set: { 
          status: 'DISPUTED',
          match_reason: reason || 'Flagged mismatch by user.'
        } 
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    return res.json({ message: 'Invoice match flagged as disputed.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 7. Rematch Invoice
router.post('/:id/rematch', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const invoicesColl = await dbService.getCollection('invoices');
    const invoice = await invoicesColl.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    const obligationsColl = await dbService.getCollection('obligations');
    const openObligations = await obligationsColl.find({ org_id: orgId, status: 'pending' }).toArray();

    let matchedObligation = null;
    let matchScore = 0;
    let matchReason = 'No match found';

    for (const ob of openObligations) {
      if (Math.abs(ob.amount - invoice.amount) < 1.0 && ob.currency === invoice.currency) {
        matchedObligation = ob;
        matchScore = 0.95;
        matchReason = 'Amount and currency matched perfectly.';
        break;
      }
    }

    await invoicesColl.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: matchedObligation ? 'MATCHED' : 'PENDING',
          matched_obligation_id: matchedObligation ? matchedObligation._id : null,
          match_score: matchScore,
          match_reason: matchReason
        }
      }
    );

    return res.json({ message: 'Rematch algorithm completed.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
