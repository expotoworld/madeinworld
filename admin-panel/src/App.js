import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import theme from './theme/theme';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Import page components
import DashboardPage from './pages/DashboardPage';
import ProductListPage from './pages/ProductListPage';
import CategoryListPage from './pages/CategoryListPage';
import StoreListPage from './pages/StoreListPage';
import OrganizationsPage from './pages/OrganizationsPage';
import RegionsPage from './pages/RegionsPage';
import UserListPage from './pages/UserListPage';
import OrderListPage from './pages/OrderListPage';
import ManufacturerOrdersPage from './pages/ManufacturerOrdersPage';
import CartListPage from './pages/CartListPage';
import EmailLoginPage from './pages/EmailLoginPage';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const OrdersEntry = () => {
  const { user } = useAuth();
  const role = user?.role || 'User';
  return role === 'Admin' ? <OrderListPage /> : <ManufacturerOrdersPage />;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <ToastProvider>
          <Router>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<EmailLoginPage />} />

              {/* Protected routes */}
              <Route path="/*" element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/products" element={<ProductListPage />} />
                      <Route path="/categories" element={<CategoryListPage />} />
                      <Route path="/stores" element={<StoreListPage />} />
                      <Route path="/organizations" element={<OrganizationsPage />} />
                      <Route path="/regions" element={<RegionsPage />} />
                      <Route path="/users" element={<UserListPage />} />
                      <Route path="/orders" element={<OrdersEntry />} />
                      <Route path="/carts" element={<CartListPage />} />
                      <Route path="/analytics" element={<div>Analytics Page (Coming Soon)</div>} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              } />
            </Routes>
          </Router>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
