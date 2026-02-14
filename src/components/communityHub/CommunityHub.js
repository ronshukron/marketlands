import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getWidgetsForCommunity } from '../../services/communityHubService';
import { getWidgetById } from './widgetRegistry';
import { pickupSpotsData } from '../../data/pickupSpots';
import { usePickupSpot } from '../../contexts/PickupSpotContext';

const CommunityHub = () => {
  const { communityId } = useParams();
  const navigate = useNavigate();
  const { selectedPickupSpot, updatePickupSpot } = usePickupSpot();

  const communityName = decodeURIComponent(communityId || '');
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);

  // All available communities (from pickupSpots data)
  const communities = Object.keys(pickupSpotsData);

  useEffect(() => {
    if (!communityName) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const widgetList = await getWidgetsForCommunity(communityName);
        if (!cancelled) setWidgets(widgetList);
      } catch (err) {
        console.error('Error loading hub config:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [communityName]);

  // Set this community as the selected pickup spot when visiting
  useEffect(() => {
    if (communityName && communityName !== selectedPickupSpot) {
      updatePickupSpot(communityName);
    }
  }, [communityName]);

  const handleCommunityChange = (newCommunity) => {
    navigate(`/community/${encodeURIComponent(newCommunity)}`);
  };

  if (!communityName) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">בחרו קהילה</h1>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg">
            {communities.map((name) => (
              <Link
                key={name}
                to={`/community/${encodeURIComponent(name)}`}
                className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center hover:shadow-md hover:border-green-400 transition-all text-gray-700 font-medium"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Hero / Header */}
      <div className="bg-gradient-to-l from-green-700 via-green-600 to-emerald-600 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-green-200 text-sm mb-1">מרכז הקהילה</p>
              <h1 className="text-3xl font-bold">{communityName}</h1>
              <p className="text-green-100 mt-2">
                ברוכים הבאים למרכז הקהילה! כאן תוכלו לעקוב אחרי ההנחות, הנתונים והמתכונים של הקהילה.
              </p>
            </div>

            {/* Community selector */}
            <select
              value={communityName}
              onChange={(e) => handleCommunityChange(e.target.value)}
              className="bg-white/20 text-white border border-white/30 rounded-lg px-4 py-2 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              {communities.map((name) => (
                <option key={name} value={name} className="text-gray-800">
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick action */}
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-white text-green-700 rounded-full px-6 py-2.5 font-semibold hover:bg-green-50 transition-colors shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              להזמנה עכשיו
            </Link>
          </div>
        </div>
      </div>

      {/* Widgets */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="h-24 bg-gray-200 rounded w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {widgets.map((widgetConfig) => {
              const widgetDef = getWidgetById(widgetConfig.id);
              if (!widgetDef) return null;
              const WidgetComponent = widgetDef.component;
              return (
                <div key={widgetConfig.id}>
                  <WidgetComponent communityName={communityName} />
                </div>
              );
            })}
            {widgets.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">עמוד הקהילה בהקמה</p>
                <p className="text-sm mt-2">התכנים יופיעו כאן בקרוב</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityHub;
