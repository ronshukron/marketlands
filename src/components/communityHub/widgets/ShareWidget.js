import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/authContext';
import { getDisplayDiscountInfo, getCommunityMemberCount } from '../../../services/communityDiscountService';
import { getReferralConfig, getOrCreateReferralCode } from '../../../services/referralService';

const ShareWidget = ({ communityName }) => {
  const { currentUser } = useAuth();
  const [discountInfo, setDiscountInfo] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [referralMode, setReferralMode] = useState('community');
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    if (!communityName) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [info, count, config] = await Promise.all([
          getDisplayDiscountInfo(communityName),
          getCommunityMemberCount(communityName),
          getReferralConfig(),
        ]);
        if (!cancelled) {
          setDiscountInfo(info);
          setMemberCount(count);
          setReferralMode(config.mode || 'community');
          if (config.mode === 'personal' && currentUser?.uid) {
            const code = await getOrCreateReferralCode(currentUser.uid);
            if (!cancelled) setReferralCode(code);
          }
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
  }, [communityName, currentUser?.uid]);

  const shareUrl = referralMode === 'personal' && referralCode
    ? `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`
    : `${window.location.origin}/?community=${encodeURIComponent(communityName)}`;

  const getShareMessage = () => {
    if (referralMode === 'personal' && referralCode) {
      return `היי! הזמינו דרך הקישור שלי ותקבלו הנחה: ${shareUrl}`;
    }
    let msg = `היי! אני מזמין/ה תוצרת חקלאית טרייה דרך הקהילה שלנו – ${communityName}.\n`;
    if (discountInfo?.nextTier) {
      const remaining = Math.max(0, Math.round(discountInfo.nextTier.displayThreshold - discountInfo.weeklyTotal));
      msg += `עוד ${remaining.toLocaleString('he-IL')} ₪ ונגיע להנחה של ${discountInfo.nextTier.discountPercent}%!\n`;
    } else if (discountInfo?.discountPercent > 0) {
      msg += `הקהילה שלנו כבר נהנית מהנחה של ${discountInfo.discountPercent}%!\n`;
    }
    msg += `בואו להזמין גם: ${shareUrl}`;
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
          {referralMode === 'personal'
            ? 'שתפו את הקישור האישי שלכם וקבלו תגמול על הזמנות חדשות'
            : 'הזמינו שכנים וחברים - ככל שיותר מזמינים, ההנחה גדלה!'}
        </p>
      </div>

      <div className="p-6">
        {referralMode === 'community' && (
          <div className="text-center mb-6 bg-indigo-50 rounded-lg py-4">
            <p className="text-sm text-indigo-600">חברי קהילה פעילים</p>
            <p className="text-3xl font-bold text-indigo-900">{memberCount}</p>
          </div>
        )}

        {referralMode === 'personal' && referralCode && (
          <div className="text-center mb-6 bg-purple-50 rounded-lg py-4">
            <p className="text-sm text-purple-600">קוד ההפניה שלכם</p>
            <p className="text-2xl font-bold text-purple-900">{referralCode}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleWhatsAppShare}
            className="w-full flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white rounded-lg px-4 py-3 font-semibold transition-colors"
          >
            שתפו בוואטסאפ
          </button>

          <button
            onClick={handleCopyLink}
            className="w-full flex items-center justify-center gap-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-4 py-3 font-semibold transition-colors"
          >
            {copied ? 'הלינק הועתק!' : 'העתקת לינק'}
          </button>

          <button
            onClick={handleSmsShare}
            className="w-full flex items-center justify-center gap-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg px-4 py-3 font-semibold transition-colors"
          >
            שתפו ב-SMS
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareWidget;
