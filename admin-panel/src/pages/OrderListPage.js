import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Button,
  TextField,
  MenuItem,
  Grid,
  CircularProgress,
  Alert,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Visibility as ViewIcon,

  Delete as DeleteIcon,

  Search as SearchIcon,
} from '@mui/icons-material';
import { orderService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import OrderDetailsModal from '../components/OrderDetailsModal';

const OrderListPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [bulkUpdateModalOpen, setBulkUpdateModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkReason, setBulkReason] = useState('');

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    mini_app_type: '',
    date_from: '',
    date_to: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  });

  const { showToast } = useToast();

  const statusColors = {
    pending: '#ff9800',
    confirmed: '#2196f3',
    processing: '#9c27b0',
    shipped: '#ff5722',
    delivered: '#4caf50',
    cancelled: '#f44336',
  };

  const miniAppTypeLabels = {
    RetailStore: '零售商店',
    UnmannedStore: '无人商店',
    ExhibitionSales: '展销展消',
    GroupBuying: '团购团批',
  };



  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: page + 1,
        limit: rowsPerPage,
        ...filters,
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '') {
          delete params[key];
        }
      });

      const response = await orderService.getOrders(params);
      setOrders(response.orders || []);
      setTotal(response.total || 0);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err.message || 'Failed to load orders');
      showToast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filters, showToast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleChangePage = (event, newPage) => {


    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
    }));
    setPage(0);
  };

  const handleSelectOrder = (orderId) => {
    setSelectedOrders(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      } else {
        return [...prev, orderId];
      }
    });
  };

  const handleSelectAllOrders = (event) => {
    if (event.target.checked) {
      setSelectedOrders(orders.map(order => order.id));
    } else {
      setSelectedOrders([]);
    }
  };

  const handleViewOrder = async (orderId) => {
    try {
      const orderDetails = await orderService.getOrder(orderId);
      setSelectedOrder(orderDetails);
      setDetailsModalOpen(true);
    } catch (err) {
      console.error('Error fetching order details:', err);
      showToast('Failed to load order details', 'error');
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus, reason = '') => {
    try {
      await orderService.updateOrderStatus(orderId, newStatus, reason);
      showToast('Order status updated successfully', 'success');
      fetchOrders();
    } catch (err) {
      console.error('Error updating order status:', err);
      showToast('Failed to update order status', 'error');
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (window.confirm('Are you sure you want to cancel this order?')) {
      try {
        await orderService.deleteOrder(orderId);
        showToast('Order cancelled successfully', 'success');
        fetchOrders();
      } catch (err) {
        console.error('Error cancelling order:', err);
        showToast('Failed to cancel order', 'error');
      }
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkStatus || selectedOrders.length === 0) {
      showToast('Please select orders and status', 'warning');
      return;
    }

    try {
      await orderService.bulkUpdateOrders(selectedOrders, bulkStatus, bulkReason);
      showToast(`${selectedOrders.length} orders updated successfully`, 'success');
      setBulkUpdateModalOpen(false);
      setBulkStatus('');
      setBulkReason('');
      setSelectedOrders([]);
      fetchOrders();
    } catch (err) {
      console.error('Error bulk updating orders:', err);
      showToast('Failed to update orders', 'error');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount) => {
    return `¥${amount.toFixed(2)}`;
  };

  if (loading && orders.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        Orders Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Order ID, user email..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                label="Status"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="confirmed">Confirmed</MenuItem>
                <MenuItem value="processing">Processing</MenuItem>
                <MenuItem value="shipped">Shipped</MenuItem>
                <MenuItem value="delivered">Delivered</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                select
                label="Mini-App"
                value={filters.mini_app_type}
                onChange={(e) => handleFilterChange('mini_app_type', e.target.value)}
              >
                <MenuItem value="">All Mini-Apps</MenuItem>
                <MenuItem value="RetailStore">零售商店</MenuItem>
                <MenuItem value="UnmannedStore">无人商店</MenuItem>
                <MenuItem value="ExhibitionSales">展销展消</MenuItem>
                <MenuItem value="GroupBuying">团购团批</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                type="date"
                label="From Date"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                type="date"
                label="To Date"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={1}>
              {selectedOrders.length > 0 && (
                <Button
                  variant="contained"
                  onClick={() => setBulkUpdateModalOpen(true)}
                  sx={{ minWidth: 'auto' }}
                >
                  Bulk Update ({selectedOrders.length})
                </Button>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selectedOrders.length > 0 && selectedOrders.length < orders.length}
                    checked={orders.length > 0 && selectedOrders.length === orders.length}
                    onChange={handleSelectAllOrders}
                  />
                </TableCell>
                <TableCell>Order ID</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Mini-App</TableCell>
                <TableCell>Store</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} align="center">
                    <CircularProgress size={40} />
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No orders found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => handleSelectOrder(order.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        #{order.id.slice(-8)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {order.user_name || 'N/A'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {order.user_email}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={miniAppTypeLabels[order.mini_app_type] || order.mini_app_type}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {order.store_name || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {formatCurrency(order.total_amount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        size="small"
                        sx={{
                          backgroundColor: statusColors[order.status] || '#gray',
                          color: 'white',
                          fontWeight: 500,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(order.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" gap={1}>
                        <IconButton
                          size="small"
                          onClick={() => handleViewOrder(order.id)}
                          title="View Details"
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteOrder(order.id)}
                          title="Cancel Order"
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </Card>

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          open={detailsModalOpen}
          onClose={() => {
            setDetailsModalOpen(false);
            setSelectedOrder(null);
          }}
          order={selectedOrder}
          onStatusUpdate={handleUpdateOrderStatus}
        />
      )}

      {/* Bulk Update Modal */}
      <Dialog open={bulkUpdateModalOpen} onClose={() => setBulkUpdateModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Bulk Update Orders</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Update {selectedOrders.length} selected orders
          </Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>New Status</InputLabel>
            <Select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              label="New Status"
            >
              <MenuItem value="confirmed">Confirmed</MenuItem>
              <MenuItem value="processing">Processing</MenuItem>
              <MenuItem value="shipped">Shipped</MenuItem>
              <MenuItem value="delivered">Delivered</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Reason (Optional)"
            multiline
            rows={3}
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Enter reason for status change..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkUpdateModalOpen(false)}>Cancel</Button>
          <Button onClick={handleBulkUpdate} variant="contained">
            Update Orders
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrderListPage;
