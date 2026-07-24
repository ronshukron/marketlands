import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublishedBlogPosts } from '../../services/blogPostService';

const formatDate = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' }).format(date)
    : '';
};

const BlogIndex = () => {
  const [posts, setPosts] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let active = true;
    getPublishedBlogPosts()
      .then((items) => {
        if (!active) return;
        setPosts(items);
        setState('ready');
      })
      .catch((error) => {
        console.error('Failed to load blog posts:', error);
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div dir="rtl" className="min-h-[70vh] bg-amber-50/40 font-hebrew">
      <header className="border-b border-amber-100 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:py-16">
          <p className="mb-3 text-sm font-medium text-amber-700">מחשבות מהשטח</p>
          <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">התובנות של רון</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-600">
            רשימות קצרות על חקלאות, קהילה ואוכל מקומי.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-14" aria-live="polite">
        {state === 'loading' && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            טוענים את הפוסטים…
          </div>
        )}

        {state === 'error' && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-800">
            לא הצלחנו לטעון את הפוסטים כרגע. כדאי לנסות שוב בעוד כמה דקות.
          </div>
        )}

        {state === 'ready' && posts.length === 0 && (
          <div className="rounded-xl border border-dashed border-amber-300 bg-white p-10 text-center">
            <h2 className="text-xl font-semibold text-slate-800">עוד מעט מתחילים</h2>
            <p className="mt-2 text-slate-600">הפוסט הראשון של רון יפורסם כאן בקרוב.</p>
          </div>
        )}

        {state === 'ready' && posts.length > 0 && (
          <div className="grid gap-7 sm:grid-cols-2">
            {posts.map((post) => (
              <article
                key={post.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="h-52 w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="p-6">
                  {formatDate(post.publishedAt) && (
                    <time className="text-sm text-slate-500">
                      {formatDate(post.publishedAt)}
                    </time>
                  )}
                  <h2 className="mt-2 text-2xl font-bold leading-tight text-slate-900">
                    <Link
                      to={`/blog/${encodeURIComponent(post.slug)}`}
                      className="rounded-sm hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {post.title}
                    </Link>
                  </h2>
                  {post.excerpt && (
                    <p className="mt-3 line-clamp-2 leading-7 text-slate-600">{post.excerpt}</p>
                  )}
                  <Link
                    to={`/blog/${encodeURIComponent(post.slug)}`}
                    className="mt-5 inline-flex min-h-11 items-center font-semibold text-amber-700 hover:text-amber-900"
                    aria-label={`לקריאת הפוסט: ${post.title}`}
                  >
                    לקריאה ←
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default BlogIndex;
