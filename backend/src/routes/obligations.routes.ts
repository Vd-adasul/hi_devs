import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { S3Service } from '../services/s3.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();
const s3Service = S3Service.getInstance();

// 1. List Obligations
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { status, contractId, matterId } = req.query;

  try {
    const obligationsCollection = await dbService.getCollection('obligations') as any;
    const query: any = { org_id: orgId };

    if (status) query.status = status;
    if (contractId) query.document_id = new ObjectId(contractId as string);
    if (matterId) query.matter_id = new ObjectId(matterId as string);

    const list = await obligationsCollection.find(query).toArray();
    return res.json({ data: list });
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

// 3. Mark Obligation Completed
router.patch('/:id/complete', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { notes } = req.body;

  try {
    const obligationsCollection = await dbService.getCollection('obligations') as any;
    const updateRes = await obligationsCollection.updateOne(
      { _id: new ObjectId(id), org_id: orgId },
      {
        $set: {
          status: 'completed',
          completionNotes: notes || '',
          completedAt: new Date(),
          completedBy: req.user?.userId || 'system',
        },
      }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Obligation not found.' });
    }

    return res.json({ message: 'Obligation marked as completed.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

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
