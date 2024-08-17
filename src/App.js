// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from "./contexts/authContext";
import Menu from './components/Menu';
import Home from './components/Home';
import Producers from './components/Producers';
import ProducerDetails from './components/ProducerDetails';
import CreateOrder from './components/CreateOrder';
import Signup from './components/auth/register/index';
import Login from './components/auth/login/index.jsx';
import OrderForm from './components/OrderForm';
import OrderSummary from './components/OrderSummary';
import OrderConfirmation from './components/OrderConfirmation';
import Dashboard from './components/Dashboard.js';
import OrderConfirmationSuccess from './components/OrderConfirmationSuccess';
import OrderDetails from './components/OrderDetails';
import Contact from './components/ContactForm.js'; // Import the new contact component
import CommunityCoordinators from './components/CommunityCoordinators'; // Import the new component
import CommunityCoordinatorDetails from './components/CommunityCoordinatorDetails';
import Footer from './components/Footer'; // Import Footer
import PaymentCancel from './components/PaymentCancel';  // Import the PaymentCancel component
import PaymentSuccess from './components/PaymentSuccess';  // Import the PaymentCancel component

const App = () => {
  return (
    <Router>
      <AuthProvider>  {/* Wrap all routes with AuthProvider */}
        <Menu />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/producers" element={<Producers />} />
          <Route path="/coordinators" element={<CommunityCoordinators />} /> 
          <Route path="/coordinators/:coordinatorId" element={<CommunityCoordinatorDetails />} />
          <Route path="/producers/:producerId" element={<ProducerDetails />} />
          <Route path="/create-order" element={<CreateOrder />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/order-form/:orderId" element={<OrderForm />} />
          <Route path="/order-summary/:orderId" element={<OrderSummary />} />
          <Route path="/order-confirmation" element={<OrderConfirmation />} />
          <Route path="/order-confirmation-success" element={<OrderConfirmationSuccess />} />
          <Route path="/order-details/:orderId/:memberId" element={<OrderDetails />} />
          <Route path="/contact" element={<Contact />} /> 
          <Route path="/payment-cancel" element={<PaymentCancel />} /> {/* Add the cancel page route */}
          <Route path="/payment-cancel/*" element={<PaymentCancel />} /> {/* Add the cancel page route */}
          <Route path="/payment-success" element={<PaymentSuccess />} />
          <Route path="/payment-success/*" element={<PaymentSuccess />} />        
        </Routes>
        <Footer /> {/* Add Footer component */}
      </AuthProvider>
    </Router>
  );
};

export default App;
