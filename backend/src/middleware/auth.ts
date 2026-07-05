import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretlawyeroskey';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    orgId: string;
    role: string;
  };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // Fallback default organization and user for testing convenience
  const defaultUser = {
    userId: 'usr_default_lawyer',
    orgId: 'org_default_firm',
    role: 'lawyer',
  };

  if (!authHeader) {
    req.user = defaultUser;
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    req.user = defaultUser;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      userId: decoded.userId || decoded.sub,
      orgId: decoded.orgId || 'org_default_firm',
      role: decoded.role || 'lawyer',
    };
    next();
  } catch (error) {
    console.warn('Invalid token, falling back to default test user credentials');
    req.user = defaultUser;
    next();
  }
}
