import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/authContext';
import {
  BLOG_POST_STATUSES,
  createBlogPost,
  deleteBlogPost,
  getAllBlogPosts,
  normalizeBlogSlug,
  updateBlogPost,
} from '../../services/blogPostService';

const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2'];
const EMPTY_FORM = {
  title: '',
  slug: '',
  excerpt: '',
  imageUrl: '',
  body: '',
  status: BLOG_POST_STATUSES.DRAFT,
};

const formatDate = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'טרם נשמר';
};

const BlogAdmin = () => {
  const { currentUser, userRole } = useAuth();
  const isAdmin = Boolean(
    currentUser && (userRole === 'admin' || ADMIN_UIDS.includes(currentUser.uid))
  );
  const [posts, setPosts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingSlug, setEditingSlug] = useState('');
  const [listState, setListState] = useState('loading');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const loadPosts = useCallback(async () => {
    if (!isAdmin) return;
    setListState('loading');
    try {
      setPosts(await getAllBlogPosts());
      setListState('ready');
    } catch (error) {
      console.error('Failed to load blog posts for admin:', error);
      setListState('error');
    }
  }, [isAdmin]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingSlug('');
    setMessage(null);
  };

  const editPost = (post) => {
    setEditingSlug(post.slug);
    setForm({
      title: post.title || '',
      slug: post.slug || '',
      excerpt: post.excerpt || '',
      imageUrl: post.imageUrl || '',
      body: post.body || '',
      status: post.status || BLOG_POST_STATUSES.DRAFT,
    });
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingSlug) {
        await updateBlogPost(editingSlug, form, currentUser);
        setMessage({ type: 'success', text: 'הפוסט עודכן בהצלחה.' });
      } else {
        await createBlogPost(form, currentUser);
        setMessage({ type: 'success', text: 'הפוסט נוצר בהצלחה.' });
      }
      setForm(EMPTY_FORM);
      setEditingSlug('');
      await loadPosts();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'שמירת הפוסט נכשלה.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post) => {
    if (!window.confirm(`למחוק לצמיתות את "${post.title}"?`)) return;
    setMessage(null);
    try {
      await deleteBlogPost(post.slug);
      if (editingSlug === post.slug) resetForm();
      setMessage({ type: 'success', text: 'הפוסט נמחק.' });
      await loadPosts();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'מחיקת הפוסט נכשלה.' });
    }
  };

  const togglePublished = async (post) => {
    const nextStatus =
      post.status === BLOG_POST_STATUSES.PUBLISHED
        ? BLOG_POST_STATUSES.DRAFT
        : BLOG_POST_STATUSES.PUBLISHED;
    setMessage(null);
    try {
      await updateBlogPost(post.slug, { ...post, status: nextStatus }, currentUser);
      setMessage({
        type: 'success',
        text: nextStatus === BLOG_POST_STATUSES.PUBLISHED ? 'הפוסט פורסם.' : 'הפוסט הוחזר לטיוטה.',
      });
      await loadPosts();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'עדכון מצב הפרסום נכשל.' });
    }
  };

  if (!currentUser) {
    return (
      <main dir="rtl" className="mx-auto min-h-[60vh] max-w-2xl px-4 py-12 font-hebrew">
        <h1 className="text-3xl font-bold">ניהול הבלוג</h1>
        <p className="mt-4 text-slate-600">יש להתחבר כמנהל כדי לגשת לעמוד זה.</p>
        <Link to="/login" className="mt-6 inline-flex min-h-11 items-center text-blue-700 underline">
          להתחברות
        </Link>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main dir="rtl" className="mx-auto min-h-[60vh] max-w-2xl px-4 py-12 font-hebrew">
        <h1 className="text-3xl font-bold">אין הרשאה</h1>
        <p className="mt-4 text-red-700">העמוד זמין למנהלים בלבד.</p>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center text-blue-700 underline">
          חזרה לדף הבית
        </Link>
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 font-hebrew">
      <div className="mx-auto max-w-6xl">
        <Link to="/admin" className="inline-flex min-h-11 items-center text-blue-700 hover:text-blue-900">
          → חזרה ללוח הניהול
        </Link>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-950">ניהול ״התובנות של רון״</h1>
          <p className="mt-2 text-slate-600">יצירה, עריכה ופרסום של פוסטים קצרים.</p>
        </div>

        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`mb-6 rounded-lg border p-4 ${
              message.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-green-200 bg-green-50 text-green-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">{editingSlug ? 'עריכת פוסט' : 'פוסט חדש'}</h2>
            {editingSlug && (
              <button type="button" onClick={resetForm} className="min-h-11 rounded-lg border px-4 hover:bg-slate-50">
                ביטול עריכה
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-medium">כותרת *</span>
              <input
                required
                maxLength="160"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-medium">כתובת הפוסט (slug) *</span>
              <div className="flex gap-2">
                <input
                  required
                  dir="ltr"
                  maxLength="120"
                  disabled={Boolean(editingSlug)}
                  value={form.slug}
                  onChange={(event) => updateField('slug', normalizeBlogSlug(event.target.value))}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-left focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100 disabled:text-slate-500"
                />
                <button
                  type="button"
                  disabled={Boolean(editingSlug)}
                  onClick={() => updateField('slug', normalizeBlogSlug(form.title))}
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  מהכותרת
                </button>
              </div>
              {editingSlug && (
                <span className="mt-1 block text-xs text-slate-500">
                  כתובת של פוסט קיים קבועה. לכתובת אחרת יש ליצור פוסט חדש.
                </span>
              )}
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block font-medium">תקציר (רשות)</span>
              <textarea
                rows="2"
                maxLength="400"
                value={form.excerpt}
                onChange={(event) => updateField('excerpt', event.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block font-medium">כתובת תמונה (רשות)</span>
              <input
                type="url"
                dir="ltr"
                maxLength="2000"
                placeholder="https://..."
                value={form.imageUrl}
                onChange={(event) => updateField('imageUrl', event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-left focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block font-medium">תוכן *</span>
              <textarea
                required
                rows="10"
                maxLength="20000"
                value={form.body}
                onChange={(event) => updateField('body', event.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 leading-7 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <span className="mt-1 block text-xs text-slate-500">טקסט פשוט בלבד; מעברי שורה נשמרים.</span>
            </label>

            <label className="block">
              <span className="mb-1 block font-medium">מצב</span>
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
              >
                <option value={BLOG_POST_STATUSES.DRAFT}>טיוטה</option>
                <option value={BLOG_POST_STATUSES.PUBLISHED}>פורסם</option>
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="min-h-11 w-full rounded-lg bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? 'שומרים…' : editingSlug ? 'שמירת שינויים' : 'יצירת פוסט'}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="mb-5 text-2xl font-bold">כל הפוסטים</h2>
          {listState === 'loading' && <p className="rounded-lg bg-white p-6 text-slate-600">טוענים…</p>}
          {listState === 'error' && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
              טעינת הפוסטים נכשלה.
              <button type="button" onClick={loadPosts} className="mr-2 min-h-11 underline">נסו שוב</button>
            </div>
          )}
          {listState === 'ready' && posts.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              אין פוסטים עדיין. אפשר ליצור את הראשון בטופס למעלה.
            </p>
          )}
          {listState === 'ready' && posts.length > 0 && (
            <div className="space-y-4">
              {posts.map((post) => (
                <article key={post.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold">{post.title}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          post.status === BLOG_POST_STATUSES.PUBLISHED
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {post.status === BLOG_POST_STATUSES.PUBLISHED ? 'פורסם' : 'טיוטה'}
                        </span>
                      </div>
                      <p dir="ltr" className="mt-1 text-left text-sm text-slate-500">/blog/{post.slug}</p>
                      <p className="mt-1 text-sm text-slate-500">עודכן: {formatDate(post.updatedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {post.status === BLOG_POST_STATUSES.PUBLISHED && (
                        <Link
                          to={`/blog/${encodeURIComponent(post.slug)}`}
                          className="inline-flex min-h-11 items-center rounded-lg border px-4 hover:bg-slate-50"
                        >
                          צפייה
                        </Link>
                      )}
                      <button type="button" onClick={() => editPost(post)} className="min-h-11 rounded-lg border px-4 hover:bg-slate-50">
                        עריכה
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePublished(post)}
                        className="min-h-11 rounded-lg bg-amber-100 px-4 text-amber-900 hover:bg-amber-200"
                      >
                        {post.status === BLOG_POST_STATUSES.PUBLISHED ? 'החזרה לטיוטה' : 'פרסום'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(post)}
                        className="min-h-11 rounded-lg bg-red-50 px-4 text-red-700 hover:bg-red-100"
                      >
                        מחיקה
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default BlogAdmin;
