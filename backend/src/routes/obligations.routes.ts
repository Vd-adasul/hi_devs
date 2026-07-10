import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { S3Service } from '../services/s3.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';
import multer from 'multer';


const router = Router();
const dbService = DbService.getInstance();
const s3Service = S3Service.getInstance();

// 1. List Obligations
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { status, contractId, matterId, bucket, q } = req.query;

  try {
    const obligationsCollection = await dbService.getCollection('obligations') as any;
    const docsCollection = await dbService.getCollection('documents');
    const query: any = { org_id: orgId };

    if (status) query.status = status;
    if (contractId) query.document_id = new ObjectId(contractId as string);
    if (matterId) query.matter_id = new ObjectId(matterId as string);

    // Support bucket filter
    if (bucket && bucket !== 'all') {
      if (bucket === 'open') {
        query.status = { $ne: 'COMPLETED' };
      } else if (bucket === 'completed') {
        query.status = 'COMPLETED';
      } else if (bucket === 'overdue') {
        query.status = { $ne: 'COMPLETED' };
        query.due_date = { $lt: new Date() };
      } else if (bucket === 'due_soon') {
        query.status = { $ne: 'COMPLETED' };
        query.due_date = { $gte: new Date(), $lte: new Date(Date.now() + 30 * 86_400_000) };
      }
    }

    // Support text search query
    if (q) {
      query.description = { $regex: String(q), $options: 'i' };
    }

    const list = await obligationsCollection.find(query).toArray();
    
    // Populate contracts
    const mapped = await Promise.all(list.map(async (o: any) => {
      const doc = o.document_id ? await docsCollection.findOne({ _id: o.document_id }) : null;
      return {
        id: o._id.toString(),
        type: o.type || 'other',
        description: o.description || o.raw_text || '',
        owner: o.owner || 'All',
        dueDate: o.due_date ? new Date(o.due_date).toISOString() : null,
        recurrence: o.recurrence || 'once',
        trigger: o.trigger || null,
        quote: o.quote || '',
        severity: o.severity || 'low',
        sectionRef: o.section_ref || null,
        status: o.status || 'OPEN',
        completedAt: o.completedAt ? new Date(o.completedAt).toISOString() : null,
        notifiedAt: o.notifiedAt ? new Date(o.notifiedAt).toISOString() : null,
        contract: doc ? {
          id: doc._id.toString(),
          title: doc.name || 'Untitled Contract',
          status: doc.status || 'DRAFT',
          type: doc.type || 'OTHER',
          counterpartyName: doc.counterparty_name || null,
        } : null
      };
    }));

    return res.json({ data: mapped, total: mapped.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 1a. Get Obligations Stats
router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  
  try {
    const obligationsCollection = await dbService.getCollection('obligations');
    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 86_400_000);

    const open = await obligationsCollection.countDocuments({ org_id: orgId, status: { $ne: 'COMPLETED' } });
    
    const overdue = await obligationsCollection.countDocuments({
      org_id: orgId,
      status: { $ne: 'COMPLETED' },
      due_date: { $lt: now }
    });

    const dueSoon = await obligationsCollection.countDocuments({
      org_id: orgId,
      status: { $ne: 'COMPLETED' },
      due_date: { $gte: now, $lte: in30Days }
    });

    const completedRecent = await obligationsCollection.countDocuments({
      org_id: orgId,
      status: 'COMPLETED',
      completedAt: { $gte: new Date(Date.now() - 30 * 86_400_000) }
    });

    return res.json({ open, dueSoon, overdue, completedRecent });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 1b. Export Obligations CSV
router.get('/export', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { bucket } = req.query;

  try {
    const obligationsCollection = await dbService.getCollection('obligations');
    const query: any = { org_id: orgId };

    if (bucket === 'open') {
      query.status = { $ne: 'COMPLETED' };
    } else if (bucket === 'completed') {
      query.status = 'COMPLETED';
    } else if (bucket === 'overdue') {
      query.status = { $ne: 'COMPLETED' };
      query.due_date = { $lt: new Date() };
    } else if (bucket === 'due_soon') {
      query.status = { $ne: 'COMPLETED' };
      query.due_date = { $gte: new Date(), $lte: new Date(Date.now() + 30 * 86_400_000) };
    }

    const items = await obligationsCollection.find(query).toArray();
    
    // Generate CSV
    let csv = 'Description,Type,Owner,Due Date,Severity,Status,Completed At\n';
    for (const item of items) {
      const desc = `"${(item.description || item.raw_text || '').replace(/"/g, '""')}"`;
      const type = item.type || 'other';
      const owner = item.owner || 'All';
      const dueDate = item.due_date ? new Date(item.due_date).toLocaleDateString() : '';
      const severity = item.severity || 'low';
      const status = item.status || 'OPEN';
      const completedAt = item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '';
      csv += `${desc},${type},${owner},${dueDate},${severity},${status},${completedAt}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=obligations.csv');
    return res.status(200).send(csv);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Get Obligation Details
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const obligationsCollection = await dbService.getCollection('obligations') as any;
    const item = await obligationsCollection.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!item) {
      return res.status(404).json({ error: 'Obligation not found.' });
    }

    return res.json({ data: item });
  } catch (error: any) {

    return res.status(500).json({ error: error.message });
  }
});

const upload = multer({ storage: multer.memoryStorage() });

// 3. Mark Obligation Completed (supports POST & PATCH, handles file upload if present)
const completeHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const notes = req.body.notes || req.body.note || '';

  try {
    const obligationsCollection = await dbService.getCollection('obligations') as any;
    
    let newEvidence: any = null;
    if (req.file) {
      const fileName = req.file.originalname;
      const s3Key = `evidence/${orgId}/${id}/${Date.now()}_${fileName}`;
      const s3Url = await s3Service.uploadFile(req.file.buffer, s3Key, req.file.mimetype || 'application/octet-stream');
      
      newEvidence = {
        fileName,
        s3Key,
        url: s3Url,
        uploadedAt: new Date(),
        uploadedBy: req.user?.userId || 'system',
      };
    }

    const updateRes = await obligationsCollection.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      {
        $set: {
          status: 'COMPLETED', // Match frontend uppercase status
          completionNotes: notes,
          completedAt: new Date(),
          completedBy: req.user?.userId || 'system',
        },
        ...(newEvidence && {
          $push: {
            evidence: newEvidence
          }
        })
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Obligation not found.' });
    }

    return res.json({ message: 'Obligation marked as completed.', evidence: newEvidence });
  } catch (error: any) {
    console.error('Complete obligation error:', error);
    return res.status(500).json({ error: error.message });
  }
};

router.post('/:id/complete', authMiddleware, upload.single('file'), completeHandler);
router.patch('/:id/complete', authMiddleware, upload.single('file'), completeHandler);


// 4. Upload Evidence for Obligation
// Expects binary payload in req.body (or base64 if needed, let's support raw Buffer)
router.post('/:id/evidence', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const fileName = req.query.name as string || 'evidence.pdf';
  const fileBuffer = req.body;

  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    return res.status(400).json({ error: 'Raw file binary payload is required.' });
  }

  try {
    const obligationsCollection = await dbService.getCollection('obligations') as any;
    const item = await obligationsCollection.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!item) {
      return res.status(404).json({ error: 'Obligation not found.' });
    }

    // Upload to S3
    const s3Key = `evidence/${orgId}/${id}/${Date.now()}_${fileName}`;
    const s3Url = await s3Service.uploadFile(fileBuffer, s3Key, 'application/octet-stream');

    const newEvidence = {
      fileName,
      s3Key,
      url: s3Url,
      uploadedAt: new Date(),
      uploadedBy: req.user?.userId || 'system',
    };

    await obligationsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: {
          evidence: newEvidence,
        },
      }
    );

    return res.status(201).json({
      message: 'Evidence uploaded successfully.',
      evidence: newEvidence,
    });
  } catch (error: any) {
    console.error('Evidence upload failed:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 5. Get Evidence List for Obligation
router.get('/:id/evidence', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const obligationsCollection = await dbService.getCollection('obligations') as any;
    const item = await obligationsCollection.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!item) {
      return res.status(404).json({ error: 'Obligation not found.' });
    }

    return res.json({ data: item.evidence || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
