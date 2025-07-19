// src/components/admin/WeeklyOrderSummary.js
import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../contexts/authContext';
import LoadingSpinner from '../LoadingSpinner';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const WeeklyOrderSummary = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [businessSummary, setBusinessSummary] = useState({});
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [ordersByPickupSpot, setOrdersByPickupSpot] = useState({});
  
  // Refs for PDF generation
  const pdfRefs = useRef({});
  
  // Admin UIDs - add your user ID here
  const ADMIN_UIDS = ['rfHOLhNoJOW8ByNypCtm3hlSNKs2']; // Replace with your actual UID
  
  useEffect(() => {
    // Check if current user is authorized
    if (!currentUser || !ADMIN_UIDS.includes(currentUser.uid)) {
      setError("You are not authorized to view this page");
      setLoading(false);
      return;
    }
    
    fetchWeeklyOrders();
  }, [currentUser]);
  
  const fetchWeeklyOrders = async () => {
    setLoading(true);
    try {
      // Calculate date range for the past week
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 4);
      
      setDateRange({
        start: format(startDate, 'dd/MM/yyyy'),
        end: format(endDate, 'dd/MM/yyyy')
      });
      
      // Convert to ISO strings for comparison
      const startDateISO = startDate.toISOString();
      const endDateISO = endDate.toISOString();
      
      // Query for completed orders from the past week
      const ordersRef = collection(db, 'customerOrders');
      const ordersSnapshot = await getDocs(ordersRef);
      
      const filteredOrders = [];
      const businessProductMap = {};
      const pickupSpotMap = {};
      
      // Process each order
      ordersSnapshot.docs.forEach(doc => {
        const orderData = doc.data();
        
        // Check if order is completed and created within the past week
        const createdAt = orderData.createdAt;
        const paymentStatus = orderData.paymentStatus;
        
        // Skip if not completed
        if (paymentStatus !== 'completed') return;
        
        // Parse the createdAt date (handle both string and timestamp formats)
        let createdDate;
        if (typeof createdAt === 'string') {
          createdDate = new Date(createdAt);
        } else if (createdAt && createdAt.toDate) {
          createdDate = createdAt.toDate();
        } else {
          // Skip if no valid date
          return;
        }
        
        // Check if within date range
        const createdDateISO = createdDate.toISOString();
        if (createdDateISO >= startDateISO && createdDateISO <= endDateISO) {
          // Add to filtered orders
          const orderWithDate = {
            id: doc.id,
            ...orderData,
            createdDate
          };
          
          filteredOrders.push(orderWithDate);
          
          // Group by pickup spot
          const pickupSpot = orderData.customerDetails?.pickupSpot || 'לא צוין';
          if (!pickupSpotMap[pickupSpot]) {
            pickupSpotMap[pickupSpot] = [];
          }
          pickupSpotMap[pickupSpot].push(orderWithDate);
          
          // Process business summary
          if (orderData.orderBreakdown) {
            Object.values(orderData.orderBreakdown).forEach(businessOrder => {
              const businessId = businessOrder.businessId;
              const businessName = businessOrder.businessName;
              
              if (!businessProductMap[businessId]) {
                businessProductMap[businessId] = {
                  businessName,
                  products: {},
                  totalRevenue: 0
                };
              }
              
              // Process each item
              businessOrder.items.forEach(item => {
                const productId = item.productId;
                const productName = item.productName;
                const quantity = item.quantity;
                const price = item.price;
                const totalPrice = price * quantity;
                const selectedOption = item.selectedOption;
                
                // Create product key that includes the option
                const productKey = `${productId}_${selectedOption}`;
                
                if (!businessProductMap[businessId].products[productKey]) {
                  businessProductMap[businessId].products[productKey] = {
                    productName,
                    selectedOption,
                    quantity: 0,
                    totalRevenue: 0
                  };
                }
                
                // Update product stats
                businessProductMap[businessId].products[productKey].quantity += quantity;
                businessProductMap[businessId].products[productKey].totalRevenue += totalPrice;
                
                // Update business total revenue
                businessProductMap[businessId].totalRevenue += totalPrice;
              });
            });
          }
        }
      });
      
      // Sort orders by date (newest first)
      filteredOrders.sort((a, b) => b.createdDate - a.createdDate);
      
      // Sort orders within each pickup spot
      Object.keys(pickupSpotMap).forEach(spot => {
        pickupSpotMap[spot].sort((a, b) => b.createdDate - a.createdDate);
      });
      
      setCustomerOrders(filteredOrders);
      setBusinessSummary(businessProductMap);
      setOrdersByPickupSpot(pickupSpotMap);
    } catch (err) {
      console.error("Error fetching weekly orders:", err);
      setError("Failed to load order data");
    } finally {
      setLoading(false);
    }
  };
  
  // PDF generation function for a specific pickup spot
  const generatePDF = async (pickupSpot, orders) => {
    try {
      // Create a new document
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true
      });
      
      // Group items by customer, aggregating items if a customer has multiple orders
      const customerItems = {}; // Stores { normalizedName: { displayName: 'Name', items: [...] } }
      
      orders.forEach(order => {
        const rawCustomerName = order.customerDetails?.name || 'לקוח לא ידוע';
        // Normalize the customer name (e.g., trim whitespace) to ensure consistent grouping
        const normalizedCustomerName = rawCustomerName.trim(); 

        if (!customerItems[normalizedCustomerName]) {
          customerItems[normalizedCustomerName] = {
            displayName: rawCustomerName, // Use the first encountered name for display
            items: []
          };
        }
        
        // Add items from this order to the customer's aggregated list
        if (order.orderBreakdown) {
          Object.values(order.orderBreakdown).forEach(businessOrder => {
            (businessOrder.items || []).forEach(item => {
              customerItems[normalizedCustomerName].items.push({
                productName: item.productName,
                quantity: item.quantity,
                option: item.selectedOption,
                businessName: businessOrder.businessName // Preserving for potential future use
              });
            });
          });
        }
      });
      
      // Character count pagination approach
      const CHARS_PER_PAGE = 1300; 
      let currentPage = 1;
      let currentChars = 0;
      let pagesContent = [[]]; // Array of pages, each containing rows
      
      // Process each customer and their aggregated items
      Object.entries(customerItems).forEach(([normalizedName, customerData]) => {
        const displayNameForPdf = customerData.displayName; // Use the stored display name
        const aggregatedItemsList = customerData.items;

        // Format all aggregated items in a single line
        const itemsText = aggregatedItemsList.map(item => {
          let text = `${item.quantity}× ${item.productName}`;
          if (item.option && item.option !== 'ללא אופציות' && item.option !== 'None') {
            text += ` (${item.option})`;
          }
          return text;
        }).join(', ');
        
        // Calculate total characters in this row
        const rowChars = displayNameForPdf.length + itemsText.length;
        
        // Always start a new page if this is a very long row
        if (rowChars > CHARS_PER_PAGE) {
          // If this isn't the first item on the page and it's a very long item,
          // start a new page for it
          if (pagesContent[currentPage - 1].length > 0) {
            currentPage++;
            currentChars = 0;
            pagesContent.push([]);
          }
        }
        // If adding this row would exceed the page limit, start a new page
        else if (currentChars + rowChars > CHARS_PER_PAGE && pagesContent[currentPage - 1].length > 0) {
          currentPage++;
          currentChars = 0;
          pagesContent.push([]);
        }
        
        // Add row to current page
        pagesContent[currentPage - 1].push({
          type: 'row',
          name: displayNameForPdf, // Use the display name for the PDF
          items: itemsText,
          chars: rowChars
        });
        
        currentChars += rowChars;
      });
      
      // Generate HTML for each page
      const renderPage = (pageContent) => {
        const element = document.createElement('div');
        element.style.width = '595px'; // A4 width in pixels at 72 dpi
        element.style.fontFamily = 'Arial, sans-serif';
        element.style.direction = 'rtl';
        element.style.textAlign = 'right';
        element.style.padding = '10px 20px 30px 20px';
        element.style.boxSizing = 'border-box';
        
        // Create HTML content
        let htmlContent = `
          <div style="text-align: center; margin-bottom: 5px;">
            <h1 style="font-size: 14px; color: #2563EB; margin: 0;">נקודת איסוף: ${pickupSpot}</h1>
            <p style="font-size: 10px; margin: 2px 0 0 0;">עמוד ${pageContent.pageNum} מתוך ${pageContent.totalPages}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 5px;">
            <thead>
              <tr style="background-color: #f3f4f6; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 3px; text-align: right; font-size: 14px; font-weight: bold;">שם</th>
                <th style="padding: 3px; text-align: right; font-size: 14px; font-weight: bold;">פריטים</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        // Add each row for this page
        pageContent.rows.forEach(row => {
          if (row.type === 'row') {
            htmlContent += `
              <tr style="border-bottom: 2px solid #666666;">
                <td style="padding: 4px 3px; font-size: 16px; font-weight: bold; vertical-align: top; width: 22%;">${row.name}</td>
                <td style="padding: 4px 3px; font-size: 14px;">${row.items}</td>
              </tr>
            `;
          }
        });
        
        htmlContent += `
            </tbody>
          </table>
        `;
        
        element.innerHTML = htmlContent;
        return element;
      };
      
      // Add page numbers to content
      const totalPages = pagesContent.length;
      const numberedPages = pagesContent.map((content, i) => ({
        rows: content,
        pageNum: i + 1,
        totalPages
      }));
      
      // Generate all pages and add to PDF
      for (let i = 0; i < numberedPages.length; i++) {
        const pageElement = renderPage(numberedPages[i]);
        document.body.appendChild(pageElement);
        
        // Render to canvas
        const canvas = await html2canvas(pageElement, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          windowWidth: 595,
        });
        
        // Add new page if not first page
        if (i > 0) {
          pdf.addPage();
        }
        
        // Add the image to the page - FIX HERE
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 210; // A4 width in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
        
        // Clean up
        document.body.removeChild(pageElement);
      }
      
      // Save the PDF
      pdf.save(`נקודת_איסוף_${pickupSpot.replace(/\s+/g, '_')}.pdf`);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('אירעה שגיאה ביצירת ה-PDF');
    }
  };
  
  // Render a single pickup spot section
  const renderPickupSpotSection = (pickupSpot, orders) => {
    return (
      <div key={pickupSpot} className="mb-12">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">
            נקודת איסוף: {pickupSpot} ({orders.length} הזמנות)
          </h3>
          <button
            onClick={() => generatePDF(pickupSpot, orders)}
            className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            ייצוא ל-PDF
          </button>
        </div>
        
        <div ref={el => pdfRefs.current[pickupSpot] = el} className="bg-white rounded-lg shadow p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">הזמנות לנקודת איסוף: {pickupSpot}</h2>
            <p className="text-gray-600">
              {dateRange.start} - {dateRange.end}
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    לקוח
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    תאריך
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    פריטים
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    סה"כ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {order.customerDetails?.name || 'לקוח לא ידוע'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {order.customerDetails?.phone || 'אין טלפון'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {order.customerDetails?.email || 'אין אימייל'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(order.createdDate, 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        <ul className="list-disc list-inside">
                          {order.orderBreakdown && Object.values(order.orderBreakdown).flatMap(business => 
                            business.items.map((item, idx) => (
                              <li key={`${business.businessId}-${idx}`} className="mb-1">
                                <span className="font-medium">{item.productName}</span>
                                {item.selectedOption && item.selectedOption !== "ללא אופציות" && item.selectedOption !== "None" && (
                                  <span className="text-gray-500"> ({item.selectedOption})</span>
                                )}
                                <span> - {item.quantity} יח' - ₪{(item.price * item.quantity).toFixed(2)}</span>
                                <div className="text-xs text-gray-500 mr-4">מ{business.businessName}</div>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ₪{order.grandTotal?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 text-left">
            <p className="font-bold">
              סה"כ הזמנות: {orders.length}
            </p>
            <p className="font-bold">
              סה"כ הכנסות: ₪{orders.reduce((sum, order) => sum + (order.grandTotal || 0), 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    );
  };
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8" dir="rtl">
      <h1 className="text-3xl font-bold text-center mb-8">סיכום הזמנות שבועי</h1>
      <p className="text-center text-gray-600 mb-6">
        {dateRange.start} - {dateRange.end}
      </p>
      
      {customerOrders.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded text-center">
          לא נמצאו הזמנות שהושלמו בשבוע האחרון
        </div>
      ) : (
        <>
          {/* Pickup Spot Breakdown */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold mb-6 text-blue-800">סיכום לפי נקודות איסוף</h2>
            
            {Object.entries(ordersByPickupSpot).map(([pickupSpot, spotOrders]) => (
              <div 
                key={pickupSpot} 
                className="mb-8 bg-white p-6 rounded-lg shadow"
                ref={el => pdfRefs.current[pickupSpot] = el}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    נקודת איסוף: {pickupSpot}
                  </h3>
                  <button
                    onClick={() => generatePDF(pickupSpot, spotOrders)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    הורד PDF
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">לקוח</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">פריטים</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">סה"כ</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {spotOrders.map((order, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {order.customerDetails?.name || 'לא צוין'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {order.customerDetails?.phone || 'אין טלפון'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              <ul className="list-disc list-inside">
                                {order.orderBreakdown && Object.values(order.orderBreakdown).map((businessOrder, bidx) => (
                                  <React.Fragment key={bidx}>
                                    {(businessOrder.items || []).map((item, iidx) => (
                                      <li key={`${bidx}-${iidx}`} className="mb-1">
                                        <span className="font-medium">{item.quantity} × {item.productName}</span>
                                        {item.selectedOption && item.selectedOption !== "ללא אופציות" && item.selectedOption !== "None" && (
                                          <span className="text-gray-500"> ({item.selectedOption})</span>
                                        )}
                                        <span className="text-xs text-gray-500"> - {businessOrder.businessName}</span>
                                      </li>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </ul>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            ₪{order.grandTotal?.toFixed(2) || '0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          
          {/* Business Summary Table */}
          <div>
            <h2 className="text-2xl font-semibold mb-4">סיכום לפי עסקים ({Object.keys(businessSummary).length})</h2>
            <div className="overflow-x-auto bg-white rounded-lg shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      עסק
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      מוצרים
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      סה"כ הכנסה
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(businessSummary)
                    .sort(([, a], [, b]) => b.totalRevenue - a.totalRevenue)
                    .map(([businessId, business]) => (
                      <tr key={businessId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {business.businessName || 'עסק לא ידוע'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {businessId}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            <ul className="list-disc list-inside">
                              {Object.values(business.products)
                                .sort((a, b) => b.totalRevenue - a.totalRevenue)
                                .map((product, idx) => (
                                  <li key={idx} className="mb-1">
                                    <span className="font-medium">{product.productName}</span>
                                    {product.selectedOption && product.selectedOption !== "ללא אופציות" && product.selectedOption !== "None" && (
                                      <span className="text-gray-500"> ({product.selectedOption})</span>
                                    )}
                                    <span> - {product.quantity} יח' - ₪{product.totalRevenue.toFixed(2)}</span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ₪{business.totalRevenue.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Summary Statistics */}
          <div className="mt-8 bg-blue-50 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4 text-blue-800">סיכום כללי</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">סה"כ הזמנות</p>
                <p className="text-2xl font-bold">{customerOrders.length}</p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">סה"כ הכנסות</p>
                <p className="text-2xl font-bold">
                  ₪{customerOrders.reduce((sum, order) => sum + (order.grandTotal || 0), 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-4 rounded shadow">
                <p className="text-gray-500 text-sm">מספר עסקים</p>
                <p className="text-2xl font-bold">{Object.keys(businessSummary).length}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeeklyOrderSummary;