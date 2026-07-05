# LawyerOS — Phase-by-Phase Integration Map
### Mastra × Qdrant × Enkrypt AI mapped to every flowchart phase

> **Rule**: Every Mastra agent that calls an LLM **must** pass its output through Enkrypt AI before returning.  
> **Rule**: Every piece of text that needs to be retrieved later **must** be embedded and stored in Qdrant.  
> **Rule**: Mastra orchestrates **every** multi-step operation — no raw async chains in Express controllers.

---

## PHASE 1 — Document Understanding

**Flowchart nodes**: Upload → Store PDF → Text Extraction → Page Mapping → Clause Segmentation → Party Extraction → Obligation Extraction → Legal Event Extraction → Metadata Extraction

### What happens
1. PDF uploaded → stored to **AWS S3**
2. Document record created in **MongoDB** (`documents` collection)
3. `documentProcessingAgent` (Mastra) kicks off

### Mastra
**Agent**: `documentProcessingAgent`  
**Workflow steps** (in order):
1. `extractTextTool` — calls pdf-parse, returns text + page mapping
2. `segmentClausesTool` — calls LexNLP microservice (Python), returns clause objects with CUAD category tags
3. `extractPartiesTool` — calls LexNLP for named entity recognition on clause objects
4. `extractObligationsTool` — **LLM call** via Gemini: "Extract all obligations from these clauses"
5. `extractLegalEventsTool` — rule-based: regex for dates, durations, deadlines using dateparser
6. `extractMetadataTool` — extracts doc type, jurisdiction, parties from header/intro clauses
7. `embedDocumentTool` — generates Gemini embeddings for each clause → upserts to Qdrant
8. `storeResultsTool` — writes clauses, parties, obligations, events, metadata to MongoDB

### Enkrypt AI
- **Wraps step 4 only** (obligation extraction — the LLM step)
- Checks for hallucination (did the LLM invent obligations not present in the clause?)
- If flagged → human review queue

### Qdrant
- **Collection**: `legal_documents`
- Each clause → embedding → upserted as a point
- Payload includes: `{ matter_id, doc_id, clause_id, clause_type, page_number, raw_text }`

---

## PHASE 2 — Legal Matter Digital Twin

**Flowchart nodes**: Additional Docs (Amendments, Legal Notices, Court Filings, Emails) → Merge Into Existing Matter → Living Matter State → Matter Twin

### What happens
When a new doc is added to an existing matter, it doesn't replace — it **merges** into the living matter state.

### Mastra
**Agent**: `matterTwinAgent`  
**Workflow steps**:
1. Detect document type (amendment vs. notice vs. filing vs. email)
2. `diffClausesTool` — compare new clauses against existing matter clauses in MongoDB
3. `detectConflictsTool` — find clauses that contradict existing obligations
4. `mergeMatterStateTool` — update the living matter state in MongoDB with new entities
5. `updateQdrantTool` — upsert new clause embeddings to Qdrant, add new points to `matter_memory`

### Enkrypt AI
- Wraps `detectConflictsTool` if it uses LLM to explain conflicts
- Trust score attached to conflict explanation

### Qdrant
- **Collection**: `matter_memory`
- Stores the living matter state as a vector
- Payload: `{ matter_id, version, summary_embedding, active_obligations, active_parties }`

---

## PHASE 3 — Timeline Intelligence

**Flowchart nodes**: L1 + M1 → Timeline Agent → Extract Deadlines / Renewals / Expirations / Notice Periods / Payment Schedules → Timeline Report

### What happens
Reads from **MongoDB** `obligations` and `legal_events` tables → builds timeline.

### Mastra
**Agent**: `timelineAgent`  
**Workflow steps**:
1. `fetchObligationsTool` — pull all obligations for matter from MongoDB
2. `fetchLegalEventsTool` — pull all legal events (dates, schedules)
3. `classifyEventsTool` — rule-based: bucket events into Deadlines / Renewals / Expirations / Notice Periods / Payment Schedules
4. `generateTimelineReportTool` — **LLM call**: "Generate a structured timeline report from these events in plain English for a lawyer"
5. `storeTimelineReportTool` — save to MongoDB, trigger notification engine

### Enkrypt AI
- Wraps `generateTimelineReportTool`
- Checks: hallucination (did LLM invent dates?), bias, toxicity
- Low trust → flagged for human review

### Qdrant
- Timeline report embedding stored in `matter_memory` collection
- Enables future Q&A like "when does this contract expire?"

---

## PHASE 4 — Risk Intelligence

**Flowchart nodes**: Clauses + Obligations → Risk Engine → Risk Classification / Risk Explanation / Business Impact Analysis → Risk Table

### What happens
Two-stage: Rule engine first, LLM for explanation.

### Mastra
**Agent**: `riskAgent`  
**Workflow steps**:
1. `fetchClausesTool` — pull clauses from MongoDB
2. `applyRuleEngineTool` — no LLM. Rule-based: check for `Unlimited Liability → HIGH`, `Auto Renewal → MEDIUM`, `No Termination Rights → HIGH`. Rules stored in MongoDB `risk_rules` collection.
3. `generateRiskExplanationTool` — **LLM call**: explain why each flagged clause is risky in plain English
4. `generateBusinessImpactTool` — **LLM call**: "What is the business impact of this risk?"
5. `storeRiskReportTool` — write to MongoDB `risks` collection
6. `embedRiskReportTool` — embed risk report → upsert to Qdrant

### Enkrypt AI
- Wraps **both** LLM calls (explanation + business impact)
- Hallucination check: did it cite a risk that doesn't exist in the clause?
- Trust score attached to each risk item

### Qdrant
- **Collection**: `risk_intelligence`
- Payload: `{ matter_id, clause_id, risk_level, risk_type, trust_score }`

---

## PHASE 5 — Clause Benchmarking

**Flowchart nodes**: Clauses + Benchmark Clause Collection → Benchmark Engine → Compare Market Standards / Internal Standards / Find Similar Clauses → Benchmark Report

### What happens
Compare extracted clauses against:
1. **CUAD dataset** clause categories (built-in knowledge)
2. **Qdrant** `benchmark_clauses` collection (internal clause library — grows over time)
3. **LLM** for gap analysis (where you said LLM is ok)

### Mastra
**Agent**: `benchmarkAgent`  
**Workflow steps**:
1. `fetchClausesTool` — pull matter clauses from MongoDB
2. `searchQdrantBenchmarksTool` — semantic similarity search in `benchmark_clauses` Qdrant collection → find top-k similar clauses
3. `classifyByCUADTool` — map each clause to its CUAD category (rule-based, no LLM)
4. `compareAgainstMarketTool` — **LLM call**: "Compare this termination clause against market standard. Is this favorable or unfavorable?"
5. `compareAgainstInternalTool` — compare against most similar clauses in Qdrant internal library
6. `generateBenchmarkReportTool` — **LLM call**: final benchmark report
7. `storeBenchmarkReportTool` — save to MongoDB + embed → Qdrant

### Enkrypt AI
- Wraps steps 4 and 6 (LLM calls)
- Hallucination check critical here: LLM cannot claim a clause is "below market" without actual evidence from Qdrant

### Qdrant
- **Read from**: `benchmark_clauses` (finding similar clauses)
- **Write to**: `benchmark_clauses` (new clauses added to the library after each matter)
- This is how the system improves over time — every new matter enriches the benchmark library

---

## PHASE 6 — Institutional Memory

**Flowchart nodes**: Clauses + Risks + Timeline + Matter Twin + Benchmark Reports → Embedding Pipeline → Qdrant (5 collections)

### What happens
This phase is the **Qdrant layer itself**. Every output from Phases 1–5 flows into Qdrant.

### Mastra
**Workflow**: `embeddingPipelineWorkflow` (not an agent — a Mastra Workflow with no LLM)  
**Steps**:
1. `embedClausesTool` → `legal_documents`
2. `embedMatterStateTool` → `matter_memory`
3. `embedRiskReportTool` → `risk_intelligence`
4. `embedBenchmarkReportTool` → `benchmark_clauses`
5. `embedLawyerNotesTool` → `lawyer_notes`

### Enkrypt AI
- **Not used here** — no LLM in this phase. Pure embedding pipeline.

### Qdrant
- This IS the Qdrant phase. All 5 collections get populated here:
  1. `legal_documents`
  2. `matter_memory`
  3. `risk_intelligence`
  4. `lawyer_notes`
  5. `benchmark_clauses`

---

## PHASE 7 — Legal Knowledge Fabric

**Flowchart nodes**: Matter + Clauses + Parties + Obligations + Events + Risk + Timeline + Benchmark → Graph Builder → Matter/Clause/Risk/Timeline/Citation Graphs → Knowledge Graph

### What happens
Build a **graph in MongoDB** connecting all entities. Not a graph database — just MongoDB documents with `references` arrays.

### Mastra
**Workflow**: `graphBuilderWorkflow`  
**Steps**:
1. `fetchAllEntitiesForMatterTool` — pull matter, docs, clauses, parties, obligations, events, risks from MongoDB
2. `buildMatterGraphTool` — create graph nodes and edges: `Matter → Document → Clause → Party`
3. `buildClauseGraphTool` — connect clauses by type, similarity (from Qdrant cosine similarity)
4. `buildRiskGraphTool` — connect risk entries to source clauses
5. `buildTimelineGraphTool` — connect timeline events to source obligations
6. `buildCitationGraphTool` — initially empty, populated by Phase 9
7. `storeKnowledgeGraphTool` — save all graph relationships to MongoDB `knowledge_graph` collection

### Enkrypt AI
- Not used here — no LLM

### Qdrant
- Qdrant cosine similarity used in `buildClauseGraphTool` to find semantically similar clauses and create edges between them

---

## PHASE 8 — Graph RAG Q&A

**Flowchart nodes**: Lawyer Question → Legal QA Agent → Graph Retrieval + Semantic Retrieval → Evidence Assembly → Grounded Legal Answer

### What happens
This is the main lawyer-facing AI feature. Hybrid retrieval: graph + semantic.

### Mastra
**Agent**: `qaAgent`  
**Workflow steps**:
1. `embedQueryTool` — embed lawyer's question using Gemini embeddings
2. `semanticSearchTool` — search Qdrant `legal_documents` collection → retrieve top-k relevant clauses
3. `graphSearchTool` — traverse MongoDB knowledge graph from related clause nodes → expand context
4. `assembleEvidenceTool` — combine Qdrant results + graph results into structured context
5. `generateAnswerTool` — **LLM call**: "Based on this evidence, answer: [question]"
6. `attachSourcesTool` — attach source clause references, page numbers, doc names to answer

### Enkrypt AI
- **Critical gate** on `generateAnswerTool`
- Checks: hallucination (did LLM answer using only the evidence provided?), toxicity
- Trust score + evidence sources returned with every answer
- If trust < threshold → push to human review queue (Phase 14)

### Qdrant
- **Read from**: `legal_documents`, `matter_memory`, `risk_intelligence`
- Semantic similarity search using embedded query

---

## PHASE 9 — Citation Verification

**Flowchart nodes**: Grounded Answer → Citation Checker → External Legal Sources → Verified Citation → updates Knowledge Graph

### What happens
Every time the LLM cites a case, statute, or legal authority — verify it actually exists.

### Mastra
**Agent**: `citationAgent`  
**Workflow steps**:
1. `extractCitationsFromAnswerTool` — parse LLM output for citation patterns (e.g., "Section 73 of Indian Contract Act", "AIR 1962 SC 1494")
2. `verifyCitationExternalTool` — for each citation: call external legal source APIs (Indian Kanoon, CourtListener, or simple Google Scholar scrape) — **no LLM**
3. `classifyCitationsTool` — mark each as: `VERIFIED`, `NOT_FOUND`, `UNCERTAIN`
4. `updateKnowledgeGraphTool` — feed verified citations back into MongoDB citation graph (Phase 7 node `AZ`)
5. `attachVerifiedCitationsTool` — add verified citation badges to the answer

### Enkrypt AI
- Wraps the final answer with citations attached
- Citation integrity check: does the verified citation actually support the claim made?

### Qdrant
- Verified citations embedded → stored in `legal_documents` collection
- Next time a similar question is asked → citation retrieved from Qdrant (no need to re-verify)

---

## PHASE 10 — Research Agent

**Flowchart nodes**: Research Request → Research Agent → Knowledge Graph + Qdrant + External Sources → Precedents / Statutes / Case Law → Research Memo

### What happens
Lawyer asks the system to do legal research beyond the uploaded documents.

### Mastra
**Agent**: `researchAgent`  
**Workflow steps**:
1. `searchInternalMemoryTool` — search Qdrant across all collections for relevant past matter context
2. `searchKnowledgeGraphTool` — traverse MongoDB graph for related cases and citations
3. `searchExternalSourcesTool` — call external legal APIs for precedents, statutes, case law
4. `synthesizeResearchTool` — **LLM call**: "Synthesize these sources into a research memo for a lawyer"
5. `storeResearchMemoTool` — save to MongoDB, embed → Qdrant `matter_memory`

### Enkrypt AI
- Wraps `synthesizeResearchTool`
- Hallucination, bias, citation integrity checks
- Research memo cannot state things not in the sources provided

### Qdrant
- **Read**: All collections for internal context
- **Write**: Research memo embedding → `matter_memory`

---

## PHASE 11 — Drafting Agent

**Flowchart nodes**: Draft Request → Drafting Agent → Knowledge Graph + Qdrant + Research Memo → Generate Draft → Legal Notice / Review Memo / Client Summary / Contract Draft

### What happens
Generate professional legal documents grounded in matter context.

### Mastra
**Agent**: `draftingAgent`  
**Workflow steps**:
1. `fetchMatterContextTool` — pull matter state, clauses, risk, parties from MongoDB
2. `searchSimilarDraftsTool` — search Qdrant for similar past clauses/drafts to use as templates
3. `fetchResearchMemoTool` — pull latest research memo from MongoDB
4. `generateDraftTool` — **LLM call**: "Draft a [type] based on this context"
5. `structureDraftTool` — format into proper legal document structure
6. `storeDraftTool` — save to MongoDB

### Enkrypt AI
- **Critical gate** on `generateDraftTool`
- Hallucination: did the LLM invent clauses or obligations not in the matter context?
- Toxicity, bias checks
- Trust score attached to draft

### Qdrant
- **Read**: `legal_documents`, `benchmark_clauses` (for template matching)
- **Write**: Generated draft embedding → `legal_documents` (for future retrieval)

---

## PHASE 12 — Explainability

**Flowchart nodes**: QA Answer + Research Memo + Draft + Risk + Benchmark → Explainability Engine → Source Evidence / Reasoning Trace / Confidence Score

### What happens
Every AI output carries a full explanation of *how* it was produced.

### Mastra
**Tool** (not a standalone agent — called by every other agent):  
`explainabilityTool`  
Returns:
- `source_evidence`: list of Qdrant IDs + MongoDB IDs used
- `reasoning_trace`: step-by-step explanation of what the agent did
- `confidence_score`: based on number of sources, Qdrant similarity scores, citation verification status

This is **embedded inside every agent's final step** before returning.

### Enkrypt AI
- The reasoning trace and source evidence are passed to Enkrypt as additional context
- Enkrypt evaluates if the confidence score is consistent with the evidence

### Qdrant
- Source evidence includes Qdrant vector IDs — the frontend can retrieve and show the exact clauses used

---

## PHASE 13 — Enkrypt Trust Layer

**Flowchart nodes**: Trust Layer → Hallucination Checks / Citation Integrity / Evidence Validation / Output Trust Score

### What happens
This IS the Enkrypt AI integration point. Every agent output flows through this.

### Enkrypt AI — Complete Integration

**API Call** made after every LLM response:
```
POST https://api.enkryptai.com/guardrails/evaluate
Headers:
  api-key: WqI05ElRwGJI1UQWDlr6Opqziav5zMKA
  Content-Type: application/json
Body:
{
  "text": "<llm_output>",
  "context": "<evidence_used>",
  "checks": ["hallucination", "citation_integrity", "toxicity", "bias", "evidence_validation"]
}
```

**Response**:
```json
{
  "trust_score": 0.91,
  "safe": true,
  "flags": [],
  "hallucination_detected": false,
  "citation_valid": true
}
```

**Every API response from LawyerOS** includes:
```json
{
  "data": { ... },
  "_trust": {
    "score": 0.91,
    "safe": true,
    "flags": [],
    "reviewed_by_enkrypt": true
  }
}
```

If `safe: false` OR `trust_score < 0.75` → output goes to **Phase 14 Human Review Queue** instead of user.

### Mastra
- The `enkryptSafetyTool` is a Mastra Tool defined once, called from every agent's final step

### Qdrant
- Not used in this phase

---

## PHASE 14 — Human Review

**Flowchart nodes**: Human Review Queue → Approve / Reject / Request Revision

### What happens
Lawyer sees all AI outputs that Enkrypt flagged. They approve, reject, or request a re-run.

### Mastra
**Human-in-the-Loop**: Mastra's native `waitForHumanInput` step  
- When Enkrypt flags an output → Mastra suspends the workflow
- Stores pending state in MongoDB `review_queue`
- Resumes workflow when lawyer acts

**On Revision**: Mastra re-triggers the originating agent workflow with lawyer feedback as additional context.

### Enkrypt AI
- After lawyer approval → Enkrypt re-evaluates the approved output (final pass)
- Logs the approval in audit trail

### Qdrant
- Not directly used here

---

## PHASE 15 — Notifications

**Flowchart nodes**: Timeline Report + Risk Alerts + Review Queue → Notification Engine → Deadlines / Expiring Contracts / Pending Reviews / Risk Alerts → Email + In-App

### What happens
Notification engine fires on specific events.

### Mastra
**Workflow**: `notificationWorkflow` (triggered by other workflows, not by user)  
**Steps**:
1. Mastra scheduler (cron-style trigger or event hook from other workflows)
2. `fetchUpcomingDeadlinesTool` — check MongoDB for events within 7/14/30 days
3. `sendEmailTool` — calls **Resend API** with formatted email
4. `storeInAppNotificationTool` — writes to MongoDB `notifications` collection

### Enkrypt AI
- Not used here — no LLM in notification generation

### Qdrant
- Not used here

---

## PHASE 16 — Enterprise (Auth + RBAC + Audit + Encryption + Compliance + Tenant Isolation)

**Flowchart cross-cutting dashed edges**: authenticated via, authorized via, tenant-scoped, encrypted, logged

### What happens
This is middleware and MongoDB-layer work. Every request is authenticated and scoped.

### Implementation
- **Auth**: JWT middleware — every request checks `Authorization: Bearer <token>`
- **RBAC**: MongoDB `users` collection has `role: "admin" | "lawyer" | "viewer"` — middleware enforces
- **Audit Logs**: Every write operation logs to MongoDB `audit_logs` with `{ user_id, action, resource, timestamp }`
- **Tenant Isolation**: Every MongoDB query includes `org_id` filter — no cross-org data leakage
- **Encryption**: AWS S3 server-side encryption for PDFs. MongoDB Atlas encryption at rest.

### Mastra
- Not directly used — but Mastra workflows receive `org_id` and `user_id` in context and pass to every tool

### Enkrypt AI
- Audit logs include Enkrypt trust scores for every AI action (compliance trail)

### Qdrant
- Every Qdrant point includes `org_id` in payload
- All Qdrant searches include `filter: { must: [{ key: "org_id", match: { value: orgId } }] }`
- This is the **tenant isolation** for vector memory

---

## Summary: Where Each Tech Is Used

| Phase | Mastra | Qdrant | Enkrypt AI |
|---|---|---|---|
| P1 Document Understanding | `documentProcessingAgent` | `legal_documents` write | Obligation extraction output |
| P2 Matter Twin | `matterTwinAgent` | `matter_memory` write | Conflict explanation output |
| P3 Timeline | `timelineAgent` | `matter_memory` write | Timeline report output |
| P4 Risk | `riskAgent` | `risk_intelligence` write | Risk explanation + business impact |
| P5 Benchmark | `benchmarkAgent` | `benchmark_clauses` read + write | Market comparison + report |
| P6 Institutional Memory | `embeddingPipelineWorkflow` | ALL 5 collections write | Not used |
| P7 Knowledge Fabric | `graphBuilderWorkflow` | Clause similarity read | Not used |
| P8 Graph RAG Q&A | `qaAgent` | All collections read | **Critical gate on answer** |
| P9 Citation Verification | `citationAgent` | `legal_documents` write | Citation integrity check |
| P10 Research | `researchAgent` | All collections read, `matter_memory` write | Research memo output |
| P11 Drafting | `draftingAgent` | `legal_documents` + `benchmark_clauses` read | **Critical gate on draft** |
| P12 Explainability | Tool in all agents | Source evidence IDs | Consistency check |
| P13 Enkrypt Trust | `enkryptSafetyTool` (Mastra tool) | Not used | **Core layer — all outputs** |
| P14 Human Review | Mastra `waitForHumanInput` | Not used | Final approval pass |
| P15 Notifications | `notificationWorkflow` | Not used | Not used |
| P16 Enterprise | Middleware + workflows | `org_id` filter on all queries | Trust scores in audit log |

---

## Hard Requirement Check ✅

| Requirement | Status |
|---|---|
| Mastra as agent orchestration layer | ✅ — 7 agents + 3 workflows, all multi-step operations |
| Qdrant as memory & retrieval layer | ✅ — 5 collections, used in 10 of 16 phases |
| Enkrypt AI as safety & evaluation layer | ✅ — wraps every LLM output in every agent, trust score on every response |
| All three in every submission | ✅ — the core Q&A flow (P8) alone uses all three simultaneously |
