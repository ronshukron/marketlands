import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';

const AdminRefundRequests = () => {
  const { currentUser } = useAuth();
  const [allRefundRequests, setAllRefundRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [filter, setFilter] = useState('pending'); // 'all', 'pending', 'completed'
  
  // Admin UIDs - add your user ID here
  const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2']; // Replace with your actual admin UID

  useEffect(() => {
    // Check if user is admin
    const checkAdminAndFetchRequests = async () => {
      if (!currentUser) {
        setError("יש להתחבר כדי לגשת לדף זה");
        setLoading(false);
        return;
      }

      try {
        // Check if current user is authorized using the ADMIN_UIDS array
        if (!ADMIN_UIDS.includes(currentUser.uid)) {
          setError("אין לך הרשאות לצפות בדף זה");
          setLoading(false);
          return;
        }
        // Fetch refund requests
        fetchRefundRequests();
      } catch (err) {
        console.error("Error checking admin status:", err);
        setError("אירעה שגיאה בטעינת הדף");
        setLoading(false);
      }
    };

    checkAdminAndFetchRequests();
  }, [currentUser]);

  // Apply filter whenever filter or allRefundRequests changes
  useEffect(() => {
    if (filter === 'all') {
      setFilteredRequests(allRefundRequests);
    } else {
      setFilteredRequests(allRefundRequests.filter(request => request.status === filter));
    }
  }, [filter, allRefundRequests]);

  const fetchRefundRequests = async () => {
    setLoading(true);
    try {
      // Simple collection fetch without complex queries
      const refundsCollection = collection(db, 'refunds');
      const querySnapshot = await getDocs(refundsCollection);

      const requests = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAtFormatted: doc.data().createdAt ? 
          new Date(doc.data().createdAt.toDate()).toLocaleDateString('he-IL') : 'N/A'
      }));
      
      // Sort by date (newest first)
      requests.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB - dateA;
      });
      
      setAllRefundRequests(requests);
      // Initial filtering will happen in the useEffect
    } catch (err) {
      console.error("Error fetching refund requests:", err);
      setError("אירעה שגיאה בטעינת בקשות ההחזר");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (requestId, newStatus) => {
    setProcessingId(requestId);
    try {
      const refundRef = doc(db, 'refunds', requestId);
      await updateDoc(refundRef, {
        status: newStatus,
        processedAt: new Date(),
        processedBy: currentUser.uid
      });
      
      // Update the local state
      const updatedRequests = allRefundRequests.map(req => 
        req.id === requestId ? { ...req, status: newStatus } : req
      );
      setAllRefundRequests(updatedRequests);
      // Filtering will be reapplied by the useEffect
    } catch (err) {
      console.error("Error updating refund status:", err);
      alert("אירעה שגיאה בעדכון סטטוס ההחזר");
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending':
        return 'ממתין לטיפול';
      case 'completed':
        return 'הושלם';
      case 'rejected':
        return 'נדחה';
      default:
        return status;
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600 font-semibold text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-2xl font-bold mb-6 text-center">ניהול בקשות החזר כספי</h1>
      
      {/* Filter controls */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-md shadow-sm" role="group">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
              filter === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-100'
            } border border-gray-200`}
          >
            הכל
          </button>
          <button
            type="button"
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 text-sm font-medium ${
              filter === 'pending' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-100'
            } border-t border-b border-gray-200`}
          >
            ממתינים
          </button>
          <button
            type="button"
            onClick={() => setFilter('completed')}
            className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
              filter === 'completed' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-100'
            } border border-gray-200`}
          >
            הושלמו
          </button>
        </div>
      </div>
      
      {filteredRequests.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">לא נמצאו בקשות החזר {filter !== 'all' ? `בסטטוס ${getStatusText(filter)}` : ''}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">תאריך</th>
                <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">לקוח</th>
                <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">עסק</th>
                <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סכום</th>
                <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סיבה</th>
                <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סטטוס</th>
                <th className="py-3 px-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRequests.map((request) => (
                <tr key={request.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-900">{request.createdAtFormatted}</td>
                  <td className="py-3 px-4">
                    <div className="text-sm font-medium text-gray-900">{request.userName || 'לא צוין'}</div>
                    <div className="text-xs text-gray-500">{request.userEmail}</div>
                    {request.userPhone && <div className="text-xs text-gray-500">{request.userPhone}</div>}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900">{request.businessName || 'לא צוין'}</td>
                  <td className="py-3 px-4 text-sm text-gray-900">₪{request.orderAmount?.toFixed(2) || '0.00'}</td>
                  <td className="py-3 px-4 text-sm text-gray-900">
                    <div className="max-w-xs overflow-hidden text-ellipsis">{request.reason}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(request.status)}`}>
                      {getStatusText(request.status)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {request.status === 'pending' && (
                      <div className="flex space-x-2 space-x-reverse">
                        <button
                          onClick={() => handleStatusChange(request.id, 'completed')}
                          disabled={processingId === request.id}
                          className={`px-3 py-1 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 transition-colors ${
                            processingId === request.id ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {processingId === request.id ? 'מעדכן...' : 'אשר החזר'}
                        </button>
                        <button
                          onClick={() => handleStatusChange(request.id, 'rejected')}
                          disabled={processingId === request.id}
                          className={`px-3 py-1 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 transition-colors ${
                            processingId === request.id ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          דחה
                        </button>
                      </div>
                    )}
                    {request.status !== 'pending' && (
                      <span className="text-gray-500 text-xs">טופל</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminRefundRequests; 