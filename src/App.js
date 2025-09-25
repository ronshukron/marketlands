import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider } from "./contexts/authContext";
import { CartProvider } from './contexts/CartContext';
import Menu from './components/Menu';
import Home from './components/Home';
import Producers from './components/Producers';
import ProducerDetails from './components/ProducerDetails';
import CreateOrder from './components/CreateOrder';
import UserRegister from './components/auth/UserRegister';
import CoordinatorRegister from './components/auth/CoordinatorRegister';
import Login from './components/auth/login/index.jsx';
import OrderForm from './components/OrderForm';
import OrderSummary from './components/OrderSummary';
import OrderConfirmation from './components/OrderConfirmation';
import Dashboard from './components/Dashboard.js';
import OrderConfirmationSuccess from './components/OrderConfirmationSuccess';
import OrderDetails from './components/OrderDetails';
import Contact from './components/ContactForm.js';
import CommunityCoordinators from './components/CommunityCoordinators';
import CommunityCoordinatorDetails from './components/CommunityCoordinatorDetails';
import Footer from './components/Footer';
import PaymentCancel from './components/PaymentCancel';
import PaymentSuccess from './components/PaymentSuccess';
import TermsOfService from './components/TermsOfService';
import MyOrders from './components/MyOrders';
import './App.css';
import OngoingOrders from './components/OngoingOrders';
import BusinessRegister from './components/auth/BusinessRegister';
import BusinessDashBoard from './components/businesses/BusinessDashBoard.js';
import BusinessProducts from './components/businesses/BusinessProducts';
import AddProduct from './components/businesses/AddProduct';
import EditProduct from './components/businesses/EditProduct';
import CreateOrderForBusiness from './components/businesses/CreateOrderForBusiness';
import OrderFormBusiness from './components/businesses/OrderFormBusiness';
import BusinessOrderSummary from './components/businesses/BusinessOrderSummary';
import OrderConfirmationFree from './components/businesses/OrderConfirmationFree';
import PaymentInstructions from './components/businesses/PaymentInstructions';
import MyStore from './components/businesses/MyStore.js';
import ProductDetail from './components/ProductDetail';
import OnGoingOrderCoordinators from './components/OnGoingOrderCoordinators.js';
import ExternalOrderDetail from './components/ExternalOrderDetail';
import LandingPage from './components/LandingPage';
import CoordinatorLandingPage from './components/CoordinatorLandingPage';
import AccessibilityStatement from './components/AccessibilityStatement';
import AccessibilityButton from './components/AccessibilityButton';
import WeeklyOrderSummary from './components/admin/WeeklyOrderSummary'
import PrivateRoute from './components/PrivateRoute';
import './components/Accessibility.css';
import AdminRefundRequests from './components/admin/AdminRefundRequests';
import DeliveryManagement from './components/admin/DeliveryManagement';
import DeliveryManagement80 from './components/admin/DeliveryManagement80';
import { PickupSpotProvider } from './contexts/PickupSpotContext';
import { SaleModeProvider } from './contexts/SaleModeContext';
import CreateIndependentOrderForm from './components/independent/CreateIndependentOrderForm';
import IndependentOrderForm from './components/independent/IndependentOrderForm';
import VolunteerPickupSpot from './components/independent/VolunteerPickupSpot';
import VolunteerShareSuccess from './components/independent/VolunteerShareSuccess';
import IndependentOrderConfirmation from './components/independent/IndependentOrderConfirmation';
import MyVolunteerSpots from './components/independent/MyVolunteerSpots';
import IndependentBusinessDashboard from './components/independent/IndependentBusinessDashboard';
import IndependentOrderDetail from './components/independent/IndependentOrderDetail';
import AdminDashboard from './components/admin/AdminDashboard';
import ProductApprovals from './components/admin/ProductApprovals';

const App = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <PickupSpotProvider>
          <SaleModeProvider>
            <Router>
            <ScrollToTop />
            <div className="App min-h-screen flex flex-col">
              <Menu />
              <main className="flex-grow">
                <Routes>
                  <Route path="/landing" element={<LandingPage />} />
                  <Route path="/" element={<Home />} />
                  <Route path="/producers" element={<Producers />} />
                  <Route path="/coordinators" element={<CommunityCoordinators />} />
                  <Route path="/coordinators/:coordinatorId" element={<CommunityCoordinatorDetails />} />
                  <Route path="/producers/:producerId" element={<ProducerDetails />} />
                  <Route path="/create-order" element={<CreateOrder />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/user-register" element={<UserRegister />} />
                  <Route path="/coordinator-register" element={<CoordinatorRegister />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/order-form/:orderId" element={<OrderForm />} />
                  <Route path="/order-summary/:orderId" element={<OrderSummary />} />
                  <Route path="/order-confirmation" element={<OrderConfirmation />} />
                  <Route path="/order-confirmation-success" element={<OrderConfirmationSuccess />} />
                  <Route path="/order-details/:orderId/:memberId" element={<OrderDetails />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/payment-cancel" element={<PaymentCancel />} />
                  <Route path="/payment-cancel/*" element={<PaymentCancel />} />
                  <Route path="/payment-success" element={<PaymentSuccess />} />
                  <Route path="/payment-success/*" element={<PaymentSuccess />} />    
                  <Route path="/terms-of-service" element={<TermsOfService />} />  
                  <Route path="/my-orders" element={<MyOrders />} />
                  <Route path="/ongoing-orders" element={<OngoingOrders />} />
                  <Route path="/business-register" element={<BusinessRegister />} />
                  <Route path="/Business-DashBoard" element={<BusinessDashBoard />} />
                  <Route path="/Business-Products" element={<BusinessProducts />} />
                  <Route path="/add-product" element={<AddProduct />} />
                  <Route path="/edit-product/:productId" element={<EditProduct />} />
                  <Route path="/create-order-for-business" element={<CreateOrderForBusiness />} />
                  <Route path="/order-form-business/:orderId" element={<OrderFormBusiness />} /> 
                  <Route path="/business-order-summary/:orderId" element={<BusinessOrderSummary />} />
                  <Route path="/order-confirmation-free" element={<OrderConfirmationFree />} />
                  <Route path="/payment-instructions" element={<PaymentInstructions />} />
                  <Route path="/store/:businessId" element={<MyStore />} />
                  <Route path="/product/:productId" element={<ProductDetail />} />
                  <Route path="/ongoing-order-coordinators" element={<OnGoingOrderCoordinators />} />
                  <Route path="/external-order/:orderId" element={<ExternalOrderDetail />} />
                  <Route path="/coordinator-landing" element={<CoordinatorLandingPage />} />
                  <Route path="/accessibility" element={<AccessibilityStatement />} />
                  <Route path="/admin/weekly-summary" element={<WeeklyOrderSummary />} />
                  <Route path="/admin/refunds" element={<AdminRefundRequests />} />
                  <Route path="/admin/delivery" element={<DeliveryManagement />} />
                  <Route path="/admin/delivery-80" element={<DeliveryManagement80 />} />
                  <Route path="/independent/create" element={<CreateIndependentOrderForm />} />
                  <Route path="/independent/order/:orderId" element={<IndependentOrderForm />} />
                  <Route path="/independent/volunteer/:orderId" element={<VolunteerPickupSpot />} />
                  <Route path="/volunteer-share-success" element={<VolunteerShareSuccess />} />
                  <Route path="/order-confirmation-independent" element={<IndependentOrderConfirmation />} />
                  <Route path="/my-volunteer-spots" element={<MyVolunteerSpots />} />
                  {/* Independent business routes */}
                  <Route path="/independent-orders" element={<IndependentBusinessDashboard />} />
                  <Route path="/independent-orders/:id" element={<IndependentOrderDetail />} />
                  {/* Admin */}
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/products" element={<ProductApprovals />} />
                </Routes>
              </main>
              <Footer />
              <AccessibilityButton />
            </div>
          </Router>
        </SaleModeProvider>
      </PickupSpotProvider>
    </CartProvider>
  </AuthProvider>
);
};

export default App;