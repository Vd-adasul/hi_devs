import { Router, Response } from 'express';
import { DbService } from '../services/db.service.js';
import { S3Service } from '../services/s3.service.js';
import { AuthenticatedRequest, authMiddleware } from '../middleware/auth.js';
import { documentWorkflow } from '../mastra/index.js';
import { OcrService } from '../services/ocr.service.js';
import { Neo4jService } from '../services/neo4j.service.js';
import { PdfHighlightService } from '../services/pdfHighlight.service.js';
import { VersionDiffService } from '../services/versionDiff.service.js';
import { MatterTwinService } from '../services/matterTwin.service.js';
import { ObjectId } from 'mongodb';
import pdf from 'pdf-parse';

const router = Router();
const dbService = DbService.getInstance();
const s3Service = S3Service.getInstance();
const ocrService = OcrService.getInstance();
const neo4jService = Neo4jService.getInstance();
const pdfHighlightService = PdfHighlightService.getInstance();
const versionDiffService = VersionDiffService.getInstance();
const matterTwinService = MatterTwinService.getInstance();

// Upload PDF document to Matter and process it
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

    let rawText = parsedPdf.text;
    const pageCount = parsedPdf.numpages || 1;

    // 2a. OCR Fallback Check
    const isScanned = ocrService.isScannedDocument(rawText);
    if (isScanned) {
      console.log('Low text count detected. Falling back to Gemini AI OCR...');
      try {
        rawText = await ocrService.performOcr(pdfBuffer);
      } catch (ocrErr: any) {
        console.error('Gemini OCR failed, proceeding with original low text:', ocrErr);
      }
    }

    // 3. Upload to AWS S3
    const s3Key = `${orgId}/${matterId}/${Date.now()}_${fileName}`;
    const s3Url = await s3Service.uploadFile(pdfBuffer, s3Key, 'application/pdf');

    // 4. Save initial document record in MongoDB
    const docsCollection = await dbService.getCollection('documents') as any;
    const docRecord = {
      org_id: orgId,
      matter_id: new ObjectId(matterId),
      name: fileName,
      s3_key: s3Key,
      status: 'processing' as const,
      file_size: pdfBuffer.length,
      page_count: pageCount,
      version: 1,
      versions: [
        {
          versionNumber: 1,
          s3_key: s3Key,
          fileName,
          uploadedAt: new Date(),
          uploadedBy: req.user?.userId || 'system',
        },
      ],
      created_at: new Date(),
    };
    const insertRes = await docsCollection.insertOne(docRecord);
    const documentId = insertRes.insertedId.toString();

    // Create Neo4j Nodes
    await neo4jService.createMatterNode(matterId, matter.name || 'Matter', orgId);
    await neo4jService.createDocumentNode(documentId, matterId, fileName, 'contract');

    // 5. Trigger Mastra processing workflow
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

    // Retrieve the extracted clauses
    const clausesCollection = await dbService.getCollection('clauses');
    const extractedClauses = await clausesCollection.find({ document_id: new ObjectId(documentId) }).toArray();

    // Create Clause nodes in Neo4j and compute highlights
    console.log(`Mapping ${extractedClauses.length} clauses in Neo4j and extracting highlights coordinate map...`);
    for (const cl of extractedClauses) {
      await neo4jService.createClauseNode(
        cl._id.toString(),
        documentId,
        cl.category || 'General',
        cl.text,
        cl.risk_level || 'low'
      );
    }

    // Bounding box coordinate mapping (highlights overlay)
    let enrichedHighlights: any[] = [];
    try {
      const pagesTextPositions = await pdfHighlightService.getTextPositions(pdfBuffer);
      enrichedHighlights = pdfHighlightService.enrichHighlights(pagesTextPositions, extractedClauses);
    } catch (hlErr) {
      console.error('Failed to compute PDF text coordinate highlights:', hlErr);
    }

    // Update document status & store highlights + raw text in MongoDB
    await docsCollection.updateOne(
      { _id: new ObjectId(documentId) },
      {
        $set: {
          status: 'completed',
          raw_text: rawText,
          highlights: enrichedHighlights,
        },
      }
    );

    // 6. Matter Twin: Auto-merge & conflict detection
    try {
      const allDocs = await docsCollection.find({ matter_id: new ObjectId(matterId) }).toArray();
      // If we have more than 1 document, perform conflict detection
      if (allDocs.length > 1) {
        console.log(`Multiple documents detected under Matter ${matterId}. Running Matter Twin auto-merge...`);
        const otherDocs = allDocs.filter((d: any) => d._id.toString() !== documentId);
        const otherDocIds = otherDocs.map((d: any) => d._id);

        const existingClauses = await clausesCollection
          .find({ document_id: { $in: otherDocIds } })
          .toArray();

        const formatExisting = existingClauses.map(ec => ({
          id: ec._id.toString(),
          text: ec.text,
          category: ec.category || 'General',
          documentId: ec.document_id.toString(),
        }));

        const formatIncoming = extractedClauses.map(ic => ({
          text: ic.text,
          category: ic.category || 'General',
          documentId,
        }));

        const twinResult = await matterTwinService.detectConflictsAndMerge(
          formatExisting,
          formatIncoming,
          documentId
        );

        // Store twin state inside the Matter record
        await mattersCollection.updateOne(
          { _id: new ObjectId(matterId) },
          {
            $set: {
              livingState: {
                mergedClauses: twinResult.mergedClauses,
                supersededClauses: twinResult.supersededClauses,
                lastMergedAt: new Date(),
              },
              conflicts: twinResult.conflictingClauses,
            },
          }
        );
      } else {
        // First document - merged state is just its extracted clauses
        await mattersCollection.updateOne(
          { _id: new ObjectId(matterId) },
          {
            $set: {
              livingState: {
                mergedClauses: extractedClauses.map(c => ({
                  text: c.text,
                  category: c.category || 'General',
                  sourceDocId: documentId,
                })),
                supersededClauses: [],
                lastMergedAt: new Date(),
              },
              conflicts: [],
            },
          }
        );
      }
    } catch (twinErr) {
      console.error('Matter Twin auto-merge failed:', twinErr);
    }

    return res.status(201).json({
      message: 'Document uploaded and processed successfully',
      documentId,
      s3Url,
      pages: pageCount,
      agentSummary,
      clauses: extractedClauses,
      highlights: enrichedHighlights,
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

    const docsCollection = await dbService.getCollection('documents') as any;
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

// Upload a new VERSION of an existing document
router.post('/:matterId/documents/:docId/versions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId, docId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';
  const fileName = req.query.name as string || 'document_v2.pdf';
  const pdfBuffer = req.body;

  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    return res.status(400).json({ error: 'Raw PDF binary payload is required.' });
  }

  try {
    const docsCollection = await dbService.getCollection('documents') as any;
    const document = await docsCollection.findOne({
      _id: new ObjectId(docId),
      org_id: orgId,
      matter_id: new ObjectId(matterId),
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // 1. Parse PDF text
    let parsedPdf;
    try {
      parsedPdf = await pdf(pdfBuffer);
    } catch (e: any) {
      throw new Error(`Failed to parse PDF binary content: ${e.message}`);
    }

    let rawText = parsedPdf.text;
    const pageCount = parsedPdf.numpages || 1;

    // OCR Fallback check
    if (ocrService.isScannedDocument(rawText)) {
      try {
        rawText = await ocrService.performOcr(pdfBuffer);
      } catch (ocrErr) {
        console.error('OCR failed on version upload:', ocrErr);
      }
    }

    // 2. Upload to S3
    const s3Key = `${orgId}/${matterId}/${Date.now()}_${fileName}`;
    const s3Url = await s3Service.uploadFile(pdfBuffer, s3Key, 'application/pdf');

    // 3. Compute Diff HTML with previous version text
    const oldText = document.raw_text || '';
    const diffHtml = versionDiffService.generateDiffHtml(oldText, rawText);

    // 4. Update MongoDB document versions array
    const nextVersionNumber = (document.version || 1) + 1;
    const newVersion = {
      versionNumber: nextVersionNumber,
      s3_key: s3Key,
      fileName,
      diffHtml,
      uploadedAt: new Date(),
      uploadedBy: req.user?.userId || 'system',
    };

    await docsCollection.updateOne(
      { _id: new ObjectId(docId) },
      {
        $set: {
          version: nextVersionNumber,
          s3_key: s3Key,
          name: fileName,
          raw_text: rawText,
        },
        $push: {
          versions: newVersion,
        },
      }
    );

    return res.status(201).json({
      message: 'New version uploaded successfully.',
      version: nextVersionNumber,
      diffHtml,
      s3Url,
    });
  } catch (error: any) {
    console.error('Error uploading version:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Get version list and diff for a document
router.get('/:matterId/documents/:docId/versions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { matterId, docId } = req.params;
  const orgId = req.user?.orgId || 'org_default_firm';

  try {
    const docsCollection = await dbService.getCollection('documents') as any;
    const document = await docsCollection.findOne({
      _id: new ObjectId(docId),
      org_id: orgId,
      matter_id: new ObjectId(matterId),
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.json({
      currentVersion: document.version || 1,
      versions: document.versions || [],
    });
  } catch (error: any) {
    console.error('Error fetching version history:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
