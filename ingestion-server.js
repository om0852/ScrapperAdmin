import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import dataRoutes from './routes/dataRoutes.js';
import redisCache from './utils/redisCache.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.INGESTION_PORT || process.env.PORT || 7100);

const getMongoState = () => {
  switch (mongoose.connection.readyState) {
    case 0:
      return 'disconnected';
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'unknown';
  }
};

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/', (req, res) => {
  res.status(200).json({
    service: 'manual-ingestion-service',
    status: 'ok',
    routes: {
      health: '/health',
      ingest: '/api/data/ingest',
      ingestFile: '/api/data/ingest-file',
      ingestDirectory: '/api/data/ingest-directory',
      readyFiles: '/api/data/ready-files'
    }
  });
});

app.get('/health', async (req, res) => {
  const redisHealthy = await redisCache.healthCheck();
  const mongoState = getMongoState();
  const ok = mongoState === 'connected' && redisHealthy;

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    mongo: mongoState,
    redis: redisHealthy ? 'connected' : 'disconnected'
  });
});

app.use('/api/data', dataRoutes);

app.use((err, req, res, next) => {
  console.error('[IngestionServer] Unhandled error:', err);

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Request payload too large. Use the file-based ingestion job endpoint instead of sending full file contents.'
    });
  }

  res.status(500).json({
    success: false,
    error: err?.message || 'Internal server error'
  });
});

const startServer = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to start the ingestion server');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB for ingestion server.');

  app.listen(PORT, () => {
    console.log(`Manual ingestion server listening on port ${PORT}`);
  });
};

const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down ingestion server...`);

  try {
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error while closing MongoDB connection:', error.message);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer().catch((error) => {
  console.error('Failed to start ingestion server:', error);
  process.exit(1);
});
