import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const VolunteerShareSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderId, orderName, volunteerInfo, whatsappLink, shareMessage } = location.state || {};

  if (!orderId || !volunteerInfo) {
    return (
      <div className="max-w-3xl mx-auto p-4" dir="rtl">
        <h1 className="text-xl font-bold mb-4">עמוד לא נמצא</h1>
        <p className="text-gray-600">לא נמצאו נתוני התנדבות.</p>
        <button onClick={() => navigate('/')} className="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-900 py-2 px-3 rounded">חזרה לעמוד הבית</button>
      </div>
    );
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
      alert('הודעה הועתקה ללוח!');
    } catch (err) {
      console.error('Failed to copy: ', err);
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = shareMessage;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('הודעה הועתקה ללוח!');
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen py-8 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-green-600 text-white px-6 py-4">
          <h1 className="text-2xl font-bold">🎉 תודה על ההתנדבות!</h1>
          <p className="text-green-100 mt-1">נרשמתם כמתנדבים להזמנה: {orderName || orderId}</p>
        </div>
        
        <div className="p-6">
          {/* Success Message */}
          <div className="bg-green-50 rounded-lg p-6 mb-6">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="mr-3">
                <h3 className="text-lg font-semibold text-green-800">ההתנדבות נרשמה בהצלחה!</h3>
                <p className="text-green-700">אתם עכשיו נקודת האיסוף עבור הקהילה שלכם להזמנה זו.</p>
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <h4 className="font-semibold text-gray-800 mb-2">פרטי נקודת האיסוף:</h4>
              <div className="space-y-1 text-sm text-gray-700">
                <p><strong>שם:</strong> {volunteerInfo.fullName}</p>
                <p><strong>טלפון:</strong> {volunteerInfo.phone}</p>
                <p><strong>קהילה:</strong> {volunteerInfo.community}</p>
                <p><strong>כתובת:</strong> {volunteerInfo.address}</p>
                {volunteerInfo.locationInstructions && (
                  <p><strong>הנחיות מיקום:</strong> {volunteerInfo.locationInstructions}</p>
                )}
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">השלבים הבאים</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold ml-3">1</span>
                <div>
                  <h3 className="font-semibold text-gray-800">שתף את ההזמנה</h3>
                  <p className="text-gray-600 text-sm">שתף את ההזמנה בקבוצות וואטסאפ מקומיות כדי לעזור להגיע לסף המינימום</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold ml-3">2</span>
                <div>
                  <h3 className="font-semibold text-gray-800">חכה להודעות</h3>
                  <p className="text-gray-600 text-sm">תקבל הודעות עדכון על סטטוס ההזמנה ופרטי האיסוף</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold ml-3">3</span>
                <div>
                  <h3 className="font-semibold text-gray-800">קבל את ההזמנה</h3>
                  <p className="text-gray-600 text-sm">כשההזמנה תגיע, תקבל הודעה ותוכל לתאם איסוף עם התושבים</p>
                </div>
              </div>
            </div>
          </div>

          {/* WhatsApp Share Section */}
          <div className="bg-blue-50 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">שתף בוואטסאפ</h2>
            <p className="text-gray-700 mb-4">
              עזור להגיע לסף המינימום על ידי שיתוף ההזמנה בקבוצות הוואטסאפ המקומיות שלך:
            </p>
            
            {/* Message Preview */}
            <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
              <h4 className="font-semibold text-gray-800 mb-2">תצוגה מקדימה של ההודעה:</h4>
              <div className="text-sm text-gray-700 whitespace-pre-line border-r-4 border-green-500 pr-3">
                {shareMessage}
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <a 
                href={whatsappLink}
                target="_blank" 
                rel="noreferrer" 
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-3 rounded-md text-center transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                </svg>
                שתף בוואטסאפ
              </a>
              <button 
                onClick={copyToClipboard}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2.5 px-3 rounded-md transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                העתק הודעה
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            <button 
              onClick={() => navigate(`/independent/order/${orderId}`)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-md transition-colors duration-200"
            >
              חזרה להזמנה
            </button>
            <button 
              onClick={() => navigate('/')}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-3 px-4 rounded-md transition-colors duration-200"
            >
              לעמוד הבית
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VolunteerShareSuccess; 