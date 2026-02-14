import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCommunityHubConfig, saveCommunityHubConfig } from '../../services/communityHubService';
import { getAllWidgets } from '../communityHub/widgetRegistry';

const CommunityHubAdmin = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const allWidgets = getAllWidgets();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getCommunityHubConfig();
        setConfig(data);
      } catch (err) {
        console.error('Error loading hub config:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getWidgetConfig = (widgetId) => {
    return config?.widgets?.find(w => w.id === widgetId) || { id: widgetId, enabled: true, order: 99 };
  };

  const handleToggleWidget = (widgetId) => {
    setConfig(prev => {
      const widgets = [...(prev.widgets || [])];
      const idx = widgets.findIndex(w => w.id === widgetId);
      if (idx >= 0) {
        widgets[idx] = { ...widgets[idx], enabled: !widgets[idx].enabled };
      } else {
        widgets.push({ id: widgetId, enabled: true, order: widgets.length });
      }
      return { ...prev, widgets };
    });
  };

  const handleMoveUp = (widgetId) => {
    setConfig(prev => {
      const widgets = [...(prev.widgets || [])].sort((a, b) => a.order - b.order);
      const idx = widgets.findIndex(w => w.id === widgetId);
      if (idx <= 0) return prev;
      // Swap orders
      const temp = widgets[idx].order;
      widgets[idx] = { ...widgets[idx], order: widgets[idx - 1].order };
      widgets[idx - 1] = { ...widgets[idx - 1], order: temp };
      return { ...prev, widgets };
    });
  };

  const handleMoveDown = (widgetId) => {
    setConfig(prev => {
      const widgets = [...(prev.widgets || [])].sort((a, b) => a.order - b.order);
      const idx = widgets.findIndex(w => w.id === widgetId);
      if (idx < 0 || idx >= widgets.length - 1) return prev;
      const temp = widgets[idx].order;
      widgets[idx] = { ...widgets[idx], order: widgets[idx + 1].order };
      widgets[idx + 1] = { ...widgets[idx + 1], order: temp };
      return { ...prev, widgets };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const success = await saveCommunityHubConfig(config);
      if (success) {
        setMessage('ההגדרות נשמרו בהצלחה!');
      } else {
        setMessage('שגיאה בשמירת ההגדרות');
      }
    } catch (err) {
      console.error('Error saving:', err);
      setMessage('שגיאה בשמירת ההגדרות');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  // Sort widgets by their configured order
  const sortedWidgetIds = [...allWidgets]
    .sort((a, b) => {
      const orderA = getWidgetConfig(a.id).order;
      const orderB = getWidgetConfig(b.id).order;
      return orderA - orderB;
    });

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link to="/admin" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
              ← חזרה ללוח ניהול
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">ניהול מרכז קהילה</h1>
            <p className="text-gray-600 mt-1">בחרו אילו רכיבים להציג בעמוד הקהילה וסדרו אותם</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg text-center font-medium ${
            message.includes('שגיאה') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            {message}
          </div>
        )}

        {/* Widget list */}
        <div className="space-y-3">
          {sortedWidgetIds.map((widget, idx) => {
            const wConfig = getWidgetConfig(widget.id);
            return (
              <div
                key={widget.id}
                className={`bg-white rounded-xl shadow-sm border p-5 transition-all ${
                  wConfig.enabled ? 'border-green-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Reorder arrows */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveUp(widget.id)}
                        disabled={idx === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMoveDown(widget.id)}
                        disabled={idx === sortedWidgetIds.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    <div className="text-2xl">{widget.icon}</div>

                    <div>
                      <h3 className="font-semibold text-gray-800">{widget.title}</h3>
                      <p className="text-sm text-gray-500">{widget.description}</p>
                    </div>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => handleToggleWidget(widget.id)}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                      wConfig.enabled ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        wConfig.enabled ? 'translate-x-1' : 'translate-x-8'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick links */}
        <div className="mt-8 bg-blue-50 rounded-xl border border-blue-200 p-6">
          <h3 className="font-semibold text-blue-800 mb-3">קישורים מהירים</h3>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/admin/community-discount"
              className="bg-white text-blue-700 border border-blue-200 rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              הגדרות הנחות קהילה
            </Link>
            <Link
              to="/community"
              className="bg-white text-blue-700 border border-blue-200 rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              צפייה בעמוד קהילה (לייב)
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityHubAdmin;
