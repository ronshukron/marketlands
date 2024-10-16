import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider } from "./contexts/authContext";
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

const App = () => {
  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <Menu />
        <Routes>
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
        </Routes>
        <Footer />
      </AuthProvider>
    </Router>
  );
};

export default App;