import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider } from "./contexts/authContext";
import { CartProvider } from './contexts/CartContext';
import { MarketplaceCartProvider } from './contexts/MarketplaceCartContext';
import AppMenu from './components/AppMenu';
import Home from './components/Home';
import Footer from './components/Footer';
import AccessibilityButton from './components/AccessibilityButton';
import { PickupSpotProvider } from './contexts/PickupSpotContext';
import { SaleModeProvider } from './contexts/SaleModeContext';
import { CommunityWeeklyPromotionProvider } from './contexts/CommunityWeeklyPromotionContext';
import './App.css';
import './components/Accessibility.css';

const LandingPage = lazy(() => import('./components/LandingPage'));
const Producers = lazy(() => import('./components/Producers'));
const ProducerDetails = lazy(() => import('./components/ProducerDetails'));
const CreateOrder = lazy(() => import('./components/CreateOrder'));
const UserRegister = lazy(() => import('./components/auth/UserRegister'));
const CoordinatorRegister = lazy(() => import('./components/auth/CoordinatorRegister'));
const Login = lazy(() => import('./components/auth/login/index.jsx'));
const OrderForm = lazy(() => import('./components/OrderForm'));
const OrderSummary = lazy(() => import('./components/OrderSummary'));
const OrderConfirmation = lazy(() => import('./components/OrderConfirmation'));
const Dashboard = lazy(() => import('./components/Dashboard.js'));
const OrderConfirmationSuccess = lazy(() => import('./components/OrderConfirmationSuccess'));
const OrderDetails = lazy(() => import('./components/OrderDetails'));
const Contact = lazy(() => import('./components/ContactForm.js'));
const CommunityCoordinators = lazy(() => import('./components/CommunityCoordinators'));
const CommunityCoordinatorDetails = lazy(() => import('./components/CommunityCoordinatorDetails'));
const PaymentCancel = lazy(() => import('./components/PaymentCancel'));
const PaymentSuccess = lazy(() => import('./components/PaymentSuccess'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const MyOrders = lazy(() => import('./components/MyOrders'));
const CustomerOrderDetail = lazy(() => import('./components/CustomerOrderDetail'));
const SavedCarts = lazy(() => import('./components/SavedCarts'));
const OngoingOrders = lazy(() => import('./components/OngoingOrders'));
const BusinessRegister = lazy(() => import('./components/auth/BusinessRegister'));
const LocalBusinessRegister = lazy(() => import('./components/auth/LocalBusinessRegister'));
const BusinessDashBoard = lazy(() => import('./components/businesses/BusinessDashBoard.js'));
const BusinessProducts = lazy(() => import('./components/businesses/BusinessProducts'));
const AddProduct = lazy(() => import('./components/businesses/AddProduct'));
const EditProduct = lazy(() => import('./components/businesses/EditProduct'));
const BulkEditProducts = lazy(() => import('./components/businesses/BulkEditProducts'));
const BusinessPromotions = lazy(() => import('./components/businesses/BusinessPromotions'));
const BulkReplaceProductImages = lazy(() => import('./components/businesses/BulkReplaceProductImages'));
const CreateOrderForBusiness = lazy(() => import('./components/businesses/CreateOrderForBusiness'));
const AlwaysOnCutoffSettings = lazy(() => import('./components/businesses/AlwaysOnCutoffSettings'));
const OrderFormBusiness = lazy(() => import('./components/businesses/OrderFormBusiness'));
const BusinessOrderSummary = lazy(() => import('./components/businesses/BusinessOrderSummary'));
const OrderConfirmationFree = lazy(() => import('./components/businesses/OrderConfirmationFree'));
const PaymentInstructions = lazy(() => import('./components/businesses/PaymentInstructions'));
const MyStore = lazy(() => import('./components/businesses/MyStore.js'));
const ProductDetail = lazy(() => import('./components/ProductDetail'));
const OnGoingOrderCoordinators = lazy(() => import('./components/OnGoingOrderCoordinators.js'));
const ExternalOrderDetail = lazy(() => import('./components/ExternalOrderDetail'));
const CoordinatorLandingPage = lazy(() => import('./components/CoordinatorLandingPage'));
const AccessibilityStatement = lazy(() => import('./components/AccessibilityStatement'));
const WeeklyOrderSummary = lazy(() => import('./components/admin/WeeklyOrderSummary'));
const AdminRefundRequests = lazy(() => import('./components/admin/AdminRefundRequests'));
const DeliveryManagement = lazy(() => import('./components/admin/DeliveryManagement'));
const DeliveryManagement80 = lazy(() => import('./components/admin/DeliveryManagement80'));
const WeeklyOrderSummaryV2 = lazy(() => import('./components/admin/WeeklyOrderSummaryV2'));
const WeeklyOrderSummaryV3 = lazy(() => import('./components/admin/WeeklyOrderSummaryV3'));
const WeeklyOrderSummaryV4 = lazy(() => import('./components/admin/WeeklyOrderSummaryV4'));
const WeeklyOrderSummaryV5 = lazy(() => import('./components/admin/WeeklyOrderSummaryV5'));
const WeeklyOrderFromSuppliersV1 = lazy(() => import('./components/admin/WeeklyOrderFromSuppliersV1'));
const WeeklyCustomerOrderManager = lazy(() => import('./components/admin/WeeklyCustomerOrderManager'));
const CustomerOrderDeliveryTransferAdmin = lazy(() => import('./components/admin/CustomerOrderDeliveryTransferAdmin'));
const DeliveryManagementV2 = lazy(() => import('./components/admin/DeliveryManagementV2'));
const DeliveryManagementV3 = lazy(() => import('./components/admin/DeliveryManagementV3'));
const DeliveryManagementV4 = lazy(() => import('./components/admin/DeliveryManagmentV4'));
const DeliveryManagementV45 = lazy(() => import('./components/admin/DeliveryManagmentV4.5'));
const DeliveryManagementV5 = lazy(() => import('./components/adminV5/deliveryWeighingV5/DeliveryManagementV5'));
const DeliveryManagementV6 = lazy(() => import('./components/adminV5/deliveryWeighingV5/DeliveryManagementV6'));
const DeliveryManagementV7 = lazy(() => import('./components/adminV5/deliveryWeighingV5/DeliveryManagementV7'));
const CreateIndependentOrderForm = lazy(() => import('./components/independent/CreateIndependentOrderForm'));
const IndependentOrderForm = lazy(() => import('./components/independent/IndependentOrderForm'));
const VolunteerPickupSpot = lazy(() => import('./components/independent/VolunteerPickupSpot'));
const VolunteerShareSuccess = lazy(() => import('./components/independent/VolunteerShareSuccess'));
const IndependentOrderConfirmation = lazy(() => import('./components/independent/IndependentOrderConfirmation'));
const MyVolunteerSpots = lazy(() => import('./components/independent/MyVolunteerSpots'));
const IndependentBusinessDashboard = lazy(() => import('./components/independent/IndependentBusinessDashboard'));
const IndependentOrderDetail = lazy(() => import('./components/independent/IndependentOrderDetail'));
const OrderConfirmationDelayed = lazy(() => import('./components/delayedPayment/OrderConfirmationDelayed'));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'));
const ProductApprovals = lazy(() => import('./components/admin/ProductApprovals'));
const IndependentOrdersAdmin = lazy(() => import('./components/admin/IndependentOrdersAdmin'));
const Deliveries = lazy(() => import('./components/admin/Deliveries'));
const AbandonedCarts = lazy(() => import('./components/admin/AbandonedCarts'));
const AnalyticsDashboard = lazy(() => import('./components/admin/AnalyticsDashboard'));
const CustomerInsights = lazy(() => import('./components/admin/CustomerInsights'));
const PaymentConfigAdmin = lazy(() => import('./components/admin/PaymentConfigAdmin'));
const CommunityHub = lazy(() => import('./components/communityHub/CommunityHub'));
const CommunityDiscountConfig = lazy(() => import('./components/admin/CommunityDiscountConfig'));
const CommunityHubAdmin = lazy(() => import('./components/admin/CommunityHubAdmin'));
const DeliveryScheduleAdmin = lazy(() => import('./components/admin/DeliveryScheduleAdmin'));
const WeeklyDeliveryOrderSummary = lazy(() => import('./components/admin/WeeklyDeliveryOrderSummaryWorkspace'));
const DeliveryDriverV7 = lazy(() => import('./components/driver/DeliveryDriverV7'));
const MarketplaceHome = lazy(() => import('./components/marketplace/MarketplaceHome'));
const MarketplaceLogin = lazy(() => import('./components/marketplace/MarketplaceLogin'));
const MarketplaceRegister = lazy(() => import('./components/marketplace/MarketplaceRegister'));
const MarketplaceOrderForm = lazy(() => import('./components/marketplace/MarketplaceOrderForm'));
const MarketplaceVolunteerPickup = lazy(() => import('./components/marketplace/MarketplaceVolunteerPickup'));
const SellerMarketplaceDashboard = lazy(() => import('./components/marketplace/SellerMarketplaceDashboard'));
const MarketplaceProductsList = lazy(() => import('./components/marketplace/products/MarketplaceProductsList'));
const MarketplaceAddProduct = lazy(() => import('./components/marketplace/products/MarketplaceAddProduct'));
const MarketplaceEditProduct = lazy(() => import('./components/marketplace/products/MarketplaceEditProduct'));
const MarketplaceMyStore = lazy(() => import('./components/marketplace/MarketplaceMyStore'));
const MarketplaceStorePage = lazy(() => import('./components/marketplace/MarketplaceStorePage'));
const MarketplaceStoreShop = lazy(() => import('./components/marketplace/MarketplaceStoreShop'));
const MarketplaceCheckout = lazy(() => import('./components/marketplace/MarketplaceCheckout'));
const MarketplaceOrderConfirmation = lazy(() => import('./components/marketplace/MarketplaceOrderConfirmation'));
const MarketplaceMyOrders = lazy(() => import('./components/marketplace/MarketplaceMyOrders'));
const MarketplaceBusinessOrders = lazy(() => import('./components/marketplace/MarketplaceBusinessOrders'));
const MarketplacePromotionOrders = lazy(() => import('./components/marketplace/MarketplacePromotionOrders'));
const MarketplaceSettingsAdmin = lazy(() => import('./components/admin/MarketplaceSettingsAdmin'));
const MarketplaceWaitlistAdmin = lazy(() => import('./components/admin/MarketplaceWaitlistAdmin'));
const CommunityAdmin = lazy(() => import('./components/admin/CommunityAdmin'));
const ReferralConfigAdmin = lazy(() => import('./components/admin/ReferralConfigAdmin'));
const EditOrderProducts = lazy(() => import('./components/businesses/EditOrderProducts'));
const EditOrderCommunities = lazy(() => import('./components/businesses/EditOrderCommunities'));
const MarketplaceTermsOfService = lazy(() => import('./components/marketplace/MarketplaceTermsOfService'));
const AdminPwaInstall = lazy(() => import('./components/admin/AdminPwaInstall'));
const IntroductionBasketAdmin = lazy(() => import('./components/admin/IntroductionBasketAdmin'));
const SupplierPriceImportAdmin = lazy(() => import('./components/admin/SupplierPriceImportAdmin'));
const ProductFeedbackAdmin = lazy(() => import('./components/admin/ProductFeedbackAdmin'));
const CopyProductsAdmin = lazy(() => import('./components/admin/CopyProductsAdmin'));
const BlogIndex = lazy(() => import('./components/blog/BlogIndex'));
const BlogPost = lazy(() => import('./components/blog/BlogPost'));
const BlogAdmin = lazy(() => import('./components/admin/BlogAdmin'));
const CommunityWeeklyPromotionsAdmin = lazy(() => import('./components/admin/communityWeeklyPromotions/CommunityWeeklyPromotionsAdmin'));

const RouteFallback = () => (
  <div className="p-8 text-center text-gray-500" dir="rtl">טוען...</div>
);

const App = () => {
  return (
    <AuthProvider>
      <PickupSpotProvider>
        <CommunityWeeklyPromotionProvider>
          <CartProvider>
            <MarketplaceCartProvider>
          <SaleModeProvider>
            <Router>
            <ScrollToTop />
            <div className="App min-h-screen flex flex-col">
              <AppMenu />
              <main className="flex-grow">
                <Suspense fallback={<RouteFallback />}>
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
                  <Route path="/order-confirmation-delayed" element={<OrderConfirmationDelayed />} />
                  <Route path="/order-confirmation-success" element={<OrderConfirmationSuccess />} />
                  <Route path="/order-details/:orderId/:memberId" element={<OrderDetails />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/payment-cancel" element={<PaymentCancel />} />
                  <Route path="/payment-cancel/*" element={<PaymentCancel />} />
                  <Route path="/payment-success" element={<PaymentSuccess />} />
                  <Route path="/payment-success/*" element={<PaymentSuccess />} />    
                  <Route path="/terms-of-service" element={<TermsOfService />} />  
                  <Route path="/blog" element={<BlogIndex />} />
                  <Route path="/blog/:slug" element={<BlogPost />} />
                  <Route path="/my-orders" element={<MyOrders />} />
                  <Route path="/my-orders/:orderId" element={<CustomerOrderDetail />} />
                  <Route path="/saved-carts" element={<SavedCarts />} />
                  <Route path="/ongoing-orders" element={<OngoingOrders />} />
                  <Route path="/business-register" element={<BusinessRegister />} />
                  <Route path="/local-business-register" element={<LocalBusinessRegister />} />
                  <Route path="/marketplace/register" element={<LocalBusinessRegister />} />
                  <Route path="/Business-DashBoard" element={<BusinessDashBoard />} />
                  <Route path="/Business-Products" element={<BusinessProducts />} />
                  <Route path="/business-promotions" element={<BusinessPromotions />} />
                  <Route path="/add-product" element={<AddProduct />} />
                  <Route path="/edit-product/:productId" element={<EditProduct />} />
                  <Route path="/bulk-edit-products" element={<BulkEditProducts />} />
                  <Route path="/bulk-replace-product-images" element={<BulkReplaceProductImages />} />
                  <Route path="/create-order-for-business" element={<CreateOrderForBusiness />} />
                  <Route path="/edit-order/:orderId" element={<EditOrderProducts />} />
                  <Route path="/edit-order/:orderId/communities" element={<EditOrderCommunities />} />
                  <Route path="/business/always-on-cutoffs" element={<AlwaysOnCutoffSettings />} />
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
                  <Route path="/admin/weekly-summary-v2" element={<WeeklyOrderSummaryV2 />} />
                  <Route path="/admin/weekly-summary-v3" element={<WeeklyOrderSummaryV3 />} />
                  <Route path="/admin/weekly-summary-v4" element={<WeeklyOrderSummaryV4 />} />
                  <Route path="/admin/weekly-summary-v5" element={<WeeklyOrderSummaryV5 />} />
                  <Route path="/admin/weekly-delivery-summary" element={<WeeklyDeliveryOrderSummary />} />
                  <Route path="/admin/weekly-customer-orders" element={<WeeklyCustomerOrderManager />} />
                  <Route path="/admin/transfer-delivery-week" element={<CustomerOrderDeliveryTransferAdmin />} />
                  <Route path="/admin/order-from-suppliers" element={<WeeklyOrderFromSuppliersV1 />} />
                  <Route path="/admin/supplier-price-import" element={<SupplierPriceImportAdmin />} />
                  <Route path="/admin/product-feedback" element={<ProductFeedbackAdmin />} />
                  <Route path="/admin/copy-products" element={<CopyProductsAdmin />} />
                  <Route path="/admin/delivery-v2" element={<DeliveryManagementV2 />} />
                  <Route path="/admin/delivery-v3" element={<DeliveryManagementV3 />} />
                  <Route path="/admin/delivery-v4" element={<DeliveryManagementV4 />} />
                  <Route path="/admin/delivery-v4-5" element={<DeliveryManagementV45 />} />
                  <Route path="/admin/delivery-v5" element={<DeliveryManagementV5 />} />
                  <Route path="/admin/delivery-v6" element={<DeliveryManagementV6 />} />
                  <Route path="/admin/delivery-v7" element={<DeliveryManagementV7 />} />
                  <Route path="/admin/delivery-schedules" element={<DeliveryScheduleAdmin />} />
                  <Route path="/driver/delivery" element={<DeliveryDriverV7 />} />
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
                  <Route path="/admin/blog" element={<BlogAdmin />} />
                  <Route path="/admin/products" element={<ProductApprovals />} />
                  <Route path="/admin/independent-orders" element={<IndependentOrdersAdmin />} />
                  <Route path="/admin/independent-order/:id" element={<IndependentOrderDetail />} />
                  <Route path="/admin/deliveries" element={<Deliveries />} />
                  <Route path="/admin/abandoned-carts" element={<AbandonedCarts />} />
                  <Route path="/admin/analytics" element={<AnalyticsDashboard />} />
                  <Route path="/admin/customers" element={<CustomerInsights />} />
                  <Route path="/admin/payment-config" element={<PaymentConfigAdmin />} />
                  <Route path="/admin/marketplace-settings" element={<MarketplaceSettingsAdmin />} />
                  <Route path="/admin/marketplace-waitlist" element={<MarketplaceWaitlistAdmin />} />
                  <Route path="/admin/community-discount" element={<CommunityDiscountConfig />} />
                  <Route path="/admin/community-hub" element={<CommunityHubAdmin />} />
                  <Route path="/admin/communities" element={<CommunityAdmin />} />
                  <Route path="/admin/introduction-baskets" element={<IntroductionBasketAdmin />} />
                  <Route path="/admin/referral-config" element={<ReferralConfigAdmin />} />
                  <Route path="/admin/community-weekly-promotions" element={<CommunityWeeklyPromotionsAdmin />} />
                  <Route path="/admin/pwa-install" element={<AdminPwaInstall />} />
                  {/* Community Hub */}
                  <Route path="/community" element={<CommunityHub />} />
                  <Route path="/community/:communityId" element={<CommunityHub />} />
                  {/* Community Marketplace */}
                  <Route path="/community-marketplace/terms" element={<MarketplaceTermsOfService />} />
                  <Route path="/community-marketplace" element={<MarketplaceHome />} />
                  <Route path="/community-marketplace/login" element={<MarketplaceLogin />} />
                  <Route path="/community-marketplace/register" element={<MarketplaceRegister />} />
                  <Route path="/community-marketplace/checkout" element={<MarketplaceCheckout />} />
                  <Route
                    path="/community-marketplace/order-confirmation"
                    element={<MarketplaceOrderConfirmation />}
                  />
                  <Route path="/community-marketplace/store/:businessId" element={<MarketplaceStorePage />} />
                  <Route
                    path="/community-marketplace/store/:businessId/shop"
                    element={<MarketplaceStoreShop />}
                  />
                  <Route path="/community-marketplace/my-orders" element={<MarketplaceMyOrders />} />
                  <Route path="/community-marketplace/order/:promotionId" element={<MarketplaceOrderForm />} />
                  <Route
                    path="/community-marketplace/volunteer/:promotionId"
                    element={<MarketplaceVolunteerPickup />}
                  />
                  <Route path="/marketplace/my-store" element={<MarketplaceMyStore />} />
                  <Route path="/marketplace/orders" element={<MarketplaceBusinessOrders />} />
                  <Route path="/marketplace/dashboard" element={<SellerMarketplaceDashboard />} />
                  <Route path="/marketplace/store" element={<SellerMarketplaceDashboard />} />
                  <Route path="/marketplace/promotions/new" element={<SellerMarketplaceDashboard />} />
                  <Route
                    path="/marketplace/promotions/:promotionId/orders"
                    element={<MarketplacePromotionOrders />}
                  />
                  <Route path="/marketplace/products" element={<MarketplaceProductsList />} />
                  <Route path="/marketplace/products/new" element={<MarketplaceAddProduct />} />
                  <Route path="/marketplace/products/:productId/edit" element={<MarketplaceEditProduct />} />
                  <Route path="/marketplace/products/:productId" element={<MarketplaceEditProduct />} />
                </Routes>
                </Suspense>
              </main>
              <Footer />
              <AccessibilityButton />
            </div>
          </Router>
        </SaleModeProvider>
            </MarketplaceCartProvider>
          </CartProvider>
        </CommunityWeeklyPromotionProvider>
      </PickupSpotProvider>
    </AuthProvider>
);
};

export default App;
