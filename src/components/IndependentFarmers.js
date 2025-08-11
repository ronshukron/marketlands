import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import LoadingSpinner from './LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import { pickupSpots } from '../data/pickupSpots';

const IndependentFarmers = () => {
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPickupSpot, setSelectedPickupSpot] = useState(() => {
    return localStorage.getItem('selectedPickupSpot') || '';
  });
  const navigate = useNavigate();

  // Save to localStorage whenever selectedPickupSpot changes
  useEffect(() => {
    if (selectedPickupSpot) {
      localStorage.setItem('selectedPickupSpot', selectedPickupSpot);
    } else {
      localStorage.removeItem('selectedPickupSpot');
    }
  }, [selectedPickupSpot]);

  useEffect(() => {
    fetchIndependentFarmers();
  }, []);

  const fetchIndependentFarmers = async () => {
    setLoading(true);
    try {
      // Query businesses that are marked as independent farmers
      const q = query(
        collection(db, 'businesses'),
        where('isIndependent', '==', true) // We'll need to add this field to mark independent farmers
      );
      const querySnapshot = await getDocs(q);

      const farmersData = [];
      
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        
        const farmer = {
          id: docSnap.id,
          ...data,
          type: 'independent_farmer'
        };

        farmersData.push(farmer);
      }

      setFarmers(farmersData);
    } catch (error) {
      console.error('Error fetching independent farmers: ', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle click to navigate to farmer's page
  const handleFarmerClick = (farmer, e) => {
    e.preventDefault();
    
    // Navigate to independent farmer order page
    navigate(`/independent-farmer/${farmer.id}`);
  };

  // Filter farmers by pickup spot
  const filteredFarmers = useMemo(() => {
    if (!selectedPickupSpot || selectedPickupSpot === "הכל") {
      return farmers; 
    }
    
    return farmers.filter(farmer => {
      return farmer.deliveryAreas && farmer.deliveryAreas.includes(selectedPickupSpot);
    });
  }, [farmers, selectedPickupSpot]);

  return (
    <div className="bg-white" dir="rtl">
      {/* Top Section */}
      <div className="relative bg-gradient-to-r from-green-600 to-green-800 text-white overflow-hidden rounded-xl mb-8">
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
            <path d="M32 16.58C26.76 16.58 22.5 12.32 22.5 7.08C22.5 6.67 22.15 6.33 21.75 6.33C21.35 6.33 21 6.67 21 7.08C21 13.1 25.98 18.08 32 18.08C32.4 18.08 32.75 17.73 32.75 17.33C32.75 16.93 32.4 16.58 32 16.58Z" fill="currentColor" />
          </svg>
        </div>
        
        <div className="px-6 py-10 relative z-10">
          <div className="mb-8">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 text-center tracking-tight">
              חקלאים עצמאיים
            </h1>
            <div className="h-1 w-24 bg-yellow-400 mx-auto rounded-full mb-4"></div>
            <p className="text-green-100 text-center max-w-3xl mx-auto text-lg">
              חקלאים שמוכרים ישירות לקהילות ללא מסלולים קבועים
            </p>
          </div>
          
          {/* Region Selector */}
          <div className="max-w-xs mx-auto">
            <label className="block text-green-100 text-sm font-medium mb-2 text-center">אזור אספקה:</label>
            <div className="relative">
              <select
                value={selectedPickupSpot}
                onChange={(e) => setSelectedPickupSpot(e.target.value)}
                className="block w-full p-3 pr-10 text-right text-sm text-gray-900 bg-white bg-opacity-95 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 shadow-md appearance-none"
                dir="rtl"
              >
                <option value="הכל">הכל</option>
                {pickupSpots.map((spot) => (
                  <option key={spot} value={spot}>
                    {spot}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        {/* Decorative wave divider */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 1440 100" 
            className="w-full h-auto transform translate-y-1"
            fill="#f9fafb"
          >
            <path d="M0,32L60,42.7C120,53,240,75,360,69.3C480,64,600,32,720,26.7C840,21,960,43,1080,53.3C1200,64,1320,64,1380,64L1440,64L1440,100L1380,100C1320,100,1200,100,1080,100C960,100,840,100,720,100C600,100,480,100,360,100C240,100,120,100,60,100L0,100Z"></path>
          </svg>
        </div>
      </div>

      {/* Display loading spinner or farmers */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner />
        </div>
      ) : filteredFarmers.length === 0 ? (
        <div className="text-center py-12">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">אין חקלאים עצמאיים זמינים</h3>
          <p className="text-gray-600">
            {selectedPickupSpot && selectedPickupSpot !== "הכל" 
              ? `לא נמצאו חקלאים עצמאיים באזור ${selectedPickupSpot}`
              : "לא נמצאו חקלאים עצמאיים כרגע"
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFarmers.map((farmer) => (
            <div
              key={farmer.id}
              onClick={(e) => handleFarmerClick(farmer, e)}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300 cursor-pointer border-2 border-green-200 hover:border-green-400"
              dir="rtl"
            >
              <div className="relative pt-[50%]">
                {farmer.logo && (
                  <img
                    src={farmer.logo}
                    alt={farmer.businessName}
                    className="absolute top-0 left-0 w-full h-full object-cover"
                  />
                )}
                
                {/* Badge for independent farmers */}
                <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                  חקלאי עצמאי
                </div>
              </div>

              <div className="p-4">
                <h3 className="text-lg font-semibold mb-2 text-gray-900">
                  {farmer.businessName}
                </h3>

                <div className="space-y-1 text-sm">
                  {farmer.communityName && (
                    <p className="text-gray-700">
                      <span className="font-medium">קהילה:</span> {farmer.communityName}
                    </p>
                  )}
                  
                  {farmer.businessKind && (
                    <p className="text-gray-700">
                      <span className="font-medium">סוג עסק:</span> {farmer.businessKind}
                    </p>
                  )}
                  
                  {farmer.deliveryAreas && farmer.deliveryAreas.length > 0 && (
                    <p className="text-gray-700">
                      <span className="font-medium">אזורי אספקה:</span> {farmer.deliveryAreas.slice(0, 2).join(', ')}
                      {farmer.deliveryAreas.length > 2 && ' ועוד...'}
                    </p>
                  )}
                </div>

                {farmer.description && (
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                    {farmer.description}
                  </p>
                )}

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm text-green-600 font-semibold">
                    לחץ לצפייה במוצרים ורכישה
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default IndependentFarmers; 