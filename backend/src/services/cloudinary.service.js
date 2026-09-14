'use strict';

/**
 * Cloudinary media uploads.
 *
 * Pushes buffers straight from Multer memory storage (no disk writes) and returns a
 * normalized record the API can hand to clients. When Cloudinary is not configured
 * the feature degrades to explicit 503s so the app never guesses.
 */

const cloudinary = require('cloudinary').v2;
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

if (env.cloudinary.enabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
}

function assertEnabled() {
  if (!env.cloudinary.enabled) {
    throw ApiError.serviceUnavailable('Media uploads are not configured on this server');
  }
}

/** User-controlled file name can carry weird characters — rebuild it safely. */
function safeBaseName(originalName) {
  return String(originalName || '')
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 40);
}

function uploadStream(buffer, { folderPrefix, resourceType, transformation }) {
  assertEnabled();
  const folder = `${env.cloudinary.folder}/${folderPrefix}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        public_id: `${safeBaseName(folderPrefix)}-${Date.now()}`,
        folder,
        transformation,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
    stream.end(buffer);
  });
}

/**
 * Uploads an image buffer. Transforms optimise for web delivery: capped width,
 * auto quality and format (Cloudinary serves WebP where the client supports it).
 */
async function uploadImage(buffer) {
  const result = await uploadStream(buffer, {
    folderPrefix: 'images',
    resourceType: 'image',
    transformation: [
      { width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
    ],
  });
  return normalize(result, 'image');
}

/**
 * Uploads a video buffer. Video is only used for posts (60s class content is the
 * product constraint); the transform keeps everything web-preview friendly.
 */
async function uploadVideo(buffer) {
  const result = await uploadStream(buffer, {
    folderPrefix: 'videos',
    resourceType: 'video',
    transformation: [
      { width: 1280, crop: 'limit', quality: 'auto', fetch_format: 'mp4' },
    ],
  });
  return normalize(result, 'video');
}

function normalize(result, type) {
  logger.debug({ publicId: result.public_id, type }, 'uploaded media');
  return {
    url: result.secure_url,
    width: result.width ?? null,
    height: result.height ?? null,
    format: result.format ?? null,
    type,
  };
}

module.exports = { uploadImage, uploadVideo, assertEnabled };