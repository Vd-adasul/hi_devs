import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { EmailService } from '../services/email.service.js';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();
const emailService = EmailService.getInstance();

// 1. Create Diligence Room
router.post('/rooms', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { name, matterId } = req.body;

  if (!name || !matterId) {
    return res.status(400).json({ error: 'name and matterId are required.' });
  }

  try {
    const roomsCollection = await dbService.getCollection('diligenceRooms') as any;
    const newRoom = {
      org_id: orgId,
      name,
      matterId: new ObjectId(matterId),
      collaborators: [],
      documents: [],
      created_at: new Date(),
    };

    const insertRes = await roomsCollection.insertOne(newRoom);
    return res.status(201).json({ message: 'Virtual Diligence Room created.', id: insertRes.insertedId });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. List Diligence Rooms
router.get('/rooms', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  const { matterId } = req.query;

  try {
    const roomsCollection = await dbService.getCollection('diligenceRooms') as any;
    const query: any = { org_id: orgId };
    if (matterId) query.matterId = new ObjectId(matterId as string);

    const list = await roomsCollection.find(query).toArray();
    return res.json({ data: list });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Get Diligence Room Detail (Populated)
router.get('/rooms/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const roomsCollection = await dbService.getCollection('diligenceRooms') as any;
    const room = await roomsCollection.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!room) {
      return res.status(404).json({ error: 'Diligence room not found.' });
    }

    // Populate documents
    const docsCollection = await dbService.getCollection('documents');
    const docIds = (room.documents || []).map((d: any) => new ObjectId(d));
    const documents = await docsCollection.find({ _id: { $in: docIds } }).toArray();

    return res.json({
      data: {
        ...room,
        documents,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Grant Access to Collaborator
router.post('/rooms/:id/access', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { email, role } = req.body; // role = 'view' | 'comment'

  if (!email) {
    return res.status(400).json({ error: 'Collaborator email is required.' });
  }

  try {
    const roomsCollection = await dbService.getCollection('diligenceRooms') as any;
    const room = await roomsCollection.findOne({ _id: new ObjectId(id), org_id: orgId });

    if (!room) {
      return res.status(404).json({ error: 'Diligence room not found.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const collaborator = {
      email,
      token,
      role: role || 'view',
      expiresAt,
      grantedAt: new Date(),
    };

    await roomsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: {
          collaborators: collaborator,
        },
      }
    );

    const accessLink = `${req.headers.origin || 'http://localhost:5173'}/portal/${token}`;
    await emailService.sendDiligenceAccessEmail(email, room.name, accessLink);

    return res.json({ message: `Access granted to ${email}. Email sent with token.`, token });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Add Document to Diligence Room
router.post('/rooms/:id/docs', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { documentId } = req.body;

  if (!documentId) {
    return res.status(400).json({ error: 'documentId is required.' });
  }

  try {
    const roomsCollection = await dbService.getCollection('diligenceRooms') as any;
    const docsCollection = await dbService.getCollection('documents');

    const room = await roomsCollection.findOne({ _id: new ObjectId(id), org_id: orgId });
    const doc = await docsCollection.findOne({ _id: new ObjectId(documentId), org_id: orgId });

    if (!room || !doc) {
      return res.status(404).json({ error: 'Room or Document not found.' });
    }

    // Add to room if not already added
    const alreadyAdded = (room.documents || []).some((d: any) => d.toString() === documentId);
    if (alreadyAdded) {
      return res.status(400).json({ error: 'Document already added to this room.' });
    }

    await roomsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: {
          documents: new ObjectId(documentId),
        },
      }
    );

    return res.json({ message: 'Document successfully added to diligence room.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
