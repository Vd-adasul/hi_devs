import { Router, Response, Request } from 'express';
import { DbService } from '../services/db.service.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = Router();
const dbService = DbService.getInstance();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretlawyeroskey';

// Helper to hash passwords using SHA256
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 1. User Registration
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, orgId, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const usersCollection = await dbService.getCollection('users');
    const existingUser = await usersCollection.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const newUser = {
      email,
      password: hashPassword(password),
      org_id: orgId || `org_${Math.random().toString(36).substring(7)}`,
      role: role || 'lawyer',
      created_at: new Date(),
    };

    await usersCollection.insertOne(newUser);

    return res.status(201).json({ message: 'User registered successfully.' });
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

export default router;
