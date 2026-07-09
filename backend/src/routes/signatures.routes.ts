import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { EmailService } from '../services/email.service.js';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();
const emailService = EmailService.getInstance();

// Helper to generate a 6-digit numeric OTP
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 1. Create Signature Request
router.post('/request', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { contractId, signers } = req.body; // signers = [{ email, name }]

  if (!contractId || !signers || !Array.isArray(signers) || signers.length === 0) {
    return res.status(400).json({ error: 'contractId and non-empty signers array are required.' });
  }

  try {
    const sigRequestsCollection = await dbService.getCollection('signatureRequests');
    const docsCollection = await dbService.getCollection('documents');

    const document = await docsCollection.findOne({ _id: new ObjectId(contractId), org_id: orgId });
    if (!document) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const signersWithTokens = signers.map(s => ({
      email: s.email,
      name: s.name,
      status: 'pending',
      token: crypto.randomBytes(32).toString('hex'),
      otp: generateOtp(),
      signedAt: null,
    }));

    const newRequest = {
      org_id: orgId,
      contractId: new ObjectId(contractId),
      status: 'pending',
      signers: signersWithTokens,
      created_at: new Date(),
    };

    const insertRes = await sigRequestsCollection.insertOne(newRequest);

    // Email each signer
    for (const signer of signersWithTokens) {
      const signLink = `${req.headers.origin || 'http://localhost:5173'}/sign/${signer.token}`;
      await emailService.sendSignatureRequestEmail(signer.email, document.name || 'Contract', signLink);
      
      // Update: Log OTP to console for easy testing/debugging
      console.log(`[Signature OTP Stub] Signer: ${signer.email} | OTP: ${signer.otp} | Token: ${signer.token}`);
    }

    // Update document status
    await docsCollection.updateOne(
      { _id: new ObjectId(contractId) },
      { $set: { signatureStatus: 'pending' } }
    );

    return res.status(201).json({ message: 'Signature request created.', id: insertRes.insertedId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. List Signature Requests
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const sigRequestsCollection = await dbService.getCollection('signatureRequests');
    const list = await sigRequestsCollection.find({ org_id: orgId }).toArray();

    const docsCollection = await dbService.getCollection('documents');
    const populated = await Promise.all(list.map(async item => {
      const doc = await docsCollection.findOne({ _id: item.contractId });
      return {
        ...item,
        contractTitle: doc ? doc.name : 'Unknown Contract',
      };
    }));

    return res.json({ data: populated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Get Signature Status
router.get('/:id/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const sigRequestsCollection = await dbService.getCollection('signatureRequests');
    const item = await sigRequestsCollection.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!item) {
      return res.status(404).json({ error: 'Signature request not found.' });
    }

    return res.json({ data: item });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
