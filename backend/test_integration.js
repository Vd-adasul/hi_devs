import dotenv from 'dotenv';
import { DbService } from './src/services/db.service.js';
import { QdrantService } from './src/services/qdrant.service.js';
import { EnkryptService } from './src/services/enkrypt.service.js';
import { getEmbedding } from './src/utils/embedding.js';

dotenv.config({ override: true });

async function testIntegration() {
  console.log('====================================');
  console.log('   LAWYEROS INTEGRATION VERIFIER   ');
  console.log('====================================\n');

  try {
    // 1. Verify MongoDB Connection
    console.log('Step 1: Verifying MongoDB Atlas Connection...');
    const dbService = DbService.getInstance();
    const db = await dbService.connect();
    const mattersCol = await dbService.getCollection('matters');
    const matterCount = await mattersCol.countDocuments();
    console.log(`[PASS] MongoDB Connected successfully. Found ${matterCount} matters.\n`);

    // 2. Verify Gemini Embedding Generation
    console.log('Step 2: Verifying Gemini Embedding API...');
    const vector = await getEmbedding('Verify Gemini text embedding generation');
    console.log(`[PASS] Gemini Embedding generated successfully. Vector length: ${vector.length}\n`);

    // 3. Verify Qdrant Cloud Cluster Connection
    console.log('Step 3: Verifying Qdrant Cloud Connection...');
    const qdrantService = QdrantService.getInstance();
    await qdrantService.ensureCollection('test_verify_collection_v3', 3072);
    
    const dummyPoint = {
      id: '00000000-0000-0000-0000-000000000001',
      vector: vector,
      payload: {
        org_id: 'org_default_firm',
        test: true,
        message: 'Integration check success',
      },
    };
    
    await qdrantService.upsertPoints('test_verify_collection_v3', [dummyPoint]);
    console.log('[PASS] Upserted dummy point to Qdrant successfully.');

    const searchRes = await qdrantService.searchPoints('test_verify_collection_v3', vector, 'org_default_firm', 1);
    if (searchRes.length > 0 && searchRes[0].payload.message === 'Integration check success') {
      console.log('[PASS] Retrieved dummy point via semantic query successfully.');
    } else {
      throw new Error('Failed to retrieve matching point from Qdrant search.');
    }

    await qdrantService.deletePoints('test_verify_collection_v3', ['00000000-0000-0000-0000-000000000001']);
    console.log('[PASS] Qdrant clean completed successfully.\n');

    // 4. Verify Enkrypt AI Safety Gate
    console.log('Step 4: Verifying Enkrypt AI evaluate guardrail...');
    const enkryptService = EnkryptService.getInstance();
    const safetyRes = await enkryptService.evaluate(
      'According to Section 73, liability is limited.',
      'Document states liability is limited.'
    );
    console.log(`[PASS] Enkrypt AI evaluated output. Trust Score: ${safetyRes.trust_score}, Safe: ${safetyRes.safe}\n`);

    console.log('====================================');
    console.log('   ALL INTEGRATIONS PASSED READY!   ');
    console.log('====================================');
  } catch (error) {
    console.error('\n[FAIL] Integration test failed:', error);
    process.exit(1);
  } finally {
    const dbService = DbService.getInstance();
    await dbService.close();
    process.exit(0);
  }
}

testIntegration();
