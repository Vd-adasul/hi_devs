import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { ObjectId } from 'mongodb';

const router = Router();
const dbService = DbService.getInstance();

// 1. Get Comments for a Contract
router.get('/contracts/:id/comments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const commentsCollection = await dbService.getCollection('comments') as any;
    const comments = await commentsCollection
      .find({ contractId: new ObjectId(id), org_id: orgId })
      .sort({ created_at: 1 })
      .toArray();

    return res.json({ data: comments });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 2. Add a Comment or Thread Reply
router.post('/contracts/:id/comments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { clauseId, text, parentCommentId } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Comment text is required.' });
  }

  try {
    const commentsCollection = await dbService.getCollection('comments') as any;

    // Fetch user details for display name
    const usersCollection = await dbService.getCollection('users');
    let userDetails;
    if (req.user?.userId && req.user.userId.length === 24) {
      userDetails = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    } else if (req.user?.userId) {
      userDetails = await usersCollection.findOne({ email: req.user.userId });
    }
    const userName = userDetails?.name || userDetails?.email || 'Anonymous';

    if (parentCommentId) {
      // It's a thread reply: find parent and push to thread array
      const parent = await commentsCollection.findOne({
        _id: new ObjectId(parentCommentId),
        contractId: new ObjectId(id),
      });

      if (!parent) {
        return res.status(404).json({ error: 'Parent comment thread not found.' });
      }

      await commentsCollection.updateOne(
        { _id: new ObjectId(parentCommentId) },
        {
          $push: {
            thread: {
              replyId: new ObjectId(),
              userId: req.user?.userId,
              userName,
              text,
              createdAt: new Date(),
            },
          },
        }
      );

      return res.status(201).json({ message: 'Reply added successfully.' });
    } else {
      // It's a new top-level comment
      const newComment = {
        org_id: orgId,
        contractId: new ObjectId(id),
        clauseId: clauseId ? new ObjectId(clauseId) : null,
        userId: req.user?.userId,
        userName,
        text,
        resolved: false,
        thread: [],
        created_at: new Date(),
      };

      const insertRes = await commentsCollection.insertOne(newComment);
      return res.status(201).json({
        message: 'Comment added successfully.',
        data: { ...newComment, _id: insertRes.insertedId },
      });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 3. Resolve a Comment Thread
router.patch('/contracts/:id/comments/:commentId/resolve', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { commentId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const commentsCollection = await dbService.getCollection('comments') as any;
    const updateRes = await commentsCollection.updateOne(
      { _id: new ObjectId(commentId), org_id: orgId },
      { $set: { resolved: true } }
    );

    if (updateRes.matchedCount === 0) {
      return res.status(404).json({ error: 'Comment thread not found.' });
    }

    return res.json({ message: 'Comment thread resolved successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 4. Delete a Comment (or Reply)
router.delete('/contracts/:id/comments/:commentId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { commentId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const { replyId } = req.query; // If deleting a sub-thread reply

  try {
    const commentsCollection = await dbService.getCollection('comments') as any;

    if (replyId) {
      // Delete specific reply from the array
      const updateRes = await commentsCollection.updateOne(
        { _id: new ObjectId(commentId), org_id: orgId },
        { $pull: { thread: { replyId: new ObjectId(replyId as string) } } }
      );
      if (updateRes.matchedCount === 0) {
        return res.status(404).json({ error: 'Comment not found.' });
      }
      return res.json({ message: 'Reply deleted successfully.' });
    } else {
      // Delete top level comment
      const deleteRes = await commentsCollection.deleteOne({ _id: new ObjectId(commentId), org_id: orgId });
      if (deleteRes.deletedCount === 0) {
        return res.status(404).json({ error: 'Comment thread not found.' });
      }
      return res.json({ message: 'Comment thread deleted successfully.' });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
