import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { DbService } from '../services/db.service.js';

const dbService = DbService.getInstance();

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Authentication required.' });
    }

    const userRole = req.user.role || 'lawyer';
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: `Forbidden. Requires role: ${allowedRoles.join(' or ')}` });
    }

    next();
  };
}

export function requireTier(minimumTier: 'free' | 'pro' | 'enterprise') {
  const tierWeight = {
    free: 0,
    pro: 1,
    enterprise: 2,
  };

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized. Authentication required.' });
    }

    try {
      const orgsCollection = await dbService.getCollection('organizations');
      const org = await orgsCollection.findOne({ orgId: req.user.orgId });

      const currentTier: 'free' | 'pro' | 'enterprise' = (org?.tier as any) || 'free';

      if (tierWeight[currentTier] < tierWeight[minimumTier]) {
        return res.status(403).json({
          error: `Upgrade Required. This feature is restricted to ${minimumTier} accounts. Current tier: ${currentTier}.`,
        });
      }

      next();
    } catch (err: any) {
      console.error('RBAC Tier check failed:', err);
      // Fallback: allow to proceed but warn
      next();
    }
  };
}
