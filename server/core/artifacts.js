// File: server/core/artifacts.js
// Description: Generic artifact management system
// Purpose: Handles any type of user-generated content with validation and storage
// Notes: Domain-agnostic module for managing user artifacts (text, files, etc.)

const { validateTextServerSide } = require('../middleware/security');
const { checkAndConsumeQuota } = require('../db/repo/quotasRepo');
const { db } = require('../db/connection');

/**
 * WHAT:
 * We provide a generic artifact management system that can handle any type
 * of user-generated content with proper validation and quota management.
 *
 * WHY:
 * This makes the core system reusable for different types of applications
 * without being tied to specific domain logic like "text submissions".
 *
 * HOW:
 * We use a flexible artifact type system with configurable validation
 * and storage rules that can be extended for different use cases.
 */

/**
 * Artifact types and their validation rules
 */
const ARTIFACT_TYPES = {
  text: {
    validator: validateTextServerSide,
    quotaType: 'text_artifacts',
    defaultLimit: 10
  },
  // Future artifact types can be added here
  // file: { validator: validateFile, quotaType: 'file_artifacts', defaultLimit: 5 },
  // image: { validator: validateImage, quotaType: 'image_artifacts', defaultLimit: 20 }
};

/**
 * Create a new artifact with validation and quota checking
 * @param {string} type - Type of artifact (text, file, etc.)
 * @param {Object} data - Artifact data
 * @param {string} userId - User ID or IP for quota tracking
 * @param {Object} options - Additional options
 * @returns {Object} Result with success status and artifact info
 */
async function createArtifact(type, data, userId, options = {}) {
  const artifactConfig = ARTIFACT_TYPES[type];
  if (!artifactConfig) {
    throw new Error(`Unsupported artifact type: ${type}`);
  }

  let trx = null;
  
  try {
    // Start transaction for atomic operations
    trx = await db.transaction();
    
    // Validate artifact data
    const validation = artifactConfig.validator(data);
    if (!validation.valid) {
      await trx.rollback();
      return {
        success: false,
        error: validation.error,
        code: 'VALIDATION_FAILED'
      };
    }

    // Check and consume quota atomically
    const quotaResult = await checkAndConsumeQuota(
      userId, 
      artifactConfig.quotaType, 
      options.limit || artifactConfig.defaultLimit, 
      trx
    );
    
    if (!quotaResult.success) {
      await trx.rollback();
      return {
        success: false,
        error: 'Artifact limit exceeded',
        code: 'QUOTA_EXCEEDED',
        quota: quotaResult
      };
    }

    // Create artifact record
    const artifactData = {
      id: options.id || require('crypto').randomUUID(),
      type: type,
      data: validation.sanitized || data,
      metadata: {
        length: validation.sanitized ? validation.sanitized.length : 0,
        created_at: trx.fn.now(),
        user_id: userId
      },
      created_at: trx.fn.now(),
      updated_at: trx.fn.now()
    };

    const [artifact] = await trx('artifacts')
      .insert(artifactData)
      .returning('*');

    await trx.commit();

    return {
      success: true,
      artifact: {
        id: artifact.id,
        type: artifact.type,
        metadata: artifact.metadata,
        created_at: artifact.created_at
      },
      quota: quotaResult
    };

  } catch (error) {
    if (trx) {
      await trx.rollback();
    }
    throw error;
  }
}

/**
 * Get artifacts for a user
 * @param {string} userId - User ID or IP
 * @param {string} type - Optional artifact type filter
 * @param {Object} options - Query options
 * @returns {Array} List of artifacts
 */
async function getArtifacts(userId, type = null, options = {}) {
  let query = db('artifacts')
    .where('metadata->user_id', userId)
    .orderBy('created_at', 'desc');

  if (type) {
    query = query.where('type', type);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  return await query;
}

/**
 * Get artifact by ID
 * @param {string} artifactId - Artifact ID
 * @param {string} userId - User ID for authorization
 * @returns {Object} Artifact or null
 */
async function getArtifact(artifactId, userId) {
  return await db('artifacts')
    .where({ id: artifactId })
    .where('metadata->user_id', userId)
    .first();
}

module.exports = {
  createArtifact,
  getArtifacts,
  getArtifact,
  ARTIFACT_TYPES
};
