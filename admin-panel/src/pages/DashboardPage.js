import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  CircularProgress,
} from '@mui/material';
import {
  Inventory as ProductsIcon,
  Store as StoreIcon,
  TrendingUp as RevenueIcon,
  Assessment as AnalyticsIcon,
  People as PeopleIcon,
  PrecisionManufacturing as ManufacturingIcon,
  LocalShipping as LogisticsIcon,
  Group as PartnerIcon,
} from '@mui/icons-material';
import { productService, storeService, orderService, userService } from '../services/api';

const DashboardPage = () => {
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalProducts: 0,
    totalStores: 0,
    revenue: 0,
    orders: 0,
  });

  const [roleStats, setRoleStats] = useState({
    customers: 0,
    manufacturers: 0,
    partners3pl: 0,
    partners: 0,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const results = await Promise.allSettled([
          productService.getProducts(),
          storeService.getStores(),
          orderService.getStatistics(),
          userService.getUserAnalytics(),
        ]);

        const [prodRes, storeRes, orderRes, userRes] = results;
        const productsData = prodRes.status === 'fulfilled' ? prodRes.value : [];
        const storesData = storeRes.status === 'fulfilled' ? storeRes.value : [];
        const orderStats = orderRes.status === 'fulfilled' ? orderRes.value : { total_revenue: 0, total_orders: 0 };
        const userAnalytics = userRes.status === 'fulfilled' ? userRes.value : null;

        setStats({
          totalProducts: (productsData && productsData.length) || 0,
          totalStores: (storesData && storesData.length) || 0,
          revenue: (orderStats && orderStats.total_revenue) || 0,
          orders: (orderStats && orderStats.total_orders) || 0,
        });

        const byRole = (userAnalytics && userAnalytics.users_by_role) || {};
        setRoleStats({
          customers: byRole.Customer || 0,
          manufacturers: byRole.Manufacturer || 0,
          partners3pl: byRole['3PL'] || 0,
          partners: byRole.Partner || 0,
        });

        // no-op: keep defaults
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        // Keep showing defaults instead of blocking the UI
        // no-op: keep defaults
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const summaryCards = [
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: <ProductsIcon sx={{ fontSize: 40 }} />,
      color: '#D92525',
      bgColor: '#FFF5F5',
    },
    {
      title: 'Active Stores',
      value: stats.totalStores,
      icon: <StoreIcon sx={{ fontSize: 40 }} />,
      color: '#059669',
      bgColor: '#F0FDF4',
    },
    {
      title: 'Revenue',
      value: `$${stats.revenue.toLocaleString()}`,
      icon: <RevenueIcon sx={{ fontSize: 40 }} />,
      color: '#7C3AED',
      bgColor: '#F5F3FF',
    },
    {
      title: 'Total Orders',
      value: stats.orders,
      icon: <AnalyticsIcon sx={{ fontSize: 40 }} />,
      color: '#DC2626',
      bgColor: '#FEF2F2',
    },
    {
      title: 'Customers',
      value: roleStats.customers,
      icon: <PeopleIcon sx={{ fontSize: 40 }} />,
      color: '#2563EB',
      bgColor: '#EFF6FF',
    },
    {
      title: 'Manufacturers',
      value: roleStats.manufacturers,
      icon: <ManufacturingIcon sx={{ fontSize: 40 }} />,
      color: '#0F766E',
      bgColor: '#ECFDF5',
    },
    {
      title: '3PL Partners',
      value: roleStats.partners3pl,
      icon: <LogisticsIcon sx={{ fontSize: 40 }} />,
      color: '#0284C7',
      bgColor: '#ECFEFF',
    },
    {
      title: 'Partners',
      value: roleStats.partners,
      icon: <PartnerIcon sx={{ fontSize: 40 }} />,
      color: '#9333EA',
      bgColor: '#FAF5FF',
    },
  ];

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress size={60} />
      </Box>
    );
  }



  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
          Dashboard
        </Typography>

      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {summaryCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card
              sx={{
                height: '100%',
                transition: 'transform 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)',
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 2,
                  }}
                >
                  <Box
                    sx={{
                      backgroundColor: card.bgColor,
                      borderRadius: '12px',
                      p: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Box sx={{ color: card.color }}>
                      {card.icon}
                    </Box>
                  </Box>
                </Box>

                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    color: 'text.primary',
                    mb: 1,
                  }}
                >
                  {card.value}
                </Typography>

                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 500,
                  }}
                >
                  {card.title}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default DashboardPage;
