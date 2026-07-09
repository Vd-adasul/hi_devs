import { Router, Request, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { EmailService } from '../services/email.service.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();
const emailService = EmailService.getInstance();

// 1. Get Portal State by Token (Diligence / E-Signature / Negotiation)
router.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    // A. Check if it is a Diligence Room Token
    const roomsCollection = await dbService.getCollection('diligenceRooms') as any;
    const room = await roomsCollection.findOne({
      'collaborators.token': token,
    });

    if (room) {
      const collaborator = room.collaborators.find((c: any) => c.token === token);
      if (collaborator.expiresAt < new Date()) {
        return res.status(410).json({ error: 'Portal token has expired.' });
      }

      // Populate docs
      const docsCollection = await dbService.getCollection('documents');
      const docIds = (room.documents || []).map((d: any) => new ObjectId(d));
      const documents = await docsCollection.find({ _id: { $in: docIds } }).toArray();

      return res.json({
        type: 'diligence',
        role: collaborator.role,
        email: collaborator.email,
        room: {
          id: room._id.toString(),
          name: room.name,
          documents,
        },
      });
    }

    // B. Check if it is an E-Signature Request Token
    const sigRequestsCollection = await dbService.getCollection('signatureRequests') as any;
    const sigReq = await sigRequestsCollection.findOne({
      'signers.token': token,
    });

    if (sigReq) {
      const signer = sigReq.signers.find((s: any) => s.token === token);
      const docsCollection = await dbService.getCollection('documents');
      const doc = await docsCollection.findOne({ _id: sigReq.contractId });

      return res.json({
        type: 'signature',
        signer: {
          name: signer.name,
          email: signer.email,
          status: signer.status,
        },
        contract: doc ? {
          id: doc._id.toString(),
          name: doc.name,
          s3Key: doc.s3_key,
          rawText: doc.raw_text,
        } : null,
      });
    }

    // C. Check if it is a Negotiation Portal Token
    const negotiationsCollection = await dbService.getCollection('negotiations') as any;
    const negotiation = await negotiationsCollection.findOne({
      portalToken: token,
    });

    if (negotiation) {
      const docsCollection = await dbService.getCollection('documents');
      const doc = await docsCollection.findOne({ _id: negotiation.contractId });

      return res.json({
        type: 'negotiation',
        negotiation: {
          id: negotiation._id.toString(),
          status: negotiation.status,
          rounds: negotiation.rounds || [],
          deadline: negotiation.deadline,
        },
        contract: doc ? {
          id: doc._id.toString(),
          name: doc.name,
          rawText: doc.raw_text,
        } : null,
      });
    }

    return res.status(404).json({ error: 'Invalid or unrecognized portal token.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Add Comment via Diligence Portal
router.post('/:token/comments', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { text, docId } = req.body;

  if (!text) return res.status(400).json({ error: 'Comment text is required.' });

  try {
    const roomsCollection = await dbService.getCollection('diligenceRooms') as any;
    const room = await roomsCollection.findOne({ 'collaborators.token': token });

    if (!room) {
      return res.status(404).json({ error: 'Invalid portal token.' });
    }

    const collaborator = room.collaborators.find((c: any) => c.token === token);
    if (collaborator.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Portal token has expired.' });
    }

    if (collaborator.role === 'view') {
      return res.status(403).json({ error: 'Access denied. View-only collaborator cannot add comments.' });
    }

    const commentsCollection = await dbService.getCollection('comments');
    const newComment = {
      org_id: room.org_id,
      contractId: new ObjectId(docId),
      clauseId: null,
      userId: collaborator.email,
      userName: `${collaborator.email} (External)`,
      text,
      resolved: false,
      thread: [],
      created_at: new Date(),
    };

    await commentsCollection.insertOne(newComment);
    return res.status(201).json({ message: 'Comment added successfully.', data: newComment });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Complete E-Signature using OTP
router.post('/:token/sign', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { otp } = req.body;

  if (!otp) return res.status(400).json({ error: '6-digit OTP code is required.' });

  try {
    const sigRequestsCollection = await dbService.getCollection('signatureRequests') as any;
    const sigReq = await sigRequestsCollection.findOne({ 'signers.token': token });

    if (!sigReq) {
      return res.status(404).json({ error: 'Invalid portal token.' });
    }

    const signerIdx = sigReq.signers.findIndex((s: any) => s.token === token);
    const signer = sigReq.signers[signerIdx];

    if (signer.status === 'signed') {
      return res.status(400).json({ error: 'Document has already been signed by this signer.' });
    }

    if (signer.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP code. Please verify the code sent to your email.' });
    }

    // Mark as signed
    const updatedSigners = [...sigReq.signers];
    updatedSigners[signerIdx] = {
      ...signer,
      status: 'signed',
      signedAt: new Date(),
    };

    const allSigned = updatedSigners.every((s: any) => s.status === 'signed');
    const newStatus = allSigned ? 'signed' : 'pending';

    await sigRequestsCollection.updateOne(
      { _id: sigReq._id },
      {
        $set: {
          signers: updatedSigners,
          status: newStatus,
        },
      }
    );

    if (allSigned) {
      const docsCollection = await dbService.getCollection('documents');
      await docsCollection.updateOne(
        { _id: sigReq.contractId },
        { $set: { signatureStatus: 'signed' } }
      );
    }

    return res.json({ message: 'Document successfully signed.', status: newStatus });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Submit Counter-Offer (Negotiation Portal)
router.post('/:token/negotiate', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { clauses } = req.body; // clauses = [{ type: 'PaymentTerms', proposed: 'net-45', rationale: '...' }]

  if (!clauses || !Array.isArray(clauses) || clauses.length === 0) {
    return res.status(400).json({ error: 'clauses counter-offer list is required.' });
  }

  try {
    const negotiationsCollection = await dbService.getCollection('negotiations') as any;
    const negotiation = await negotiationsCollection.findOne({ portalToken: token });

    if (!negotiation || negotiation.status !== 'active') {
      return res.status(404).json({ error: 'Active negotiation session not found.' });
    }

    const nextRoundNumber = (negotiation.rounds || []).length + 1;
    const newRound = {
      roundNumber: nextRoundNumber,
      offerBy: 'counterparty',
      clauses,
      timestamp: new Date(),
      aiAnalysis: null, // to be populated by agent trigger on backend later
    };

    await negotiationsCollection.updateOne(
      { _id: negotiation._id },
      {
        $push: {
          rounds: newRound,
        },
      }
    );

    // Fetch user details for notification
    const usersCollection = await dbService.getCollection('users');
    const documentOwner = await usersCollection.findOne({ org_id: negotiation.orgId, role: 'admin' });
    const docsCollection = await dbService.getCollection('documents');
    const doc = await docsCollection.findOne({ _id: negotiation.contractId });

    if (documentOwner && doc) {
      const portalUrl = `${req.headers.origin || 'http://localhost:5173'}/negotiations/${negotiation._id.toString()}`;
      await emailService.sendNegotiationCounterEmail(
        documentOwner.email,
        'Counterparty Partner',
        doc.name || 'Contract',
        portalUrl
      );
    }

    return res.status(201).json({ message: 'Counter-offer successfully submitted.', roundNumber: nextRoundNumber });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
