import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { S3Service } from '../services/s3.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import { documentProcessingAgent, documentWorkflow } from '../mastra/index.js';
import { ObjectId } from 'mongodb';
import pdf from 'pdf-parse';

const router = Router();
const dbService = DbService.getInstance();
const s3Service = S3Service.getInstance();

// Upload PDF document to Matter and process it
// Expects raw binary PDF body (use express.raw({ type: 'application/pdf', limit: '10mb' }))
router.post('/:matterId/documents', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const fileName = req.query.name as string || 'document.pdf';
  const pdfBuffer = req.body;

  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    return res.status(400).json({ error: 'Raw PDF binary payload is required.' });
  }

  try {
    // 1. Verify Matter exists
    const mattersCollection = await dbService.getCollection('matters');
    const matter = await mattersCollection.findOne({
      _id: new ObjectId(matterId),
      org_id: orgId,
    });

    if (!matter) {
      return res.status(404).json({ error: 'Matter not found' });
    }

    console.log(`Extracting text from uploaded PDF: ${fileName} (${pdfBuffer.length} bytes)`);
    // 2. Parse PDF text
    let parsedPdf;
    try {
      parsedPdf = await pdf(pdfBuffer);
    } catch (e: any) {
      throw new Error(`Failed to parse PDF binary content: ${e.message}`);
    }

    const rawText = parsedPdf.text;
    const pageCount = parsedPdf.numpages || 1;

    // 3. Upload to AWS S3
    const s3Key = `${orgId}/${matterId}/${Date.now()}_${fileName}`;
    const s3Url = await s3Service.uploadFile(pdfBuffer, s3Key, 'application/pdf');

    // 4. Save initial document record in MongoDB
    const docsCollection = await dbService.getCollection('documents');
    const docRecord = {
      org_id: orgId,
      matter_id: new ObjectId(matterId),
      name: fileName,
      s3_key: s3Key,
      status: 'processing' as const,
      file_size: pdfBuffer.length,
      page_count: pageCount,
      created_at: new Date(),
    };
    const insertRes = await docsCollection.insertOne(docRecord);
    const documentId = insertRes.insertedId.toString();

    // 5. Trigger Mastra processing workflow (so API processes and returns results)
    console.log(`Triggering Mastra Workflow to structure document: ${documentId}`);
    
    const run = await documentWorkflow.createRun();
    const workflowRes = await run.start({
      inputData: {
        orgId,
        matterId,
        documentId,
        rawText,
        pageCount,
      },
    });
    
    if (workflowRes.status === 'failed') {
      throw new Error((workflowRes as any).error?.message || 'Workflow execution failed');
    }
    
    const agentSummary = (workflowRes as any).result?.agentSummary || 'Structured extraction successfully finished via Mastra Workflow pipeline.';

    // Update document status in MongoDB
    await docsCollection.updateOne(
      { _id: new ObjectId(documentId) },
      {
        $set: {
          status: 'completed',
          raw_text: rawText,
        },
      }
    );

    // Retrieve the extracted clauses to return to the user
    const clausesCollection = await dbService.getCollection('clauses');
    const extractedClauses = await clausesCollection.find({ document_id: new ObjectId(documentId) }).toArray();

    return res.status(201).json({
      message: 'Document uploaded and processed successfully',
      documentId,
      s3Url,
      pages: pageCount,
      agentSummary,
      clauses: extractedClauses,
    });

  } catch (error: any) {
    console.error('Error processing document upload:', error);
    return res.status(500).json({ error: error.message });
  }
});

// List all documents in a matter
router.get('/:matterId/documents', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const mattersCollection = await dbService.getCollection('matters');
    const matter = await mattersCollection.findOne({
      _id: new ObjectId(matterId),
      org_id: orgId,
    });

    if (!matter) {
      return res.status(404).json({ error: 'Matter not found or access denied.' });
    }

    const docsCollection = await dbService.getCollection('documents');
    const documents = await docsCollection.find({
      matter_id: new ObjectId(matterId),
      org_id: orgId,
    }).toArray();

    return res.json({ documents });
  } catch (error: any) {
    console.error('Error listing documents:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
