import { Router, Response } from 'express';
import { Neo4jService } from '../services/neo4j.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
const neo4jService = Neo4jService.getInstance();

// Get Neo4j Global Knowledge Graph Overview
router.get('/overview', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId || 'org_default_firm';
  try {
    console.log(`Graph: Fetching global Neo4j graph schema for organization ${orgId}...`);
    const graphData = await neo4jService.getGlobalOverviewGraph(orgId);
    return res.json(graphData);
  } catch (error: any) {
    console.error('Failed to retrieve global Neo4j graph:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get Neo4j Knowledge Graph for a Matter
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId } = req.query;

  if (!matterId) {
    return res.status(400).json({ error: 'matterId query parameter is required.' });
  }

  try {
    console.log(`Graph: Fetching Neo4j force-directed graph schema for matter ${matterId}...`);
    const graphData = await neo4jService.getGraphForMatter(matterId as string);
    return res.json({ data: graphData });
  } catch (error: any) {
    console.error('Failed to retrieve Neo4j graph:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
