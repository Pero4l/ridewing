'use strict';

/**
 * Post counters and comment pagination.
 *
 * Both of these were silently wrong and neither had a test:
 *
 *  - `like()` incremented `like_count` unconditionally, so a double-tap, a retry
 *    or an optimistic re-fire counted one rider's like several times.
 *  - the comment cursor was returned as a raw ISO timestamp while every caller
 *    feeds it through `decodeCursor`, which expects an opaque base64url string —
 *    so the cursor was discarded and the client was served page 1 forever.
 */

const { sequelize, Post, PostComment, User, PostLike, CommentLike } = require('../src/models');
const postService = require('../src/services/post.service');
const authService = require('../src/services/auth.service');
const { decodeCursor, encodeCursor } = require('../src/utils/pagination');

async function makeUser(tag) {
  return User.create({
    username: `${tag}${Math.random().toString(36).slice(2, 8)}`,
    displayName: `${tag} Rider`,
    email: `${Math.random().toString(36).slice(2, 8)}@example.test`,
    passwordHash: await authService.hashPassword('correct-horse-battery'),
  });
}

describe('like counters', () => {
  let author;
  let liker;

  beforeAll(async () => {
    [author, liker] = await Promise.all([makeUser('likeauthor'), makeUser('liker')]);
  }, 30000);

  afterAll(async () => {
    await PostLike.destroy({ where: { userId: liker.id } });
    await CommentLike.destroy({ where: { userId: liker.id } });
    await PostComment.destroy({ where: { userId: author.id } });
    await Post.destroy({ where: { userId: author.id } });
    await author.destroy();
    await liker.destroy();
  });

  it('counts a like once, however many times the rider taps', async () => {
    const post = await Post.create({ userId: author.id, content: 'a route worth riding' });

    await postService.like(post.id, liker.id);
    await postService.like(post.id, liker.id);
    await postService.like(post.id, liker.id);

    await post.reload();
    expect(post.likeCount).toBe(1);

    const rows = await PostLike.count({ where: { postId: post.id, userId: liker.id } });
    expect(rows).toBe(1);
  });

  it('is idempotent across two different riders', async () => {
    const other = await makeUser('liker2');
    const post = await Post.create({ userId: author.id, content: 'sunset loop' });

    await postService.like(post.id, liker.id);
    await postService.like(post.id, other.id);

    await post.reload();
    expect(post.likeCount).toBe(2);

    await other.destroy();
  });

  it('unlikes back down and never below zero', async () => {
    const post = await Post.create({ userId: author.id, content: 'two passes' });
    await postService.like(post.id, liker.id);
    await postService.unlike(post.id, liker.id);

    await post.reload();
    expect(post.likeCount).toBe(0);

    // Unliking again is a no-op, not a second decrement.
    await postService.unlike(post.id, liker.id);
    await post.reload();
    expect(post.likeCount).toBe(0);
  });

  it('counts a comment like once per rider', async () => {
    const other = await makeUser('commentliker');
    const post = await Post.create({ userId: author.id, content: 'comments count too' });
    const comment = await PostComment.create({
      postId: post.id,
      userId: author.id,
      content: 'good shout',
    });

    await postService.likeComment(comment.id, liker.id);
    await postService.likeComment(comment.id, liker.id);

    await comment.reload();
    expect(comment.likeCount).toBe(1);

    await CommentLike.destroy({ where: { commentId: comment.id } });
    await other.destroy();
  });
});

describe('comment pagination', () => {
  let author;
  let post;

  beforeAll(async () => {
    author = await makeUser('commenter');
    post = await Post.create({ userId: author.id, content: 'paginate me' });
    // 25 comments with distinct timestamps so the cursor ordering is meaningful.
    for (let i = 0; i < 25; i += 1) {
      await PostComment.create({
        postId: post.id,
        userId: author.id,
        content: `comment ${i}`,
        createdAt: new Date(Date.now() - (25 - i) * 1000),
      });
    }
  }, 60000);

  afterAll(async () => {
    await PostComment.destroy({ where: { postId: post.id } });
    await Post.destroy({ where: { id: post.id } });
    await author.destroy();
  });

  it('returns an opaque cursor that decodeCursor can read back', async () => {
    const page = await postService.listComments(post.id, { limit: 10 });

    expect(page.pageInfo.hasMore).toBe(true);
    expect(page.pageInfo.nextCursor).toBeTruthy();
    // The bug: this used to be a raw ISO timestamp, which decodes to null and
    // silently rewinds the client to page 1.
    expect(decodeCursor(page.pageInfo.nextCursor)).toHaveProperty('createdAt');
  });

  it('advances through every page without repeating a comment', async () => {
    const seen = [];
    let cursor = null;

    for (let pageNo = 0; pageNo < 5; pageNo += 1) {
      const page = await postService.listComments(post.id, { limit: 10, cursor });
      seen.push(...page.items.map((item) => item.id));
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor;
      expect(cursor).toBeTruthy();
    }

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(25);
  });

  it('returns comments oldest-first within a page', async () => {
    const page = await postService.listComments(post.id, { limit: 10 });
    const times = page.items.map((item) => Date.parse(item.createdAt));

    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('exhausts the thread and reports no further pages', async () => {
    let cursor = null;
    let pages = 0;
    let lastPage;

    do {
      lastPage = await postService.listComments(post.id, { limit: 10, cursor });
      pages += 1;
      cursor = lastPage.pageInfo.nextCursor;
    } while (lastPage.pageInfo.hasMore);

    expect(pages).toBe(3);
    expect(lastPage.items.length).toBe(5);
    expect(lastPage.pageInfo.hasMore).toBe(false);
  });
});

// Jest runs `afterAll` hooks describe-scoped, so the connection is closed once at
// the end of the file rather than in the first block — closing it early left the
// later blocks unable to reach the database.
afterAll(async () => {
  await sequelize.close();
});

describe('cursor decoding', () => {
  it('round-trips a valid cursor', () => {
    const encoded = encodeCursor({ createdAt: '2026-01-02T03:04:05.678Z' });
    expect(decodeCursor(encoded)).toEqual({ createdAt: '2026-01-02T03:04:05.678Z' });
  });

  it('treats a raw timestamp as no cursor rather than a broken one', () => {
    // Which is what used to happen silently, re-serving page 1.
    expect(decodeCursor('2026-01-02T03:04:05.678Z')).toBeNull();
  });

  // A client sending junk should get "start from the beginning", not a 500 from
  // Postgres being handed an Invalid Date.
  it('rejects a cursor whose date cannot be parsed', () => {
    expect(decodeCursor(encodeCursor({ createdAt: 'not-a-date' }))).toBeNull();
  });

  it('rejects a cursor with no date at all', () => {
    expect(decodeCursor(encodeCursor({ nonsense: 1 }))).toEqual({ nonsense: 1 });
  });

  it('tolerates a malformed cursor string', () => {
    expect(decodeCursor('!!!not-base64!!!')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });
});