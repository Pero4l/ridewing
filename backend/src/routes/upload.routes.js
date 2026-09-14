'use strict';

const express = require('express');

const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const { imageUpload, videoUpload, withFile, sendMulterError } = require('../middleware/upload');
const uploadController = require('../controllers/upload.controller');

const router = express.Router();

router.use(requireAuth);

// Multer must run before the route handler; its errors are normalized separately
// because they are not ApiErrors.
router.post('/image', writeLimiter, imageUpload.single('file'), withFile(uploadController.uploadImage), sendMulterError);
router.post('/video', writeLimiter, videoUpload.single('file'), withFile(uploadController.uploadVideo), sendMulterError);

module.exports = router;