import React, { useEffect, Suspense, lazy } from 'react';
import './Home.css';
import CategoryStore from './category-store/CategoryStore';
import ModeToggle from './shared/ModeToggle';
import { useSaleMode } from '../contexts/SaleModeContext';
import heroImage from '../images/Field.jpg';

const MarketplaceHome = lazy(() => import('./marketplace/MarketplaceHome'));

const Home = () => {
  const { saleMode, setSaleMode } = useSaleMode();

  // Always reset to 'weekly' mode when Home component mounts
  useEffect(() => {
    setSaleMode('weekly');
  }, [setSaleMode]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Enhanced Welcome Section */}
      <div 
        className="relative py-16 md:py-24 bg-gradient-to-br from-blue-500 to-blue-700 text-white" 
        style={{
          backgroundImage: `linear-gradient(to bottom right, rgba(37, 99, 235, 0.9), rgba(29, 78, 216, 0.85)), url(${heroImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center relative z-10">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-white drop-shadow-md">
            ברוכים הבאים לשוק
            </h1>
            <p className="mt-3 max-w-2xl mx-auto text-lg md:text-xl text-blue-50 leading-relaxed">
            מחברים בין קהילות לחקלאים מקומיים
            </p>
            <div className="mt-6 flex flex-col items-center gap-4">
              <ModeToggle />
            </div>
          </div>
        </div>
        
        {/* Decorative wave divider */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 1440 100" 
            className="w-full h-auto transform translate-y-1"
          >
            <path 
              fill="#f9fafb" 
              fillOpacity="1" 
              d="M0,32L60,42.7C120,53,240,75,360,69.3C480,64,600,32,720,26.7C840,21,960,43,1080,53.3C1200,64,1320,64,1380,64L1440,64L1440,100L1380,100C1320,100,1200,100,1080,100C960,100,840,100,720,100C600,100,480,100,360,100C240,100,120,100,60,100L0,100Z"
            ></path>
          </svg>
        </div>
      </div>

      <div className="bg-gray-50 py-8" id="store-section">
        <div className="w-full px-2 sm:px-4">
          {saleMode === 'business' ? (
            <Suspense fallback={<div className="p-8 text-center text-gray-500" dir="rtl">טוען...</div>}>
              <MarketplaceHome hideMainStore />
            </Suspense>
          ) : (
            <CategoryStore />
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
