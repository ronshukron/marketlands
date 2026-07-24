import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const BLOG_POSTS_COLLECTION = 'blogPosts';
export const BLOG_POST_STATUSES = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
};

const MAX_LENGTHS = {
  title: 160,
  slug: 120,
  excerpt: 400,
  imageUrl: 2000,
  body: 20000,
};

export const normalizeBlogSlug = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTHS.slug);

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const mapPost = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });

const timestampMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return new Date(value).getTime() || 0;
};

const sortNewestFirst = (posts) =>
  posts.sort(
    (a, b) =>
      timestampMillis(b.publishedAt || b.updatedAt || b.createdAt) -
      timestampMillis(a.publishedAt || a.updatedAt || a.createdAt)
  );

const validateAndCleanPost = (post) => {
  const cleaned = {
    title: cleanText(post.title, MAX_LENGTHS.title),
    slug: normalizeBlogSlug(post.slug || post.title),
    excerpt: cleanText(post.excerpt, MAX_LENGTHS.excerpt),
    imageUrl: cleanText(post.imageUrl, MAX_LENGTHS.imageUrl),
    body: cleanText(post.body, MAX_LENGTHS.body),
    status:
      post.status === BLOG_POST_STATUSES.PUBLISHED
        ? BLOG_POST_STATUSES.PUBLISHED
        : BLOG_POST_STATUSES.DRAFT,
  };

  if (!cleaned.title) throw new Error('חובה להזין כותרת');
  if (!cleaned.slug) throw new Error('חובה להזין כתובת תקינה לפוסט');
  if (!cleaned.body) throw new Error('חובה להזין תוכן');
  if (cleaned.imageUrl && !/^https?:\/\//i.test(cleaned.imageUrl)) {
    throw new Error('כתובת התמונה חייבת להתחיל ב-http:// או https://');
  }

  return cleaned;
};

const auditUid = (currentUser) => currentUser?.uid || '';

export const assertBlogSlugUnchanged = (originalSlug, nextSlug) => {
  const normalizedOriginal = normalizeBlogSlug(originalSlug);
  const normalizedNext = normalizeBlogSlug(nextSlug);
  if (normalizedNext !== normalizedOriginal) {
    throw new Error('לא ניתן לשנות כתובת של פוסט קיים. ניתן ליצור פוסט חדש בכתובת אחרת.');
  }
  return normalizedOriginal;
};

export const getPublishedBlogPosts = async () => {
  const postsQuery = query(
    collection(db, BLOG_POSTS_COLLECTION),
    where('status', '==', BLOG_POST_STATUSES.PUBLISHED)
  );
  const snapshot = await getDocs(postsQuery);
  return sortNewestFirst(snapshot.docs.map(mapPost));
};

export const getPublishedBlogPostBySlug = async (slug) => {
  const normalizedSlug = normalizeBlogSlug(decodeURIComponent(slug || ''));
  if (!normalizedSlug) return null;

  const snapshot = await getDoc(doc(db, BLOG_POSTS_COLLECTION, normalizedSlug));
  if (!snapshot.exists() || snapshot.data().status !== BLOG_POST_STATUSES.PUBLISHED) {
    return null;
  }
  return mapPost(snapshot);
};

/** Admin-only listing; Firestore rules must enforce authorization. */
export const getAllBlogPosts = async () => {
  const snapshot = await getDocs(collection(db, BLOG_POSTS_COLLECTION));
  return sortNewestFirst(snapshot.docs.map(mapPost));
};

export const createBlogPost = async (post, currentUser) => {
  const cleaned = validateAndCleanPost(post);
  const actorUid = auditUid(currentUser);
  const postRef = doc(db, BLOG_POSTS_COLLECTION, cleaned.slug);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(postRef);
    if (existing.exists()) throw new Error('כתובת הפוסט כבר קיימת');

    transaction.set(postRef, {
      ...cleaned,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      publishedAt:
        cleaned.status === BLOG_POST_STATUSES.PUBLISHED ? serverTimestamp() : null,
      createdBy: actorUid,
      updatedBy: actorUid,
      publishedBy:
        cleaned.status === BLOG_POST_STATUSES.PUBLISHED ? actorUid : '',
    });
  });

  return cleaned.slug;
};

export const updateBlogPost = async (originalSlug, post, currentUser) => {
  const cleaned = validateAndCleanPost(post);
  const oldSlug = assertBlogSlugUnchanged(originalSlug, cleaned.slug);
  const actorUid = auditUid(currentUser);
  const oldRef = doc(db, BLOG_POSTS_COLLECTION, oldSlug);

  await runTransaction(db, async (transaction) => {
    const oldSnapshot = await transaction.get(oldRef);
    if (!oldSnapshot.exists()) throw new Error('הפוסט לא נמצא');

    const existing = oldSnapshot.data();
    const isFirstPublish =
      cleaned.status === BLOG_POST_STATUSES.PUBLISHED &&
      existing.status !== BLOG_POST_STATUSES.PUBLISHED;
    const payload = {
      ...existing,
      ...cleaned,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
      publishedAt: isFirstPublish
        ? serverTimestamp()
        : existing.publishedAt || null,
      publishedBy: isFirstPublish ? actorUid : existing.publishedBy || '',
    };

    transaction.set(oldRef, payload);
  });

  return cleaned.slug;
};

export const deleteBlogPost = async (slug) => {
  await deleteDoc(doc(db, BLOG_POSTS_COLLECTION, normalizeBlogSlug(slug)));
};
