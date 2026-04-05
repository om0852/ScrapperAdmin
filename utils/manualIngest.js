/**
 * Manual ingestion utility.
 * Reads local JSON files when needed, or ingests raw file payloads forwarded to the ingestion service.
 */

import fs from 'fs';
import path from 'path';
import { enhanceProductForManualInsertion } from '../utils/manualInsertionHelper.js';
import processScrapedDataOptimized from '../controllers/dataControllerOptimized.js';
import redisCache from './redisCache.js';

const MANUAL_INGEST_BATCH_SIZE = Math.max(25, Number(process.env.MANUAL_INGEST_BATCH_SIZE || 250));
const MAX_TRACKED_INGEST_JOBS = 100;
const ingestJobs = new Map();

const extractPincode = (value) => {
  const match = String(value || '').match(/_(\d+)_/);
  return match?.[1] || null;
};

const extractPlatform = (value) => {
  const normalized = String(value || '').replace(/\\/g, '/');
  const fileName = path.basename(normalized);
  const match = fileName.match(/^([^_]+)_\d+_/);
  return match?.[1]?.replace(/_/, '') || null;
};

const normalizePlatform = (platform) => {
  const PLATFORM_ENUM = ['zepto', 'blinkit', 'jiomart', 'dmart', 'instamart', 'flipkartMinutes'];
  return PLATFORM_ENUM.find(item => item.toLowerCase() === String(platform || '').toLowerCase()) || String(platform || '').toLowerCase();
};

const chunkArray = (items, batchSize) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }
  return chunks;
};

const createIngestJobId = () => `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const trimTrackedJobs = () => {
  if (ingestJobs.size <= MAX_TRACKED_INGEST_JOBS) {
    return;
  }

  const oldestJobId = ingestJobs.keys().next().value;
  if (oldestJobId) {
    ingestJobs.delete(oldestJobId);
  }
};

const buildJobSnapshot = (job) => {
  if (!job) return null;

  const totalProducts = Number(job.totalProducts || 0);
  const processedProducts = Number(job.processedProducts || 0);
  const progressPercent = totalProducts > 0
    ? Math.min(100, Math.round((processedProducts / totalProducts) * 100))
    : (job.status === 'completed' ? 100 : 0);

  return {
    ...job,
    progressPercent
  };
};

const resolveIsoDateOverride = (dateOverride) => {
  if (!dateOverride) {
    return null;
  }

  const trimmed = String(dateOverride).trim();

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    const dateObj = new Date(`${trimmed}:00Z`);
    return Number.isNaN(dateObj.getTime()) ? null : dateObj.toISOString();
  }

  const dateObj = new Date(trimmed);
  return Number.isNaN(dateObj.getTime()) ? null : dateObj.toISOString();
};

const prepareProductsForIngestion = ({
  products,
  folderPath,
  platform,
  skipCategoryMapping = false,
  dateOverride = null
}) => {
  let productsToIngest = Array.isArray(products) ? products : [];

  if (!skipCategoryMapping) {
    console.log('Enhancing products for manual ingestion...');

    productsToIngest = productsToIngest.map(product =>
      enhanceProductForManualInsertion(product, folderPath, platform)
    );

    const groupedBySubCategory = {};
    productsToIngest.forEach((product, index) => {
      const subCategory = product.officialSubCategory || 'Unknown';
      if (!groupedBySubCategory[subCategory]) {
        groupedBySubCategory[subCategory] = [];
      }
      groupedBySubCategory[subCategory].push(index);
    });

    productsToIngest = productsToIngest.map((product, index) => {
      const subCategory = product.officialSubCategory || 'Unknown';
      return {
        ...product,
        ranking: groupedBySubCategory[subCategory].indexOf(index) + 1
      };
    });
  }

  if (dateOverride) {
    productsToIngest = productsToIngest.map(product => ({
      ...product,
      scrapedAt: dateOverride
    }));
  }

  const sample = productsToIngest.slice(0, 3);
  sample.forEach((product, index) => {
    console.log(`  [${index + 1}] ${product.productName || product.name || 'Unknown'}`);
    console.log(`      Category: ${product.category}`);
    console.log(`      Official: ${product.officialCategory} > ${product.officialSubCategory}`);
    console.log(`      ProductId: ${product.productId || product.id}`);
    console.log(`      Ranking: ${product.ranking}`);
  });

  return productsToIngest;
};

const buildIngestionContext = ({
  fileName,
  categoryFolder,
  fileData,
  filePath = null,
  pincode,
  platform,
  skipCategoryMapping = false,
  dateOverride = null
}) => {
  if (!fileData || typeof fileData !== 'object') {
    throw new Error('Invalid file payload: fileData object is required');
  }

  if (!Array.isArray(fileData.products)) {
    throw new Error('Invalid format: No products array found in file');
  }

  const effectiveFilePath = filePath || path.join('scraped_data', categoryFolder || 'Unknown', fileName || 'payload.json');
  const effectiveFolderPath = categoryFolder
    ? path.join('scraped_data', categoryFolder)
    : path.dirname(effectiveFilePath);

  console.log(`Reading payload: ${fileName || effectiveFilePath}`);
  console.log(`Found ${fileData.products.length} products in payload`);

  const resolvedPincode = pincode
    || fileData.pincode
    || extractPincode(fileName)
    || extractPincode(effectiveFilePath);

  if (!resolvedPincode) {
    throw new Error('Pincode not provided and could not be extracted from payload');
  }

  const resolvedPlatform = platform
    || fileData.platform
    || extractPlatform(fileName)
    || extractPlatform(effectiveFilePath);

  if (!resolvedPlatform) {
    throw new Error('Platform not provided and could not be extracted from payload');
  }

  let resolvedCategory = fileData.category || fileData.scraped_category || 'Unknown';
  if (categoryFolder) {
    resolvedCategory = categoryFolder.replace(/ _ /g, ' & ');
    console.log(`Extracted category from folder: ${resolvedCategory}`);
  } else {
    const dirName = path.basename(effectiveFolderPath);
    if (dirName && dirName !== 'scraped_data') {
      resolvedCategory = dirName.replace(/ _ /g, ' & ');
      console.log(`Extracted category from directory: ${resolvedCategory}`);
    }
  }

  const isoDateOverride = resolveIsoDateOverride(dateOverride);
  if (dateOverride && !isoDateOverride) {
    throw new Error(`Invalid dateOverride: ${dateOverride}`);
  }

  const productsToIngest = prepareProductsForIngestion({
    products: fileData.products,
    folderPath: effectiveFolderPath,
    platform: resolvedPlatform,
    skipCategoryMapping,
    dateOverride: isoDateOverride
  });

  return {
    effectiveFilePath,
    effectiveFolderPath,
    resolvedPincode,
    resolvedPlatform,
    resolvedCategory,
    isoDateOverride,
    productsToIngest
  };
};

const emitBatchProgress = async (onProgress, payload) => {
  if (typeof onProgress !== 'function') {
    return;
  }

  await onProgress(payload);
};

const ingestPreparedProductsInBatches = async ({
  fileName,
  effectiveFilePath,
  resolvedPincode,
  resolvedPlatform,
  resolvedCategory,
  isoDateOverride,
  productsToIngest,
  batchSize = MANUAL_INGEST_BATCH_SIZE,
  onProgress
}) => {
  const startTime = Date.now();
  const normalizedBatchSize = Math.max(25, Number(batchSize) || MANUAL_INGEST_BATCH_SIZE);
  const batches = chunkArray(productsToIngest, normalizedBatchSize);

  const aggregatedStats = {
    totalProducts: productsToIngest.length,
    processedProducts: 0,
    inserted: 0,
    new: 0,
    updated: 0,
    newGroups: 0,
    batchSize: normalizedBatchSize,
    totalBatches: batches.length,
    batchesCompleted: 0,
    currentBatch: 0,
    currentBatchSize: 0
  };

  await emitBatchProgress(onProgress, {
    status: 'running',
    file: effectiveFilePath,
    fileName: fileName || path.basename(effectiveFilePath),
    message: `Queued ${productsToIngest.length} products in ${batches.length} batch(es)`,
    ...aggregatedStats
  });

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const batchNumber = batchIndex + 1;

    await emitBatchProgress(onProgress, {
      status: 'running',
      file: effectiveFilePath,
      fileName: fileName || path.basename(effectiveFilePath),
      message: `Processing batch ${batchNumber}/${batches.length}`,
      ...aggregatedStats,
      currentBatch: batchNumber,
      currentBatchSize: batch.length
    });

    const batchResult = await processScrapedDataOptimized({
      pincode: resolvedPincode,
      platform: resolvedPlatform,
      category: resolvedCategory,
      products: batch,
      dateOverride: isoDateOverride
    });

    const batchStats = batchResult?.stats || {};
    aggregatedStats.processedProducts += batch.length;
    aggregatedStats.inserted += Number(batchStats.inserted || 0);
    aggregatedStats.new += Number(batchStats.new || 0);
    aggregatedStats.updated += Number(batchStats.updated || 0);
    aggregatedStats.newGroups += Number(batchStats.newGroups || 0);
    aggregatedStats.batchesCompleted = batchNumber;
    aggregatedStats.currentBatch = batchNumber;
    aggregatedStats.currentBatchSize = batch.length;

    await emitBatchProgress(onProgress, {
      status: 'running',
      file: effectiveFilePath,
      fileName: fileName || path.basename(effectiveFilePath),
      message: `Completed batch ${batchNumber}/${batches.length}`,
      ...aggregatedStats
    });
  }

  const resolvedScrapedAt = new Date(
    isoDateOverride
      || productsToIngest[0]?.scrapedAt
      || productsToIngest[0]?.time
      || Date.now()
  );

  if (!Number.isNaN(resolvedScrapedAt.getTime()) && productsToIngest.length > 0) {
    const normalizedPlatform = normalizePlatform(resolvedPlatform);
    const normalizedCategory = String(resolvedCategory || '').replace(/ _ /g, ' & ').trim();
    const latestProductIds = productsToIngest
      .map(product => product.productId || product.id)
      .filter(Boolean);

    await redisCache.setCategoryProductIndex(normalizedPlatform, resolvedPincode, normalizedCategory, {
      scrapedAt: resolvedScrapedAt,
      productIds: latestProductIds
    });
    await redisCache.setCategoryLatestDate(
      normalizedPlatform,
      resolvedPincode,
      normalizedCategory,
      resolvedScrapedAt
    );
  }

  const elapsed = Date.now() - startTime;
  const result = {
    success: true,
    message: `Processed ${productsToIngest.length} products in ${batches.length} batch(es).`,
    stats: {
      totalProducts: aggregatedStats.totalProducts,
      processedProducts: aggregatedStats.processedProducts,
      inserted: aggregatedStats.inserted,
      new: aggregatedStats.new,
      updated: aggregatedStats.updated,
      newGroups: aggregatedStats.newGroups,
      totalBatches: aggregatedStats.totalBatches,
      batchSize: aggregatedStats.batchSize,
      elapsed: `${elapsed}ms`
    }
  };

  await emitBatchProgress(onProgress, {
    status: 'completed',
    file: effectiveFilePath,
    fileName: fileName || path.basename(effectiveFilePath),
    message: result.message,
    ...aggregatedStats,
    elapsed: result.stats.elapsed
  });

  return result;
};

export async function ingestFilePayload({
  fileName,
  categoryFolder,
  fileData,
  filePath = null,
  pincode,
  platform,
  skipCategoryMapping = false,
  dateOverride = null
}, options = {}) {
  try {
    const {
      effectiveFilePath,
      resolvedPincode,
      resolvedPlatform,
      resolvedCategory,
      isoDateOverride,
      productsToIngest
    } = buildIngestionContext({
      fileName,
      categoryFolder,
      fileData,
      filePath,
      pincode,
      platform,
      skipCategoryMapping,
      dateOverride
    });

    console.log(`Starting optimized ingestion in batches of ${Math.max(25, Number(options.batchSize) || MANUAL_INGEST_BATCH_SIZE)}...`);
    const result = await ingestPreparedProductsInBatches({
      fileName: fileName || path.basename(effectiveFilePath),
      effectiveFilePath,
      resolvedPincode,
      resolvedPlatform,
      resolvedCategory,
      isoDateOverride,
      productsToIngest,
      batchSize: options.batchSize,
      onProgress: options.onProgress
    });

    return {
      success: true,
      file: effectiveFilePath,
      fileName: fileName || path.basename(effectiveFilePath),
      pincode: resolvedPincode,
      platform: resolvedPlatform,
      category: resolvedCategory,
      result,
      stats: result?.stats || null
    };
  } catch (err) {
    console.error(`Ingestion failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
      file: filePath || fileName || 'payload'
    };
  }
}

export async function ingestJsonFile(filePath, pincode, platform, skipCategoryMapping = false, dateOverride = null, options = {}) {
  try {
    console.log(`Reading file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);

    return ingestFilePayload({
      fileName: path.basename(filePath),
      categoryFolder: path.basename(path.dirname(filePath)),
      fileData: data,
      filePath,
      pincode,
      platform,
      skipCategoryMapping,
      dateOverride
    }, options);
  } catch (err) {
    console.error(`Ingestion failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
      file: filePath
    };
  }
}

export async function ingestDirectory(dirPath, skipCategoryMapping = false, dateOverride = null) {
  try {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.json'));
    if (files.length === 0) {
      throw new Error(`No JSON files found in ${dirPath}`);
    }

    console.log(`Found ${files.length} JSON files to process`);

    const results = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const filePath = path.join(dirPath, file);

      console.log(`[${index + 1}/${files.length}] Processing: ${file}`);
      const result = await ingestJsonFile(filePath, null, null, skipCategoryMapping, dateOverride);
      results.push(result);

      if (index < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successful = results.filter(result => result.success);
    const failed = results.filter(result => !result.success);

    const totalStats = {
      totalProducts: 0,
      newProducts: 0,
      updatedProducts: 0,
      newGroups: 0
    };

    successful.forEach(result => {
      if (result.result?.stats) {
        totalStats.totalProducts += result.result.stats.new + result.result.stats.updated;
        totalStats.newProducts += result.result.stats.new;
        totalStats.updatedProducts += result.result.stats.updated;
        totalStats.newGroups += result.result.stats.newGroups;
      }
    });

    return {
      success: failed.length === 0,
      summary: {
        total: files.length,
        successful: successful.length,
        failed: failed.length,
        stats: totalStats
      },
      results
    };
  } catch (err) {
    console.error(`Batch ingestion failed: ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  }
}

export function getReadyFiles(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: `Directory not found: ${dirPath}` };
    }

    const files = fs.readdirSync(dirPath)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          size: stat.size,
          modified: stat.mtime
        };
      });

    return {
      success: true,
      count: files.length,
      files
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function startIngestJsonFileJob({
  filePath,
  pincode = null,
  platform = null,
  skipCategoryMapping = false,
  dateOverride = null,
  batchSize = MANUAL_INGEST_BATCH_SIZE
}) {
  if (!filePath) {
    throw new Error('filePath is required');
  }

  const jobId = createIngestJobId();
  const job = {
    jobId,
    status: 'queued',
    file: filePath,
    fileName: path.basename(filePath),
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalProducts: 0,
    processedProducts: 0,
    inserted: 0,
    new: 0,
    updated: 0,
    newGroups: 0,
    batchSize: Math.max(25, Number(batchSize) || MANUAL_INGEST_BATCH_SIZE),
    totalBatches: 0,
    batchesCompleted: 0,
    currentBatch: 0,
    currentBatchSize: 0,
    message: 'Queued for processing',
    result: null
  };

  ingestJobs.set(jobId, job);
  trimTrackedJobs();

  (async () => {
    try {
      job.status = 'running';
      job.message = 'Reading file';

      const result = await ingestJsonFile(
        filePath,
        pincode,
        platform,
        skipCategoryMapping,
        dateOverride,
        {
          batchSize: job.batchSize,
          onProgress: async (progress) => {
            job.status = progress.status || job.status;
            job.totalProducts = progress.totalProducts ?? job.totalProducts;
            job.processedProducts = progress.processedProducts ?? job.processedProducts;
            job.inserted = progress.inserted ?? job.inserted;
            job.new = progress.new ?? job.new;
            job.updated = progress.updated ?? job.updated;
            job.newGroups = progress.newGroups ?? job.newGroups;
            job.totalBatches = progress.totalBatches ?? job.totalBatches;
            job.batchesCompleted = progress.batchesCompleted ?? job.batchesCompleted;
            job.currentBatch = progress.currentBatch ?? job.currentBatch;
            job.currentBatchSize = progress.currentBatchSize ?? job.currentBatchSize;
            job.message = progress.message || job.message;
          }
        }
      );

      if (!result.success) {
        job.status = 'failed';
        job.error = result.error || 'Ingestion failed';
        job.message = job.error;
      } else {
        const stats = result.stats || result.result?.stats || {};
        job.status = 'completed';
        job.processedProducts = stats.processedProducts ?? job.processedProducts;
        job.totalProducts = stats.totalProducts ?? job.totalProducts;
        job.inserted = stats.inserted ?? job.inserted;
        job.new = stats.new ?? job.new;
        job.updated = stats.updated ?? job.updated;
        job.newGroups = stats.newGroups ?? job.newGroups;
        job.totalBatches = stats.totalBatches ?? job.totalBatches;
        job.message = result.message || `Completed ${job.fileName}`;
        job.result = result;
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      job.message = error.message;
    } finally {
      job.completedAt = new Date().toISOString();
    }
  })();

  return buildJobSnapshot(job);
}

export function getIngestJobStatus(jobId) {
  return buildJobSnapshot(ingestJobs.get(jobId));
}

export default {
  ingestFilePayload,
  ingestJsonFile,
  ingestDirectory,
  getReadyFiles,
  startIngestJsonFileJob,
  getIngestJobStatus
};
