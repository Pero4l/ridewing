'use strict';

/**
 * Multipart media upload handling (Multer in memory — no disk writes).
 *
 * Only image/video MIME types are accepted, and sizes are capped before Cloudinary
 * ever sees a byte. Multer's errors are normalized to ApiError so the central
 * handler produces clean 4xx responses.
 */

const multer = require('multer');
const ApiError = require('../utils/ApiError');

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']);

const LIMITS = {
  imageBytes: 10 * 1024 * 1024,
  videoBytes: 100 * 1024 * 1024,
  files: 1,
};

const storage = multer.memoryStorage();

function fileFilter(kind) {
  return (req, file, cb) => {
    const allowed = kind === 'video' ? VIDEO_MIMES : IMAGE_MIMES;
    if (!allowed.has(file.mimetype)) {
      return cb(
        ApiError.badRequest(
          kind === 'video'
            ? 'Unsupported video format. Use MP4, WebM or MOV'
            : 'Unsupported image format. Use JPEG, PNG, WebP, GIF or AVIF',
        ),
      );
    }
    cb(null, true);
  };
}

const imageUpload = multer({
  storage,
  limits: { files: 1, fileSize: LIMITS.imageBytes },
  fileFilter: fileFilter('image'),
});

const videoUpload = multer({
  storage,
  limits: { files: 1, fileSize: LIMITS.videoBytes },
  fileFilter: fileFilter('video'),
});

/**
 * Pulls the single accepted file out of `req`, translating Multer failures into
 * ApiError instances the error handler understands.
 */
function withFile(handler) {
  return (req, res, next) => {
    if (!req.file) {
      return next(ApiError.badRequest('No file provided'));
    }
    return handler(req, res).catch(next);
  };
}

function sendMulterError(error, req, res, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.payloadTooLarge('File is too large'));
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return next(ApiError.badRequest('Only one file per upload'));
    }
    return next(ApiError.badRequest('Upload failed'));
  }
  return next(error);
}

module.exports = { imageUpload, videoUpload, withFile, sendMulterError, LIMITS };