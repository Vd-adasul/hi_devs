import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { DbService } from '../services/db.service.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { EmailService } from '../services/email.service.js';
import { S3Service } from '../services/s3.service.js';
import { IndianKanoonService } from '../services/indiankanoon.service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const dbService = DbService.getInstance();
const emailService = EmailService.getInstance();
const s3Service = S3Service.getInstance();
const indianKanoonService = IndianKanoonService.getInstance();

function orgFilter(orgId: string) {
  return { $or: [{ org_id: orgId }, { orgId }] };
}

function safeObjectId(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildS3Url(key: string | null | undefined) {
  if (!key) return null;
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return null;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function versionIdFor(docId: string, versionNumber: number) {
  return `${docId}:v${versionNumber}`;
}

function mapDocVersion(docId: string, version: any, fallbackNumber: number) {
  const versionNumber = Number(version?.versionNumber ?? fallbackNumber);
  return {
    id: version?.id ?? versionIdFor(docId, versionNumber),
    versionNumber,
    s3Key: version?.s3_key ?? version?.s3Key ?? null,
    mimeType: version?.mimeType ?? 'application/pdf',
    createdAt: (version?.uploadedAt ?? version?.createdAt ?? new Date()).toISOString(),
    createdByName: version?.uploadedByName ?? version?.authorName ?? null,
    changeNote: version?.changeNote ?? null,
    clauseFlags: version?.clauseFlags ?? {},
  };
}

function riskBand(score: number | null | undefined) {
  if (score == null) return 'none';
  if (score >= 0.67) return 'high';
  if (score >= 0.34) return 'medium';
  return 'low';
}

function mapDocumentToContract(doc: any) {
  const id = doc._id.toString();
  const versions = Array.isArray(doc.versions) && doc.versions.length > 0
    ? doc.versions.map((v: any, idx: number) => mapDocVersion(id, v, idx + 1)).sort((a: any, b: any) => b.versionNumber - a.versionNumber)
    : [{
        id: versionIdFor(id, 1),
        versionNumber: 1,
        s3Key: doc.s3_key ?? null,
        mimeType: 'application/pdf',
        createdAt: (doc.created_at ?? new Date()).toISOString(),
        createdByName: null,
        changeNote: null,
        clauseFlags: {},
      }];

  const status = doc.status ?? 'DRAFT';
  const analysisStatus =
    doc.analysisStatus ??
    (doc.status === 'processing' ? 'ANALYZING' :
     doc.status === 'failed' ? 'FAILED' :
     doc.raw_text ? 'DONE' : 'PENDING');

  const summary = doc.summary ?? doc.metadata?.summary ?? null;
  const counterpartyName = doc.counterparty_name ?? doc.counterpartyName ?? null;
  const counterparty = doc.counterparty_id
    ? { id: String(doc.counterparty_id), name: counterpartyName ?? 'Counterparty' }
    : (counterpartyName ? { id: null, name: counterpartyName } : null);

  return {
    id,
    title: doc.name ?? doc.title ?? 'Untitled contract',
    type: doc.type ?? 'OTHER',
    status,
    analysisStatus,
    analysisError: doc.analysisError ?? null,
    summary,
    plainText: doc.raw_text ?? '',
    rawText: doc.raw_text ?? '',
    keyTerms: doc.keyTerms ?? {},
    fieldConfidence: doc.fieldConfidence ?? {},
    riskFactors: doc.riskFactors ?? [],
    tags: doc.tags ?? [],
    metadata: doc.metadata ?? {},
    versions,
    currentVersionId: versions[0]?.id ?? null,
    currentVersionNumber: versions[0]?.versionNumber ?? 1,
    updatedAt: (doc.updated_at ?? doc.created_at ?? new Date()).toISOString(),
    createdAt: (doc.created_at ?? new Date()).toISOString(),
    effectiveDate: doc.effective_date ?? doc.effectiveDate ?? null,
    expiryDate: doc.expiry_date ?? doc.expiryDate ?? null,
    jurisdiction: doc.jurisdiction ?? null,
    riskScore: typeof doc.riskScore === 'number' ? doc.riskScore : null,
    overallConfidence: typeof doc.overallConfidence === 'number' ? doc.overallConfidence : null,
    value: doc.contract_value ?? doc.value ?? null,
    currency: doc.currency ?? 'USD',
    contractNumber: doc.contractNumber ?? null,
    counterpartyName,
    counterparty,
    owner: doc.owner_name ? { id: doc.owner_id ?? null, name: doc.owner_name } : null,
    attachments: doc.attachments ?? [],
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

async function getOrgUsers(orgId: string) {
  const usersCollection = await dbService.getCollection('users');
  const users = await usersCollection.find(orgFilter(orgId)).toArray();
  return users.map((u: any) => ({
    id: u._id.toString(),
    email: u.email,
    name: u.name ?? u.email?.split('@')[0] ?? 'User',
    role: u.role ?? u.roles?.[0] ?? 'lawyer',
    roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [String(u.role ?? 'lawyer').toUpperCase()],
    status: u.status ?? 'ACTIVE',
    lastActiveAt: u.lastActiveAt ?? u.updated_at ?? u.created_at ?? null,
  }));
}

async function getContractsForOrg(orgId: string, extraFilter: Record<string, unknown> = {}) {
  const docsCollection = await dbService.getCollection('documents');
  return docsCollection.find({ ...orgFilter(orgId), ...extraFilter }).toArray();
}

function filterContracts(docs: any[], query: Record<string, any>) {
  const q = String(query.q ?? query.search ?? '').trim().toLowerCase();
  return docs.filter((doc: any) => {
    if (query.type && doc.type !== query.type) return false;
    if (query.status && doc.status !== query.status) return false;
    if (query.counterpartyId && String(doc.counterparty_id ?? '') !== String(query.counterpartyId)) return false;
    if (query.counterpartyName && String(doc.counterparty_name ?? '').toLowerCase() !== String(query.counterpartyName).toLowerCase()) return false;
    if (query.expiryDateTo) {
      const expiry = asDate(doc.expiry_date ?? doc.expiryDate);
      const limitDate = asDate(query.expiryDateTo);
      if (!expiry || !limitDate || expiry.getTime() > limitDate.getTime()) return false;
    }
    if (query.riskScoreMin != null && Number(doc.riskScore ?? 0) < Number(query.riskScoreMin)) return false;
    if (query.riskScoreMax != null && Number(doc.riskScore ?? 0) > Number(query.riskScoreMax)) return false;
    if (!q) return true;
    return [doc.name, doc.counterparty_name, doc.raw_text, doc.summary].some((v) => String(v ?? '').toLowerCase().includes(q));
  });
}

async function getApprovalRows(orgId: string) {
  const instancesCollection = await dbService.getCollection('approvalInstances');
  const docsCollection = await dbService.getCollection('documents');
  const users = await getOrgUsers(orgId);
  const userById = new Map(users.map((u) => [u.id, u]));
  const instances = await instancesCollection.find(orgFilter(orgId)).sort({ submittedAt: -1, submitted_at: -1 }).toArray();
  const rows = await Promise.all(instances.map(async (inst: any) => {
    const doc = inst.contractId ? await docsCollection.findOne({ _id: inst.contractId }) : null;
    const currentIdx = Number(inst.currentStepIndex ?? 0);
    const currentStep = inst.steps?.[currentIdx] ?? null;
    const submittedBy = inst.submittedBy ? userById.get(String(inst.submittedBy)) : null;
    const submittedAt = inst.submittedAt ?? inst.submitted_at ?? new Date();
    const daysWaiting = Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000));
    return {
      instanceId: inst._id.toString(),
      id: inst._id.toString(),
      contract: doc ? {
        id: doc._id.toString(),
        title: doc.name ?? 'Untitled contract',
        type: doc.type ?? 'OTHER',
        status: doc.status ?? 'DRAFT',
        value: doc.contract_value ?? null,
        currency: doc.currency ?? 'USD',
        counterpartyName: doc.counterparty_name ?? null,
      } : null,
      status: String(inst.status ?? 'pending').toUpperCase(),
      submittedAt: new Date(submittedAt).toISOString(),
      submittedByName: submittedBy?.name ?? 'Unknown',
      currentStepOrder: currentStep?.order ?? currentIdx + 1,
      currentStepName: currentStep?.name ?? currentStep?.role ?? 'Approval',
      currentApproverName: currentStep?.approverName ?? null,
      currentApproverEmail: currentStep?.approverEmail ?? null,
      waitingDays: daysWaiting,
      totalSteps: inst.steps?.length ?? 0,
      approvalRecommendation: inst.approvalRecommendation ?? null,
      instance: {
        id: inst._id.toString(),
        status: String(inst.status ?? 'pending').toUpperCase(),
        submittedAt: new Date(submittedAt).toISOString(),
        submittedByName: submittedBy?.name ?? 'Unknown',
        aiSummary: inst.aiSummary ?? null,
        keyRisks: inst.keyRisks ?? [],
        nonStandardTerms: inst.nonStandardTerms ?? [],
        approvalRecommendation: inst.approvalRecommendation ?? null,
      },
    };
  }));
  return rows;
}

async function getApprovalQueue(orgId: string, userId: string) {
  const usersCollection = await dbService.getCollection('users');
  const user = safeObjectId(userId)
    ? await usersCollection.findOne({ _id: safeObjectId(userId)! })
    : await usersCollection.findOne({ email: userId });
  const myEmail = user?.email ?? userId;
  const rows = await getApprovalRows(orgId);
  return rows
    .filter((row) => row.status === 'PENDING' && row.currentApproverEmail?.toLowerCase() === myEmail.toLowerCase())
    .map((row) => ({
      stepId: `${row.instanceId}:${row.currentStepOrder}`,
      instanceId: row.instanceId,
      stepOrder: row.currentStepOrder,
      stepName: row.currentStepName ?? 'Approval',
      status: row.status,
      contract: row.contract,
      instance: row.instance,
    }));
}

router.post('/auth/logout', (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

router.post('/auth/request-password-reset', async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '').trim();
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  return res.json({ ok: true, message: `If ${email} exists, a reset email has been queued.` });
});

router.get('/users', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const users = await getOrgUsers(orgId);
  return res.json(users);
});

router.get('/dashboard', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const userId = req.user?.userId ?? 'system';
  const [contracts, requests, approvals, reviewQueue] = await Promise.all([
    getContractsForOrg(orgId),
    dbService.getCollection('requests').then((c) => c.find(orgFilter(orgId)).toArray()),
    getApprovalQueue(orgId, userId),
    dbService.getCollection('reviewQueue').then((c) => c.find(orgFilter(orgId)).toArray()),
  ]);
  const now = Date.now();
  const in30 = now + 30 * 86_400_000;
  const renewals = contracts.filter((c: any) => {
    const expiry = asDate(c.expiry_date ?? c.expiryDate);
    return expiry && expiry.getTime() <= in30 && expiry.getTime() >= now;
  });
  const recentContracts = [...contracts]
    .sort((a: any, b: any) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
    .slice(0, 8)
    .map((c: any) => ({
      id: c._id.toString(),
      actorId: c.owner_id ?? 'system',
      actorName: c.owner_name ?? 'System',
      actorInitials: String(c.owner_name ?? 'System').split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'SY',
      verb: c.updated_at ? 'updated' : 'created',
      entityType: 'contract',
      entityId: c._id.toString(),
      entityTitle: c.name ?? 'Untitled contract',
      entityStatus: c.status ?? 'DRAFT',
      secondary: c.counterparty_name ? `Counterparty: ${c.counterparty_name}` : undefined,
      createdAt: new Date(c.updated_at ?? c.created_at ?? new Date()).toISOString(),
    }));
  const yourRenewals = renewals.slice(0, 5).map((c: any) => {
    const expiry = asDate(c.expiry_date ?? c.expiryDate);
    return {
      id: c._id.toString(),
      title: c.name ?? 'Untitled contract',
      type: c.type ?? 'OTHER',
      status: c.status ?? 'EXECUTED',
      counterpartyName: c.counterparty_name ?? null,
      value: c.contract_value ?? null,
      currency: c.currency ?? 'USD',
      expiryDate: expiry?.toISOString() ?? null,
      daysToExpiry: expiry ? Math.max(-999, Math.floor((expiry.getTime() - now) / 86_400_000)) : null,
    };
  });

  return res.json({
    activeContracts: contracts.length,
    openRequests: requests.filter((r: any) => !['DONE', 'COMPLETED', 'CLOSED'].includes(String(r.status ?? '').toUpperCase())).length,
    pendingApprovals: approvals.length,
    orgPendingApprovals: reviewQueue.filter((r: any) => String(r.status ?? '').toLowerCase() === 'pending').length + approvals.length,
    expiringSoon: renewals.length,
    yourDay: {
      approvalsWaiting: approvals.length,
      requestsWaiting: requests.filter((r: any) => String(r.status ?? '').toLowerCase() === 'pending').length,
      contractsExpiring: renewals.length,
      draftsInProgress: contracts.filter((c: any) => String(c.status ?? '').toUpperCase() === 'DRAFT').length,
      negotiationsInFlight: contracts.filter((c: any) => String(c.status ?? '').toUpperCase() === 'UNDER_NEGOTIATION').length,
      total: approvals.length + renewals.length,
      negotiations: contracts
        .filter((c: any) => String(c.status ?? '').toUpperCase() === 'UNDER_NEGOTIATION')
        .slice(0, 5)
        .map((c: any) => ({
          id: c._id.toString(),
          title: c.name ?? 'Untitled contract',
          type: c.type ?? 'OTHER',
          status: c.status ?? 'UNDER_NEGOTIATION',
          counterpartyName: c.counterparty_name ?? null,
          value: c.contract_value ?? null,
          currency: c.currency ?? 'USD',
          riskScore: c.riskScore ?? null,
          daysSinceUpdate: Math.max(0, Math.floor((now - new Date(c.updated_at ?? c.created_at ?? now).getTime()) / 86_400_000)),
        })),
      renewals: yourRenewals,
    },
    recentActivity: recentContracts,
  });
});

router.get('/search/facets', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const contracts = await getContractsForOrg(orgId);
  const bucket = (keyFn: (doc: any) => string | null) => {
    const map = new Map<string, number>();
    for (const c of contracts) {
      const key = keyFn(c);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([key, doc_count]) => ({ key, doc_count }));
  };
  const riskRanges = [
    { key: 'high', doc_count: contracts.filter((c: any) => (c.riskScore ?? 0) >= 0.67).length },
    { key: 'medium', doc_count: contracts.filter((c: any) => (c.riskScore ?? 0) >= 0.34 && (c.riskScore ?? 0) < 0.67).length },
    { key: 'low', doc_count: contracts.filter((c: any) => (c.riskScore ?? 0) < 0.34).length },
  ];
  return res.json({
    types: bucket((c) => c.type ?? 'OTHER'),
    statuses: bucket((c) => c.status ?? 'DRAFT'),
    jurisdictions: bucket((c) => c.jurisdiction ?? null),
    riskRanges,
    clauseFlags: {},
  });
});

router.post('/search/advanced', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const docs = await getContractsForOrg(orgId);
  const filtered = filterContracts(docs, req.body ?? {});
  const limit = Number(req.body?.limit ?? 50);
  return res.json({
    data: filtered
      .sort((a: any, b: any) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
      .slice(0, limit)
      .map(mapDocumentToContract),
    total: filtered.length,
    highlights: {},
  });
});

router.get('/contracts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const limit = Number(req.query.limit ?? 50);
  const docs = await getContractsForOrg(orgId);
  const filtered = filterContracts(docs, req.query as Record<string, any>);
  const mapped = filtered
    .sort((a: any, b: any) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
    .slice(0, limit)
    .map(mapDocumentToContract);
  return res.json({ data: mapped, total: filtered.length, highlights: {} });
});

router.post('/contracts/upload', authMiddleware, upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!req.file) return res.status(400).json({ error: 'File is required.' });
  const title = String(req.body.title ?? req.file.originalname.replace(/\.[^.]+$/, '')).trim();
  const type = String(req.body.type ?? 'OTHER');
  const counterpartyName = String(req.body.counterpartyName ?? '').trim() || null;
  const parentContractId = String(req.body.parentContractId ?? '').trim() || null;
  const relationshipType = String(req.body.relationshipType ?? '').trim() || null;
  const key = `${orgId}/contracts/${Date.now()}-${req.file.originalname}`;
  await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype || 'application/octet-stream');
  const docsCollection = await dbService.getCollection('documents');
  const now = new Date();
  const payload: any = {
    org_id: orgId,
    orgId,
    name: title,
    type,
    status: 'DRAFT',
    analysisStatus: 'DONE',
    counterparty_name: counterpartyName,
    s3_key: key,
    file_size: req.file.size,
    raw_text: req.file.mimetype.startsWith('text/') ? req.file.buffer.toString('utf8') : '',
    versions: [{
      versionNumber: 1,
      s3_key: key,
      mimeType: req.file.mimetype,
      fileName: req.file.originalname,
      uploadedAt: now,
      changeNote: 'Initial upload',
    }],
    created_at: now,
    updated_at: now,
    metadata: {},
  };
  if (parentContractId && ObjectId.isValid(parentContractId)) {
    payload.parent_contract_id = new ObjectId(parentContractId);
    payload.relationshipType = relationshipType ?? 'related';
  }
  const result = await docsCollection.insertOne(payload);
  return res.status(201).json({ id: result.insertedId.toString(), contractId: result.insertedId.toString() });
});

router.post('/contracts/bulk-import', authMiddleware, upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (rows.length < 2) return res.status(400).json({ error: 'CSV must contain a header row and at least one data row.' });
  const headers = rows[0];
  const docsCollection = await dbService.getCollection('documents');
  const results = [];
  let created = 0;
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const record = Object.fromEntries(headers.map((h, idx) => [h, values[idx] ?? '']));
    const title = String(record.title ?? '').trim();
    if (!title) {
      results.push({ row: i + 1, ok: false, error: 'title is required' });
      continue;
    }
    const doc: any = {
      org_id: orgId,
      orgId,
      name: title,
      type: String(record.type ?? 'OTHER') || 'OTHER',
      status: String(record.status ?? 'DRAFT') || 'DRAFT',
      analysisStatus: 'DONE',
      counterparty_name: String(record.counterpartyName ?? '').trim() || null,
      contract_value: record.value ? Number(record.value) : null,
      currency: String(record.currency ?? 'USD') || 'USD',
      effective_date: String(record.effectiveDate ?? '').trim() || null,
      expiry_date: String(record.expiryDate ?? '').trim() || null,
      jurisdiction: String(record.jurisdiction ?? '').trim() || null,
      raw_text: '',
      versions: [],
      created_at: new Date(),
      updated_at: new Date(),
      metadata: {},
    };
    const insertRes = await docsCollection.insertOne(doc);
    created++;
    results.push({ row: i + 1, ok: true, id: insertRes.insertedId.toString(), title });
  }
  return res.json({ total: rows.length - 1, created, failed: results.filter((r: any) => !r.ok).length, results });
});

router.get('/contracts/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const objectId = safeObjectId(req.params.id);
  if (!objectId) return res.status(404).json({ error: 'Contract not found.' });
  const docsCollection = await dbService.getCollection('documents');
  const doc = await docsCollection.findOne({ _id: objectId, ...orgFilter(orgId) });
  if (!doc) return res.status(404).json({ error: 'Contract not found.' });
  return res.json(mapDocumentToContract(doc));
});

router.patch('/contracts/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const objectId = safeObjectId(req.params.id);
  if (!objectId) return res.status(404).json({ error: 'Contract not found.' });
  const patch: any = { updated_at: new Date() };
  const allowed = ['status', 'summary', 'jurisdiction', 'contractNumber'];
  for (const key of allowed) if (req.body[key] !== undefined) patch[key] = req.body[key];
  if (req.body.matterId !== undefined) patch.matter_id = req.body.matterId ? safeObjectId(req.body.matterId) : null;
  await dbService.getCollection('documents').then((c) => c.updateOne({ _id: objectId, ...orgFilter(orgId) }, { $set: patch }));
  return res.json({ ok: true });
});

router.get('/contracts/:id/versions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const doc = objectId ? await dbService.getCollection('documents').then((c) => c.findOne({ _id: objectId, ...orgFilter(orgId) })) : null;
  if (!doc) return res.status(404).json({ error: 'Contract not found.' });
  const versions = mapDocumentToContract(doc).versions;
  return res.json({ data: versions, versions });
});

router.get('/contracts/:id/timeline', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const doc = objectId ? await dbService.getCollection('documents').then((c) => c.findOne({ _id: objectId, ...orgFilter(orgId) })) : null;
  if (!doc) return res.status(404).json({ error: 'Contract not found.' });
  const events = [
    { id: `${doc._id}:created`, action: 'CREATED', createdAt: new Date(doc.created_at ?? new Date()).toISOString() },
    { id: `${doc._id}:updated`, action: 'UPDATED', createdAt: new Date(doc.updated_at ?? doc.created_at ?? new Date()).toISOString() },
  ];
  return res.json({ data: events });
});

router.get('/contracts/:id/clauses', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!objectId) return res.status(404).json({ error: 'Contract not found.' });
  const clauses = await dbService.getCollection('clauses').then((c) => c.find({ document_id: objectId, ...orgFilter(orgId) }).toArray());
  const mapped = clauses.map((c: any) => ({
    id: c._id.toString(),
    clauseType: c.category ?? 'general',
    reviewState: c.reviewState ?? 'unreviewed',
    riskRating: c.risk_level ? String(c.risk_level).toUpperCase() : null,
    sectionRef: c.sectionRef ?? null,
    text: c.text ?? c.raw_text ?? '',
    quote: c.quote ?? null,
  }));
  return res.json({ data: mapped });
});

router.patch('/contracts/clauses/:clauseId/review-state', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const clauseId = safeObjectId(req.params.clauseId);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!clauseId) return res.status(404).json({ error: 'Clause not found.' });
  await dbService.getCollection('clauses').then((c) => c.updateOne({ _id: clauseId, ...orgFilter(orgId) }, { $set: { reviewState: req.body.state ?? 'unreviewed' } }));
  return res.json({ ok: true });
});

router.get('/contracts/:id/precedents', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ data: [] });
});

router.get('/contracts/:id/family', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const objectId = safeObjectId(req.params.id);
  if (!objectId) return res.json({ parent: null, children: [] });
  const docsCollection = await dbService.getCollection('documents');
  const [doc, children] = await Promise.all([
    docsCollection.findOne({ _id: objectId, ...orgFilter(orgId) }),
    docsCollection.find({ parent_contract_id: objectId, ...orgFilter(orgId) }).toArray(),
  ]);
  let parent = null;
  if (doc?.parent_contract_id) {
    const parentDoc = await docsCollection.findOne({ _id: doc.parent_contract_id });
    if (parentDoc) parent = { id: parentDoc._id.toString(), title: parentDoc.name ?? 'Untitled contract' };
  }
  return res.json({
    parent,
    children: children.map((c: any) => ({ id: c._id.toString(), title: c.name ?? 'Untitled contract', relationshipType: c.relationshipType ?? 'related' })),
  });
});

router.get('/contracts/:id/versions/:v1/diff/:v2', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ html: '<p>No diff available yet.</p>', summary: [] });
});

router.post('/contracts/:id/html-version', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!objectId) return res.status(404).json({ error: 'Contract not found.' });
  const docsCollection = await dbService.getCollection('documents');
  const doc: any = await docsCollection.findOne({ _id: objectId, ...orgFilter(orgId) });
  if (!doc) return res.status(404).json({ error: 'Contract not found.' });
  const nextVersion = (doc.versions?.length ?? 0) + 1;
  await docsCollection.updateOne(
    { _id: objectId },
    {
      $set: { updated_at: new Date(), raw_text: req.body.htmlContent ?? doc.raw_text ?? '' },
      $push: {
        versions: {
          versionNumber: nextVersion,
          createdAt: new Date(),
          uploadedAt: new Date(),
          changeNote: req.body.changeNote ?? 'Edited in app',
          mimeType: 'text/html',
          s3_key: doc.s3_key ?? null,
        },
      } as any,
    },
  );
  return res.json({ ok: true, versionNumber: nextVersion });
});

router.post('/contracts/:id/analyze', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!objectId) return res.status(404).json({ error: 'Contract not found.' });

  const docsCollection = await dbService.getCollection('documents');
  const document: any = await docsCollection.findOne({ _id: objectId, ...orgFilter(orgId) });
  if (!document) return res.status(404).json({ error: 'Contract not found.' });

  // Mark as analyzing immediately, respond to client
  await docsCollection.updateOne({ _id: objectId }, { $set: { analysisStatus: 'ANALYZING', updated_at: new Date() } });
  res.json({ ok: true, analysisStatus: 'ANALYZING' });

  // ✅ Run AI analysis in background
  setImmediate(async () => {
    try {
      const clausesCollection = await dbService.getCollection('clauses');
      const rawText = document.raw_text ?? '';
      if (!rawText.trim()) {
        await docsCollection.updateOne({ _id: objectId }, { $set: { analysisStatus: 'DONE', updated_at: new Date() } });
        return;
      }

      // Idempotency: skip if clauses already exist
      const existingCount = await clausesCollection.countDocuments({ document_id: objectId });
      if (existingCount > 0) {
        await docsCollection.updateOne({ _id: objectId }, { $set: { analysisStatus: 'DONE', updated_at: new Date() } });
        return;
      }

      const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
      if (!geminiKey) {
        await docsCollection.updateOne({ _id: objectId }, { $set: { analysisStatus: 'FAILED', analysisError: 'GEMINI_API_KEY not configured', updated_at: new Date() } });
        return;
      }

      const prompt = `Analyze this legal contract. Break it into clauses. Return ONLY a valid JSON array of objects with: category (string), rawText (string), pageNumber (number). No markdown, no backticks.

Contract:
---
${rawText.substring(0, 12000)}
---`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
      );
      const geminiData: any = await geminiRes.json();
      const responseText = (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').replace(/```json/g, '').replace(/```/g, '').trim();

      let clauses: any[] = [];
      try { clauses = JSON.parse(responseText); } catch { clauses = [{ category: 'General', rawText: rawText.substring(0, 500), pageNumber: 1 }]; }

      const matterId = document.matter_id ?? null;
      const clauseRecords = clauses.map((c: any) => ({
        org_id: orgId,
        document_id: objectId,
        matter_id: matterId,
        category: c.category ?? 'General',
        raw_text: c.rawText ?? c.raw_text ?? '',
        page_number: typeof c.pageNumber === 'number' ? c.pageNumber : 1,
        created_at: new Date(),
      }));

      if (clauseRecords.length > 0) await clausesCollection.insertMany(clauseRecords);
      await docsCollection.updateOne({ _id: objectId }, { $set: { analysisStatus: 'DONE', updated_at: new Date() } });
      console.log(`[Analyze] Extracted ${clauseRecords.length} clauses for contract ${objectId}`);
    } catch (err: any) {
      console.error(`[Analyze] Failed for contract ${objectId}:`, err);
      await dbService.getCollection('documents').then((c) => c.updateOne({ _id: objectId }, { $set: { analysisStatus: 'FAILED', analysisError: err.message, updated_at: new Date() } }));
    }
  });
});


router.post('/contracts/:id/cancel-analysis', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!objectId) return res.status(404).json({ error: 'Contract not found.' });
  await dbService.getCollection('documents').then((c) => c.updateOne({ _id: objectId, ...orgFilter(orgId) }, { $set: { analysisStatus: 'FAILED', analysisError: 'Cancelled by user', updated_at: new Date() } }));
  return res.json({ ok: true });
});

router.post('/contracts/:id/retype', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  await dbService.getCollection('documents').then((c) => c.updateOne({ _id: objectId, ...orgFilter(orgId) }, { $set: { type: req.body.contractType ?? 'OTHER', updated_at: new Date() } }));
  return res.json({ ok: true });
});

router.post('/contracts/:id/split', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const docsCollection = await dbService.getCollection('documents');
  const parent = objectId ? await docsCollection.findOne({ _id: objectId, ...orgFilter(orgId) }) : null;
  if (!parent) return res.status(404).json({ error: 'Contract not found.' });
  const splits = Array.isArray(req.body.splits) ? req.body.splits : [];
  const createdIds = [];
  for (const split of splits) {
    const child = {
      ...parent,
      _id: new ObjectId(),
      name: split.title ?? `${parent.name} part`,
      type: split.type ?? parent.type ?? 'OTHER',
      parent_contract_id: parent._id,
      relationshipType: 'split',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await docsCollection.insertOne(child);
    createdIds.push(child._id.toString());
  }
  return res.json({ ok: true, createdIds });
});

router.post('/contracts/:id/renewal-advice', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const docsCollection = await dbService.getCollection('documents');
  const doc: any = objectId ? await docsCollection.findOne({ _id: objectId, ...orgFilter(orgId) }) : null;
  if (!doc) return res.status(404).json({ error: 'Contract not found.' });
  const advice = {
    recommendation: 'renew',
    confidence: 'medium',
    rationale: `Generated from current contract metadata for ${doc.name ?? 'this contract'}.`,
    negotiationPoints: [],
    riskFlags: [],
    timeline: 'Review commercial terms and notice periods before renewal.',
    generatedAt: new Date().toISOString(),
  };
  await docsCollection.updateOne({ _id: objectId }, { $set: { 'metadata.renewalAdvice': advice, updated_at: new Date() } });
  return res.json({ ok: true, advice });
});

router.post('/contracts/:id/renewal-decision', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  await dbService.getCollection('documents').then((c) => c.updateOne(
    { _id: objectId, ...orgFilter(orgId) },
    { $set: { 'metadata.renewalDecision': req.body.decision ?? null, renewal_decision: req.body.decision ?? null, updated_at: new Date() } },
  ));
  return res.json({ ok: true, decision: req.body.decision ?? null });
});

router.get('/contracts/:id/comments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const contractId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!contractId) return res.status(404).json({ error: 'Contract not found.' });
  const comments = await dbService.getCollection('comments').then((c) => c.find({ contractId, ...orgFilter(orgId) }).sort({ created_at: 1 }).toArray());
  return res.json({ data: comments.map((c: any) => ({ ...c, id: c._id.toString(), _id: c._id.toString() })) });
});

router.post('/contracts/:id/comments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const contractId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!contractId) return res.status(404).json({ error: 'Contract not found.' });
  const users = await getOrgUsers(orgId);
  const me = users.find((u) => u.id === req.user?.userId) ?? { name: 'Unknown', email: req.user?.userId ?? 'unknown' };
  const doc = {
    org_id: orgId,
    orgId,
    contractId,
    clauseRef: req.body.clauseRef ?? null,
    clauseId: req.body.clauseId ?? null,
    text: req.body.text ?? req.body.body ?? '',
    body: req.body.body ?? req.body.text ?? '',
    userId: req.user?.userId ?? 'system',
    userName: me.name,
    authorName: me.name,
    resolved: false,
    thread: [],
    created_at: new Date(),
  };
  const result = await dbService.getCollection('comments').then((c) => c.insertOne(doc));
  return res.status(201).json({ data: { ...doc, id: result.insertedId.toString(), _id: result.insertedId.toString() } });
});

router.patch('/contracts/:id/comments/:commentId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const commentId = safeObjectId(req.params.commentId);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!commentId) return res.status(404).json({ error: 'Comment not found.' });
  await dbService.getCollection('comments').then((c) => c.updateOne({ _id: commentId, ...orgFilter(orgId) }, { $set: { resolved: !!req.body.resolved } }));
  return res.json({ ok: true });
});

router.delete('/contracts/:id/comments/:commentId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const commentId = safeObjectId(req.params.commentId);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!commentId) return res.status(404).json({ error: 'Comment not found.' });
  await dbService.getCollection('comments').then((c) => c.deleteOne({ _id: commentId, ...orgFilter(orgId) }));
  return res.json({ ok: true });
});

router.post('/contracts/:id/share', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const token = crypto.randomBytes(20).toString('hex');
  const expiresAt = new Date(Date.now() + Number(req.body.expiresInHours ?? 168) * 3_600_000);
  const record = {
    org_id: orgId,
    contractId: objectId,
    token,
    label: req.body.label ?? null,
    permissions: req.body.permissions ?? ['read'],
    expiresAt,
    createdAt: new Date(),
    viewCount: 0,
  };
  const result = await dbService.getCollection('shareLinks').then((c) => c.insertOne(record));
  return res.status(201).json({
    data: { ...record, id: result.insertedId.toString() },
    portalUrl: `${req.headers.origin ?? 'http://localhost:5173'}/portal/${token}`,
  });
});

router.get('/contracts/:id/share', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const objectId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const links = await dbService.getCollection('shareLinks').then((c) => c.find({ contractId: objectId, ...orgFilter(orgId) }).sort({ createdAt: -1 }).toArray());
  return res.json({ data: links.map((l: any) => ({ ...l, id: l._id.toString() })) });
});

router.delete('/contracts/:id/share/:linkId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const linkId = safeObjectId(req.params.linkId);
  await dbService.getCollection('shareLinks').then((c) => c.deleteOne({ _id: linkId, ...orgFilter(orgId) }));
  return res.json({ ok: true });
});

// ✅ NEW: GET /contracts/:id/obligations — return stored obligations from DB
router.get('/contracts/:id/obligations', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const contractId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!contractId) return res.status(404).json({ error: 'Contract not found.' });

  try {
    const obligationsCollection = await dbService.getCollection('obligations');
    const rawList = await obligationsCollection.find({ document_id: contractId, ...orgFilter(orgId) }).sort({ created_at: -1 }).toArray();

    const mapped = rawList.map((o: any) => ({
      id: o._id.toString(),
      type: o.type ?? o.obligation_type ?? 'other',
      description: o.description ?? o.raw_text ?? '',
      owner: o.owner ?? o.party ?? 'Party',
      dueDate: o.due_date ? new Date(o.due_date).toISOString() : null,
      recurrence: o.recurrence ?? 'once',
      trigger: o.trigger ?? null,
      quote: o.quote ?? o.raw_text ?? '',
      severity: o.severity ?? o.risk_level ?? 'low',
      sectionRef: o.section_ref ?? null,
      status: (o.status ?? 'OPEN').toUpperCase(),
      completedAt: o.completedAt ? new Date(o.completedAt).toISOString() : null,
      notifiedAt: o.notifiedAt ? new Date(o.notifiedAt).toISOString() : null,
    }));

    return res.json({ data: mapped, summary: null, extractedAt: rawList[0]?.created_at?.toISOString() ?? null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: POST /contracts/:id/extract-obligations — trigger on-demand AI extraction
router.post('/contracts/:id/extract-obligations', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const contractId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!contractId) return res.status(404).json({ error: 'Contract not found.' });

  try {
    const docsCollection = await dbService.getCollection('documents');
    const document: any = await docsCollection.findOne({ _id: contractId, ...orgFilter(orgId) });
    if (!document) return res.status(404).json({ error: 'Contract not found.' });

    const clausesCollection = await dbService.getCollection('clauses');
    const obligationsCollection = await dbService.getCollection('obligations');

    // Get existing clauses if available
    const existingClauses = await clausesCollection.find({ document_id: contractId }).toArray();
    let clausesText = existingClauses.length > 0
      ? existingClauses.map((c: any) => `[${c.category}]: ${c.raw_text}`).join('\n')
      : (document.raw_text ?? '').substring(0, 8000);

    if (!clausesText.trim()) {
      return res.json({ ok: true, obligations: [], summary: 'No text content available to extract obligations from.' });
    }

    // Use Gemini REST API to extract obligations (same pattern as embedding.ts)
    const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
    if (!geminiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured.' });
    }

    const prompt = `You are a legal obligation extractor. Given contract clauses, extract all legal obligations.
For each obligation, return a JSON object with:
- type: one of [payment, sla, renewal, audit, report, termination, compliance, other]
- description: clear obligation description
- owner: which party owns this obligation
- dueDate: ISO date string or null
- recurrence: once, monthly, quarterly, annual, or on_trigger
- trigger: triggering condition if no fixed date (or null)
- quote: verbatim text from contract
- severity: high, medium, or low

Return ONLY a valid JSON array. No markdown, no backticks.

Contract text:
---
${clausesText}
---`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const geminiData: any = await geminiRes.json();
    const responseText = (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
      .replace(/```json/g, '').replace(/```/g, '').trim();


    let obligations: any[] = [];
    try {
      obligations = JSON.parse(responseText);
    } catch {
      obligations = [{ type: 'other', description: 'Review obligations manually', owner: 'All Parties', dueDate: null, recurrence: 'once', trigger: null, quote: '', severity: 'low' }];
    }

    // Store in DB (replacing previous extractions for this contract)
    await obligationsCollection.deleteMany({ document_id: contractId, org_id: orgId });
    const matterId = document.matter_id;
    const records = obligations.map((o: any) => ({
      org_id: orgId,
      document_id: contractId,
      matter_id: matterId,
      type: o.type ?? 'other',
      description: o.description ?? '',
      owner: o.owner ?? 'Party',
      due_date: o.dueDate ? new Date(o.dueDate) : null,
      recurrence: o.recurrence ?? 'once',
      trigger: o.trigger ?? null,
      quote: o.quote ?? '',
      raw_text: o.quote ?? o.description ?? '',
      severity: o.severity ?? 'low',
      section_ref: o.sectionRef ?? null,
      status: 'OPEN',
      created_at: new Date(),
    }));

    if (records.length > 0) await obligationsCollection.insertMany(records);

    const mapped = records.map((r: any, idx: number) => ({
      id: obligations[idx]?.id ?? `new_${idx}`,
      type: r.type,
      description: r.description,
      owner: r.owner,
      dueDate: r.due_date?.toISOString() ?? null,
      recurrence: r.recurrence,
      trigger: r.trigger,
      quote: r.quote,
      severity: r.severity,
      sectionRef: r.section_ref,
      status: 'OPEN',
      completedAt: null,
      notifiedAt: null,
    }));

    return res.json({ ok: true, obligations: mapped, summary: `Extracted ${mapped.length} obligations.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/contracts/:id/send-for-signature', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {

  const contractId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!contractId) return res.status(404).json({ error: 'Contract not found.' });
  const docsCollection = await dbService.getCollection('documents');
  const document: any = await docsCollection.findOne({ _id: contractId, ...orgFilter(orgId) });
  if (!document) return res.status(404).json({ error: 'Contract not found.' });
  const signers = Array.isArray(req.body.signers) ? req.body.signers : [];
  if (signers.length === 0) return res.status(400).json({ error: 'At least one signer is required.' });
  const counterpartyId = document.counterparty_id ? new ObjectId(document.counterparty_id) : null;
  const normalizedSigners = signers.map((s: any, idx: number) => ({
    id: new ObjectId().toString(),
    name: s.name,
    email: s.email,
    role: s.role ?? null,
    signOrder: Number(s.signOrder ?? idx + 1),
    token: crypto.randomBytes(16).toString('hex'),
    otp: String(Math.floor(100000 + Math.random() * 900000)),
    status: 'PENDING',
    signedAt: null,
    counterparty_id: counterpartyId,
  }));
  const requestDoc = {
    org_id: orgId,
    orgId,
    contractId,
    counterparty_id: counterpartyId,
    status: 'PENDING',
    signOrder: req.body.signOrder ?? 'ANY',
    expiresAt: new Date(Date.now() + Number(req.body.expiresInDays ?? 14) * 86_400_000),
    createdAt: new Date(),
    completedAt: null,
    voidedAt: null,
    signers: normalizedSigners,
    message: req.body.message ?? null,
  };
  const insertRes = await dbService.getCollection('signatureRequests').then((c) => c.insertOne(requestDoc));
  await docsCollection.updateOne({ _id: contractId }, { $set: { status: 'PENDING_SIGNATURE', signatureStatus: 'pending', updated_at: new Date() } });
  for (const signer of normalizedSigners) {
    const signLink = `${req.headers.origin ?? 'http://localhost:5173'}/sign/${signer.token}`;
    await emailService.sendSignatureRequestEmail(signer.email, document.name ?? 'Contract', signLink);
  }
  return res.status(201).json({ id: insertRes.insertedId.toString() });
});

router.get('/contracts/:id/signature-requests', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const contractId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const rows = await dbService.getCollection('signatureRequests').then((c) => c.find({ contractId, ...orgFilter(orgId) }).sort({ createdAt: -1 }).toArray());
  return res.json({ data: rows.map((row: any) => ({ ...row, id: row._id.toString() })) });
});

router.post('/contracts/:id/signature-requests/:srId/void', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const srId = safeObjectId(req.params.srId);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  await dbService.getCollection('signatureRequests').then((c) => c.updateOne({ _id: srId, ...orgFilter(orgId) }, { $set: { status: 'VOIDED', voidedAt: new Date() } }));
  return res.json({ ok: true });
});

router.post('/contracts/:id/signature-requests/:srId/remind', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ ok: true });
});

router.get('/signature-requests', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const statusFilter = String(req.query.status ?? '').trim().toUpperCase();
  const docsCollection = await dbService.getCollection('documents');
  const rows = await dbService.getCollection('signatureRequests').then((c) => c.find(orgFilter(orgId)).sort({ createdAt: -1 }).toArray());
  const filtered = statusFilter ? rows.filter((r: any) => String(r.status ?? '').toUpperCase() === statusFilter) : rows;
  const mapped = await Promise.all(filtered.map(async (row: any) => {
    const doc: any = await docsCollection.findOne({ _id: row.contractId });
    const completed = row.signers?.filter((s: any) => String(s.status).toUpperCase() === 'SIGNED').length ?? 0;
    return {
      id: row._id.toString(),
      status: String(row.status ?? 'PENDING').toUpperCase(),
      signOrder: row.signOrder ?? 'ANY',
      createdAt: new Date(row.createdAt ?? new Date()).toISOString(),
      completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      voidedAt: row.voidedAt ? new Date(row.voidedAt).toISOString() : null,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      signedCount: completed,
      totalSigners: row.signers?.length ?? 0,
      signers: (row.signers ?? []).map((s: any) => ({
        id: s.id ?? s.email,
        name: s.name,
        email: s.email,
        role: s.role ?? null,
        status: String(s.status ?? 'PENDING').toUpperCase(),
        signedAt: s.signedAt ? new Date(s.signedAt).toISOString() : null,
        signOrder: Number(s.signOrder ?? 1),
      })),
      contract: doc ? {
        id: doc._id.toString(),
        title: doc.name ?? 'Untitled contract',
        type: doc.type ?? 'OTHER',
        counterpartyName: doc.counterparty_name ?? null,
      } : null,
    };
  }));
  return res.json({ data: mapped, total: mapped.length });
});

router.get('/analytics/summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const windowDays = Number(req.query.days ?? 90);
  const contracts = await getContractsForOrg(orgId);
  const executed = contracts.filter((c: any) => String(c.status ?? '').toUpperCase() === 'EXECUTED');
  const pendingApprovals = contracts.filter((c: any) => String(c.status ?? '').toUpperCase() === 'PENDING_APPROVAL').length;
  const expiringSoon = contracts.filter((c: any) => {
    const expiry = asDate(c.expiry_date ?? c.expiryDate);
    return expiry && expiry.getTime() <= Date.now() + 90 * 86_400_000 && expiry.getTime() >= Date.now();
  }).length;
  const highRiskOpen = contracts.filter((c: any) => (c.riskScore ?? 0) >= 0.67 && !['EXECUTED', 'ARCHIVED'].includes(String(c.status ?? '').toUpperCase())).length;
  return res.json({
    totalContracts: contracts.length,
    executedContracts: executed.length,
    pendingApprovals,
    expiringSoon,
    highRiskOpen,
    executedTotalValue: executed.reduce((sum: number, c: any) => sum + Number(c.contract_value ?? 0), 0),
    executedTotalCurrency: 'USD',
    cycleTimeAvgDays: null,
    cycleTimeMedianDays: null,
    approvalAcceptanceRate: null,
    onTimeExecutionRate: null,
    withinTargetDays: 14,
    windowDays,
  });
});

router.get('/analytics/distributions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const contracts = await getContractsForOrg(orgId);
  const countBy = (getter: (c: any) => string) => {
    const map = new Map<string, number>();
    for (const c of contracts) {
      const key = getter(c);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([key, count]) => ({ key, count }));
  };
  return res.json({
    byStatus: countBy((c) => String(c.status ?? 'DRAFT').toUpperCase()),
    byType: countBy((c) => String(c.type ?? 'OTHER').toUpperCase()),
    byRisk: ['low', 'medium', 'high', 'none'].map((key) => ({
      key,
      label: key === 'none' ? 'Unscored' : key[0].toUpperCase() + key.slice(1),
      count: contracts.filter((c: any) => riskBand(c.riskScore) === key).length,
    })),
  });
});

router.get('/analytics/timeseries', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const contracts = await getContractsForOrg(orgId);
  const seriesMap = new Map<string, { month: string; label: string; created: number; executed: number }>();
  for (const c of contracts) {
    const created = asDate(c.created_at);
    if (!created) continue;
    const month = created.toISOString().slice(0, 7);
    const label = created.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const row = seriesMap.get(month) ?? { month, label, created: 0, executed: 0 };
    row.created += 1;
    if (String(c.status ?? '').toUpperCase() === 'EXECUTED') row.executed += 1;
    seriesMap.set(month, row);
  }
  return res.json({ series: [...seriesMap.values()].sort((a, b) => a.month.localeCompare(b.month)) });
});

router.get('/analytics/top-counterparties', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const limit = Number(req.query.limit ?? 10);
  const contracts = await getContractsForOrg(orgId, { status: 'EXECUTED' });
  const map = new Map<string, { counterparty: string; counterpartyId: string | null; count: number; value: number; currency: string }>();
  for (const c of contracts) {
    const key = c.counterparty_name ?? 'Unknown';
    const row = map.get(key) ?? { counterparty: key, counterpartyId: c.counterparty_id ? String(c.counterparty_id) : null, count: 0, value: 0, currency: c.currency ?? 'USD' };
    row.count += 1;
    row.value += Number(c.contract_value ?? 0);
    map.set(key, row);
  }
  return res.json({ data: [...map.values()].sort((a, b) => b.value - a.value).slice(0, limit) });
});

router.get('/approvals/my-queue', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const userId = req.user?.userId ?? 'system';
  const data = await getApprovalQueue(orgId, userId);
  return res.json({ data, total: data.length });
});

router.get('/approvals/all', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const data = await getApprovalRows(orgId);
  return res.json({ data, total: data.length });
});

router.get('/approvals', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const data = await getApprovalRows(orgId);
  const contractId = String(req.query.contractId ?? '');
  const filtered = contractId ? data.filter((row) => row.contract?.id === contractId) : data;
  return res.json({ data: filtered.slice(0, Number(req.query.limit ?? filtered.length)) });
});

router.get('/approvals/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const instanceId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const collection = await dbService.getCollection('approvalInstances');
  const instance = instanceId ? await collection.findOne({ _id: instanceId, ...orgFilter(orgId) }) : null;
  return res.json({ instance });
});

router.post('/approvals/:id/decide', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const instanceId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  if (!instanceId) return res.status(404).json({ error: 'Approval not found.' });
  const collection = await dbService.getCollection('approvalInstances');
  const instance: any = await collection.findOne({ _id: instanceId, ...orgFilter(orgId) });
  if (!instance) return res.status(404).json({ error: 'Approval not found.' });
  const currentStepIndex = Number(instance.currentStepIndex ?? 0);
  const decision = String(req.body.decision ?? 'APPROVED').toUpperCase();
  const steps = [...(instance.steps ?? [])];
  steps[currentStepIndex] = {
    ...steps[currentStepIndex],
    status: decision === 'REJECTED' ? 'rejected' : 'approved',
    comment: req.body.comment ?? '',
    decidedAt: new Date(),
  };
  const nextStatus = decision === 'REJECTED' ? 'REJECTED' : (currentStepIndex >= steps.length - 1 ? 'APPROVED' : 'PENDING');
  await collection.updateOne({ _id: instanceId }, { $set: { steps, status: nextStatus, currentStepIndex: Math.min(currentStepIndex + 1, steps.length - 1) } });
  return res.json({ ok: true });
});

router.patch('/approvals/workflows/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const workflowId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  await dbService.getCollection('approvalWorkflows').then((c) => c.updateOne({ _id: workflowId, ...orgFilter(orgId) }, { $set: { ...req.body, updated_at: new Date() } }));
  return res.json({ ok: true });
});

router.delete('/approvals/workflows/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const workflowId = safeObjectId(req.params.id);
  const orgId = req.user?.orgId ?? 'org_default_firm';
  await dbService.getCollection('approvalWorkflows').then((c) => c.deleteOne({ _id: workflowId, ...orgFilter(orgId) }));
  return res.json({ ok: true });
});

router.get('/approvals/notifications', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ data: [] });
});

router.post('/approvals/notifications/mark-read', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ ok: true });
});

router.get('/review-queue', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.user?.orgId ?? 'org_default_firm';
  const threshold = Number(req.query.threshold ?? 0.7);
  const rows = await dbService.getCollection('reviewQueue').then((c) => c.find(orgFilter(orgId)).toArray());
  const items = rows
    .filter((r: any) => Number(r.confidence ?? 0) < threshold)
    .map((r: any) => ({
      contractId: String(r.contractId ?? r.document_id ?? ''),
      contractTitle: r.contractTitle ?? r.documentName ?? 'Contract',
      contractType: r.contractType ?? 'OTHER',
      contractStatus: r.contractStatus ?? 'DRAFT',
      field: r.field ?? 'field',
      fieldLabel: r.fieldLabel ?? r.field ?? 'Field',
      value: r.value ?? null,
      quote: r.quote ?? null,
      section: r.section ?? null,
      confidence: Number(r.confidence ?? 0),
      updatedAt: new Date(r.updatedAt ?? r.created_at ?? new Date()).toISOString(),
    }));
  return res.json({ items, total: items.length, threshold });
});

router.post('/review-queue/:contractId/verify', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ ok: true });
});

router.post('/review-queue/:contractId/reject', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ ok: true });
});

router.get('/research/search', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const query = String(req.query.query ?? '').trim();
  if (!query) return res.status(400).json({ error: 'query is required.' });
  const results = await indianKanoonService.search(query);
  return res.json({ data: results.docs ?? [] });
});

router.post('/research/memo', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const query = String(req.body.query ?? '').trim();
  const docIds: string[] = Array.isArray(req.body.docIds) ? req.body.docIds.map(String) : [];
  const memo = [
    `Research memo for: ${query}`,
    '',
    `Reviewed ${docIds.length} precedent${docIds.length === 1 ? '' : 's'}.`,
    'This environment is using the Indian Kanoon integration layer currently available in the backend.',
  ].join('\n');
  return res.json({ memo });
});

router.get('/portal/:token/contract', async (req: Request, res: Response) => {
  const token = req.params.token;
  const link: any = await dbService.getCollection('shareLinks').then((c) => c.findOne({ token }));
  if (!link) return res.status(404).json({ error: 'Link unavailable.' });
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return res.status(410).json({ error: 'Link expired.' });
  const doc: any = await dbService.getCollection('documents').then((c) => c.findOne({ _id: link.contractId }));
  if (!doc) return res.status(404).json({ error: 'Contract not found.' });
  await dbService.getCollection('shareLinks').then((c) => c.updateOne({ _id: link._id }, { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } }));
  return res.json({ contract: mapDocumentToContract(doc), permissions: link.permissions ?? ['read'] });
});

router.post('/portal/:token/versions', async (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

// Autocomplete copilot (GhostCompletion)
router.post('/agent/complete', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { contextBefore, contextAfter } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  if (!geminiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  try {
    const prompt = `You are a contract drafting copilot.
Context before cursor:
"${contextBefore}"

Context after cursor (for style reference):
"${contextAfter}"

Predict the NEXT few words or next sentence to complete the clause naturally. Return ONLY the predicted text (no introductions, no markdown, no quotes). Keep it under 25 words.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
    );
    const geminiData: any = await geminiRes.json();
    const completion = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return res.json({ completion });
  } catch (err: any) {
    console.error('Agent complete error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Live paragraph category classifier (ClauseClassifier)
router.post('/agent/classify-clause', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { paragraph } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  if (!geminiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  try {
    const prompt = `Classify the category of the following contract paragraph.
Paragraph:
"${paragraph}"

Output ONLY a valid JSON object matching this structure:
{
  "category": "Termination" | "Liability" | "Payment" | "Indemnity" | "Governing Law" | "General",
  "reason": "brief reason for classification",
  "confidence": 0.95,
  "isStandard": true
}
Do not wrap in markdown or backticks.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
    );
    const geminiData: any = await geminiRes.json();
    const text = (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (err: any) {
    console.error('Agent classify error:', err);
    return res.json({ category: 'General', reason: 'Failed to classify automatically', confidence: 0.5, isStandard: false });
  }
});

// AI editor assistant (ContractEditor inline command assist)
router.post('/agent/assist', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { command, text } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  if (!geminiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

  try {
    const prompt = `You are a contract editing assistant.
Action requested: "${command}"
Target text:
"${text}"

Perform the requested action on the text. Return ONLY the rewritten text (no quotes, no markdown, no chat introduction).`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
    );
    const geminiData: any = await geminiRes.json();
    const suggestion = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return res.json({ suggestion });
  } catch (err: any) {
    console.error('Agent assist error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
