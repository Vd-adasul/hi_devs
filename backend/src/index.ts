import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { DbService } from './services/db.service.js';
import { QdrantService } from './services/qdrant.service.js';
import mattersRouter from './routes/matters.routes.js';
import documentsRouter from './routes/documents.routes.js';
import qaRouter from './routes/qa.routes.js';

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Raw binary body parser for PDF upload route
app.use('/api/v1/matters/:matterId/documents', express.raw({ type: 'application/pdf', limit: '10mb' }));

// General JSON body parser
app.use(express.json());

// Routes
app.use('/api/v1/matters', mattersRouter);
app.use('/api/v1/matters', documentsRouter);
app.use('/api/v1/matters', qaRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Boot server
async function startServer() {
  try {
    // 1. Initialize MongoDB connection
    const dbService = DbService.getInstance();
    await dbService.connect();

    // 2. Initialize Qdrant Cloud Vector DB collections
    const qdrantService = QdrantService.getInstance();
    await qdrantService.ensureCollection('legal_documents');

    app.listen(PORT, () => {
      console.log(`LawyerOS Backend is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start LawyerOS Backend server:', error);
    process.exit(1);
  }
}

startServer();
