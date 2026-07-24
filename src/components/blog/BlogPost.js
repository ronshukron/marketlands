import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublishedBlogPostBySlug } from '../../services/blogPostService';

const formatDate = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' }).format(date)
    : '';
};

const BlogPost = () => {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    getPublishedBlogPostBySlug(slug)
      .then((item) => {
        if (!active) return;
        setPost(item);
        setState(item ? 'ready' : 'not-found');
      })
      .catch((error) => {
        console.error('Failed to load blog post:', error);
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <main dir="rtl" className="min-h-[70vh] bg-amber-50/40 px-4 py-10 font-hebrew sm:py-14">
      <div className="mx-auto max-w-3xl" aria-live="polite">
        <Link
          to="/blog"
          className="mb-7 inline-flex min-h-11 items-center font-medium text-amber-800 hover:text-amber-950"
        >
          → חזרה לכל הפוסטים
        </Link>

        {state === 'loading' && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
            טוענים את הפוסט…
          </div>
        )}

        {state === 'error' && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-800">
            לא הצלחנו לטעון את הפוסט כרגע. כדאי לנסות שוב בעוד כמה דקות.
          </div>
        )}

        {state === 'not-found' && (
          <div className="rounded-xl border border-amber-200 bg-white p-10 text-center">
            <h1 className="text-3xl font-bold text-slate-900">הפוסט לא נמצא</h1>
            <p className="mt-3 text-slate-600">ייתכן שהקישור השתנה או שהפוסט עדיין לא פורסם.</p>
            <Link
              to="/blog"
              className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-amber-700 px-5 font-semibold text-white hover:bg-amber-800"
            >
              לכל הפוסטים
            </Link>
          </div>
        )}

        {state === 'ready' && post && (
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {post.imageUrl && (
              <img src={post.imageUrl} alt={post.title} className="max-h-[28rem] w-full object-cover" />
            )}
            <div className="p-6 sm:p-10">
              {formatDate(post.publishedAt) && (
                <time className="text-sm text-slate-500">{formatDate(post.publishedAt)}</time>
              )}
              <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
                {post.title}
              </h1>
              {post.excerpt && (
                <p className="mt-5 border-r-4 border-amber-400 pr-4 text-lg leading-8 text-slate-600">
                  {post.excerpt}
                </p>
              )}
              <div className="mt-8 whitespace-pre-wrap break-words text-right text-lg leading-9 text-slate-800">
                {post.body}
              </div>
            </div>
          </article>
        )}
      </div>
    </main>
  );
};

export default BlogPost;
