import React, { useState, useEffect } from 'react';
import { getDisplayDiscountInfo, getCommunityMemberCount } from '../../../services/communityDiscountService';

const ShareWidget = ({ communityName }) => {
  const [discountInfo, setDiscountInfo] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!communityName) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [info, count] = await Promise.all([
          getDisplayDiscountInfo(communityName),
          getCommunityMemberCount(communityName),
        ]);
        if (!cancelled) {
          setDiscountInfo(info);
          setMemberCount(count);
        }
      } catch (err) {
        console.error('Error loading share data:', err);
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [communityName]);

  const shareUrl = `${window.location.origin}/?pickupSpot=${encodeURIComponent(communityName)}`;

  const getShareMessage = () => {
    let msg = `\u05D4\u05D9\u05D9! \u05D0\u05E0\u05D9 \u05DE\u05D6\u05DE\u05D9\u05DF/\u05D4 \u05EA\u05D5\u05E6\u05E8\u05EA \u05D7\u05E7\u05DC\u05D0\u05D9\u05EA \u05D8\u05E8\u05D9\u05D9\u05D4 \u05D3\u05E8\u05DA \u05D4\u05E7\u05D4\u05D9\u05DC\u05D4 \u05E9\u05DC\u05E0\u05D5 \u2013 ${communityName}.\n`;
    if (discountInfo?.nextTier) {
      const remaining = Math.max(0, Math.round(discountInfo.nextTier.displayThreshold - discountInfo.weeklyTotal));
      msg += `\u05E2\u05D5\u05D3 ${remaining.toLocaleString('he-IL')} \u20AA \u05D5\u05E0\u05D2\u05D9\u05E2 \u05DC\u05D4\u05E0\u05D7\u05D4 \u05E9\u05DC ${discountInfo.nextTier.discountPercent}%!\n`;
    } else if (discountInfo?.discountPercent > 0) {
      msg += `\u05D4\u05E7\u05D4\u05D9\u05DC\u05D4 \u05E9\u05DC\u05E0\u05D5 \u05DB\u05D1\u05E8 \u05E0\u05D4\u05E0\u05D9\u05EA \u05DE\u05D4\u05E0\u05D7\u05D4 \u05E9\u05DC ${discountInfo.discountPercent}%!\n`;
    }
    msg += `\u05D1\u05D5\u05D0\u05D5 \u05DC\u05D4\u05D6\u05DE\u05D9\u05DF \u05D2\u05DD: ${shareUrl}`;
    return msg;
  };

  const handleWhatsAppShare = () => {
    const msg = encodeURIComponent(getShareMessage());
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSmsShare = () => {
    const msg = encodeURIComponent(getShareMessage());
    window.open(`sms:?body=${msg}`, '_blank');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-20 bg-gray-200 rounded w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <p className="text-red-500 text-sm text-center">שגיאה בטעינת נתונים: {error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-l from-indigo-600 to-indigo-700 text-white px-6 py-4">
        <h3 className="text-lg font-bold">שיתוף והזמנת חברים</h3>
        <p className="text-indigo-100 text-sm mt-1">
          הזמינו שכנים וחברים - ככל שיותר מזמינים, ההנחה גדלה!
        </p>
      </div>

      <div className="p-6">
        {/* Member count */}
        <div className="text-center mb-6 bg-indigo-50 rounded-lg py-4">
          <p className="text-sm text-indigo-600">חברי קהילה פעילים</p>
          <p className="text-3xl font-bold text-indigo-900">{memberCount}</p>
        </div>

        {/* Share buttons */}
        <div className="space-y-3">
          <button
            onClick={handleWhatsAppShare}
            className="w-full flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white rounded-lg px-4 py-3 font-semibold transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            שתפו בוואטסאפ
          </button>

          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-4 py-3 font-semibold transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            {copied ? 'הלינק הועתק!' : 'העתקת לינק'}
          </button>

          <button
            onClick={handleSmsShare}
            className="w-full flex items-center justify-center gap-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg px-4 py-3 font-semibold transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            שתפו ב-SMS
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareWidget;
