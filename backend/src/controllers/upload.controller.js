'use strict';

const cloudinaryService = require('../services/cloudinary.service');

const upload = async (req, res, kind) => {
  const media = await cloudinaryService[kind](req.file.buffer);
  res.status(201).json({ media });
};

const uploadImage = (req, res) => upload(req, res, 'uploadImage');
const uploadVideo = (req, res) => upload(req, res, 'uploadVideo');

module.exports = { uploadImage, uploadVideo };