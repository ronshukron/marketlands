import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, query, where, orderBy, limit,
  updateDoc, doc, arrayUnion, arrayRemove, serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../firebase/firebase';
import { useAuth } from '../../../contexts/authContext';

const RecipeWidget = ({ communityName }) => {
  const { currentUser, userLoggedIn } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);

  const loadRecipes = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'communityRecipes'),
        where('communityId', '==', communityName),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error loading recipes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!communityName) return;
    loadRecipes();
  }, [communityName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    try {
      let imageUrl = null;
      if (imageFile) {
        const storageRef = ref(storage, `communityRecipes/${communityName}/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
      }

      await addDoc(collection(db, 'communityRecipes'), {
        communityId: communityName,
        authorId: currentUser?.uid || 'anonymous',
        authorName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'אנונימי',
        title: title.trim(),
        content: content.trim(),
        imageUrl,
        createdAt: new Date().toISOString(),
        likes: [],
      });

      setTitle('');
      setContent('');
      setImageFile(null);
      setShowForm(false);
      await loadRecipes();
    } catch (err) {
      console.error('Error submitting recipe:', err);
      alert('שגיאה בהוספת המתכון. נסו שוב.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (recipeId) => {
    if (!currentUser) return;
    try {
      const recipeRef = doc(db, 'communityRecipes', recipeId);
      const recipe = recipes.find(r => r.id === recipeId);
      const alreadyLiked = recipe?.likes?.includes(currentUser.uid);

      await updateDoc(recipeRef, {
        likes: alreadyLiked
          ? arrayRemove(currentUser.uid)
          : arrayUnion(currentUser.uid)
      });

      // Update local state
      setRecipes(prev => prev.map(r => {
        if (r.id !== recipeId) return r;
        const newLikes = alreadyLiked
          ? (r.likes || []).filter(id => id !== currentUser.uid)
          : [...(r.likes || []), currentUser.uid];
        return { ...r, likes: newLikes };
      }));
    } catch (err) {
      console.error('Error toggling like:', err);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-24 bg-gray-200 rounded w-full mb-2" />
        <div className="h-24 bg-gray-200 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-l from-pink-500 to-pink-600 text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">מתכונים קהילתיים</h3>
            <p className="text-pink-100 text-sm mt-1">שתפו מתכונים עם חברי הקהילה</p>
          </div>
          {userLoggedIn && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-white text-pink-600 rounded-full px-4 py-1.5 text-sm font-semibold hover:bg-pink-50 transition-colors"
            >
              {showForm ? 'ביטול' : '+ מתכון חדש'}
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Add recipe form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 bg-pink-50 rounded-lg p-4 space-y-3">
            <input
              type="text"
              placeholder="שם המתכון"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <textarea
              placeholder="הוראות הכנה..."
              value={content}
              onChange={e => setContent(e.target.value)}
              required
              rows={4}
              className="w-full px-3 py-2 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
            />
            <div>
              <label className="block text-sm text-gray-600 mb-1">תמונה (אופציונלי)</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => setImageFile(e.target.files[0])}
                className="text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-pink-500 hover:bg-pink-600 text-white rounded-lg py-2 font-semibold transition-colors disabled:opacity-50"
            >
              {submitting ? 'מעלה...' : 'פרסום מתכון'}
            </button>
          </form>
        )}

        {!userLoggedIn && (
          <div className="text-center text-gray-500 text-sm mb-4 bg-gray-50 rounded-lg py-3">
            <a href="/login" className="text-pink-600 font-semibold hover:underline">התחברו</a> כדי לשתף מתכונים ולתת לייקים
          </div>
        )}

        {/* Recipe feed */}
        {recipes.length === 0 ? (
          <p className="text-center text-gray-400 py-6">
            עדיין אין מתכונים בקהילה. היו הראשונים לשתף!
          </p>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {recipes.map((recipe) => {
              const liked = currentUser && recipe.likes?.includes(currentUser.uid);
              return (
                <div key={recipe.id} className="border border-gray-100 rounded-lg p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-800">{recipe.title}</h4>
                      <p className="text-xs text-gray-400">
                        {recipe.authorName} · {formatDate(recipe.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleLike(recipe.id)}
                      disabled={!currentUser}
                      className={`flex items-center gap-1 text-sm px-2 py-1 rounded-full transition-colors ${
                        liked
                          ? 'bg-red-100 text-red-600'
                          : 'bg-gray-100 text-gray-500 hover:bg-red-50'
                      }`}
                    >
                      {liked ? '❤️' : '🤍'} {recipe.likes?.length || 0}
                    </button>
                  </div>
                  {recipe.imageUrl && (
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.title}
                      className="w-full h-40 object-cover rounded-lg mb-2"
                    />
                  )}
                  <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-4">
                    {recipe.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeWidget;
