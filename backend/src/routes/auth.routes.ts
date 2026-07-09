import { Router, Response, Request } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { EmailService } from '../services/email.service.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = Router();
const dbService = DbService.getInstance();
const emailService = EmailService.getInstance();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretlawyeroskey';

// Helper to hash passwords using SHA256
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 1. User Registration (and Org Creation)
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, orgName, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const usersCollection = await dbService.getCollection('users');
    const orgsCollection = await dbService.getCollection('organizations');

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const orgId = `org_${Math.random().toString(36).substring(7)}`;
    const finalOrgName = orgName || `Firm_${Math.random().toString(36).substring(7)}`;

    // Create Org
    await orgsCollection.insertOne({
      orgId,
      name: finalOrgName,
      tier: 'free',
      orgApiKeys: [],
      webhooks: [],
      settings: { onboardingCompleted: false },
      created_at: new Date(),
    });

    const newUser = {
      email,
      password: hashPassword(password),
      org_id: orgId,
      role: role || 'admin', // First user is admin
      created_at: new Date(),
    };

    const insertResult = await usersCollection.insertOne(newUser);
    const userId = insertResult.insertedId.toString();

    // Sign JWT immediately
    const token = jwt.sign(
      { userId, orgId, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'User and organization registered successfully.',
      token,
      user: {
        id: userId,
        email,
        orgId,
        role: newUser.role,
      },
    });
  } catch (error: any) {
    console.error('Error during registration:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. User Login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const usersCollection = await dbService.getCollection('users');
    const user = await usersCollection.findOne({ email });

    if (!user || user.password !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Sign JWT
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        orgId: user.org_id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        orgId: user.org_id,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('Error during login:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 3. Get Current User & Organization details
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const usersCollection = await dbService.getCollection('users');
    const orgsCollection = await dbService.getCollection('organizations');
    // Retrieve user by userId or email depending on length
    let dbUser;
    if (req.user.userId.length === 24) {
      const { ObjectId } = await import('mongodb');
      dbUser = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    } else {
      dbUser = await usersCollection.findOne({ email: req.user.userId });
    }

    const org = await orgsCollection.findOne({ orgId: req.user.orgId });

    return res.json({
      user: dbUser ? {
        id: dbUser._id.toString(),
        email: dbUser.email,
        orgId: dbUser.org_id,
        role: dbUser.role,
      } : req.user,
      organization: org || { orgId: req.user.orgId, name: 'Default Firm', tier: 'free' },
    });
  } catch (error: any) {
    console.error('Error in /me:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 4. Invite User to Organization
router.post('/invite', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { email, role } = req.body;
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Requires Admin role to invite users.' });
  }

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  try {
    const invitesCollection = await dbService.getCollection('invites');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const inviteRecord = {
      token,
      orgId: req.user.orgId,
      email,
      role: role || 'lawyer',
      createdBy: req.user.userId,
      expiresAt,
      acceptedAt: null,
    };

    await invitesCollection.insertOne(inviteRecord);

    const inviteLink = `${req.headers.origin || 'http://localhost:5173'}/accept-invite/${token}`;
    
    // Fetch org name
    const orgsCollection = await dbService.getCollection('organizations');
    const org = await orgsCollection.findOne({ orgId: req.user.orgId });
    const orgName = org?.name || 'Your Firm';

    await emailService.sendInviteEmail(email, orgName, inviteLink);

    return res.json({ message: `Invitation sent to ${email} successfully.`, token });
  } catch (error: any) {
    console.error('Error during invite:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 5. Accept Invite & Complete Signup
router.post('/accept-invite/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { password, name } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  try {
    const invitesCollection = await dbService.getCollection('invites');
    const usersCollection = await dbService.getCollection('users');

    const invite = await invitesCollection.findOne({ token, acceptedAt: null });
    if (!invite || invite.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired invitation token.' });
    }

    const existingUser = await usersCollection.findOne({ email: invite.email });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email is already registered.' });
    }

    // Create user
    const newUser = {
      email: invite.email,
      name: name || '',
      password: hashPassword(password),
      org_id: invite.orgId,
      role: invite.role,
      created_at: new Date(),
    };

    const insertResult = await usersCollection.insertOne(newUser);
    const userId = insertResult.insertedId.toString();

    // Mark invite as accepted
    await invitesCollection.updateOne(
      { _id: invite._id },
      { $set: { acceptedAt: new Date() } }
    );

    // Sign JWT
    const jwtToken = jwt.sign(
      { userId, orgId: invite.orgId, role: invite.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Invitation accepted and account created successfully.',
      token: jwtToken,
      user: {
        id: userId,
        email: invite.email,
        orgId: invite.orgId,
        role: invite.role,
      },
    });
  } catch (error: any) {
    console.error('Error accepting invite:', error);
    return res.status(500).json({ error: error.message });
  }
});

// 6. Token Refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token is required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;
    const newToken = jwt.sign(
      { userId: decoded.userId, orgId: decoded.orgId, role: decoded.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      token: newToken,
      user: {
        id: decoded.userId,
        orgId: decoded.orgId,
        role: decoded.role,
      },
    });
  } catch (error: any) {
    return res.status(401).json({ error: 'Invalid token structure or signature.' });
  }
});

export default router;
