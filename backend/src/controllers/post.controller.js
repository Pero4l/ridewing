'use strict';

const asyncHandler = require('../utils/asyncHandler');
const postService = require('../services/post.service');

const create = asyncHandler(async (req, res) => {
  const post = await postService.create(req.user.id, req.body);
  res.status(201).json({ post });
});

const listFeed = asyncHandler(async (req, res) => {
  const page = await postService.feed(req.user.id, req.validatedQuery);
  res.json(page);
});

const update = asyncHandler(async (req, res) => {
  const post = await postService.update(req.params.id, req.user.id, req.body);
  res.json({ post });
});

const getDetail = asyncHandler(async (req, res) => {
  const post = await postService.getPost(req.params.id, req.user.id);
  res.json({ post });
});

const like = asyncHandler(async (req, res) => {
  const result = await postService.like(req.params.id, req.user.id);
  res.json(result);
});

const unlike = asyncHandler(async (req, res) => {
  const result = await postService.unlike(req.params.id, req.user.id);
  res.json(result);
});

const listComments = asyncHandler(async (req, res) => {
  const page = await postService.listComments(req.params.id, req.validatedQuery);
  res.json(page);
});

const addComment = asyncHandler(async (req, res) => {
  const { comment } = await postService.addComment(req.params.id, req.user.id, req.body.content);
  res.status(201).json({ comment });
});

const share = asyncHandler(async (req, res) => {
  const result = await postService.share(req.params.id, req.user.id);
  res.json(result);
});

const remove = asyncHandler(async (req, res) => {
  const result = await postService.remove(req.params.id, req.user.id);
  res.json(result);
});

module.exports = { create, update, listFeed, getDetail, like, unlike, listComments, addComment, share, remove };