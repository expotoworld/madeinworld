import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  CircularProgress,
  TextField,
  MenuItem,
  Grid,
  Select,
  FormControl,
  InputLabel,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import { Search as SearchIcon, Refresh as RefreshIcon, Visibility as ViewIcon } from '@mui/icons-material';
import { manufacturerOrderService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import OrderDetailsModal from '../components/OrderDetailsModal';

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

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

export default function ManufacturerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [updatingId, setUpdatingId] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

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

  const formatDate = useCallback((dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }, []);

  const formatCurrency = useCallback((amount) => `¥${Number(amount || 0).toFixed(2)}`, []);

  const params = useMemo(() => {
    const p = { page: page + 1, limit: rowsPerPage, ...filters };
    Object.keys(p).forEach((k) => { if (p[k] === '') delete p[k]; });
    return p;
  }, [page, rowsPerPage, filters]);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await manufacturerOrderService.getOrders(params);
      setOrders(resp.orders || []);
      setTotal(resp.total || 0);
    } catch (err) {
      console.error('Manufacturer orders fetch error:', err);
      setError(err?.message || 'Failed to load orders');
      showToast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [params, showToast]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(0);
  };

  const handleChangePage = (_e, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      setUpdatingId(orderId);
      await manufacturerOrderService.updateOrderStatus(orderId, newStatus, 'Updated by manufacturer');
      showToast('Order status updated', 'success');
      fetchOrders();
    } catch (err) {
      console.error('Update status failed:', err);
      showToast('Failed to update status', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleViewDetails = async (orderId) => {
    try {
      const detail = await manufacturerOrderService.getOrder(orderId);
      setSelectedOrder(detail);
      setDetailsOpen(true);
    } catch (err) {
      console.error('Failed to load order details:', err);
      showToast('Failed to load order details', 'error');
    }
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
      <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 0 }}>
          Orders
        </Typography>
        <IconButton onClick={fetchOrders} title="Refresh">
          <RefreshIcon />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}

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
                InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField select fullWidth label="Status" value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
                <MenuItem value="">All Statuses</MenuItem>
                {statusOptions.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField select fullWidth label="Mini-App" value={filters.mini_app_type} onChange={(e) => handleFilterChange('mini_app_type', e.target.value)}>
                <MenuItem value="">All Mini-Apps</MenuItem>
                <MenuItem value="RetailStore">零售商店</MenuItem>
                <MenuItem value="UnmannedStore">无人商店</MenuItem>
                <MenuItem value="ExhibitionSales">展销展消</MenuItem>
                <MenuItem value="GroupBuying">团购团批</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField fullWidth type="date" label="From Date" InputLabelProps={{ shrink: true }} value={filters.date_from} onChange={(e) => handleFilterChange('date_from', e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField fullWidth type="date" label="To Date" InputLabelProps={{ shrink: true }} value={filters.date_to} onChange={(e) => handleFilterChange('date_to', e.target.value)} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order ID</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Mini-App</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center"><CircularProgress size={40} /></TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography variant="body2" color="text.secondary">No orders found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                orders.map(order => (
                  <TableRow key={order.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>#{order.id.slice(-8)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{order.user_name || 'N/A'}</Typography>
                        <Typography variant="caption" color="text.secondary">{order.user_email}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={miniAppTypeLabels[order.mini_app_type] || order.mini_app_type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{formatCurrency(order.total_amount)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={order.status.charAt(0).toUpperCase() + order.status.slice(1)} size="small" sx={{ backgroundColor: statusColors[order.status] || '#gray', color: 'white', fontWeight: 500 }} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{order.item_count} item{order.item_count !== 1 ? 's' : ''}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="body2">{formatDate(order.created_at)}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{formatDate(order.updated_at)}</Typography></TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Tooltip title="View Details">
                          <IconButton size="small" onClick={() => handleViewDetails(order.id)}>
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <FormControl size="small" sx={{ minWidth: 160 }} disabled={updatingId === order.id}>
                          <InputLabel>Update Status</InputLabel>
                          <Select
                            label="Update Status"
                            value={order.status}
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          >
                            {statusOptions.map(opt => (
                              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
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
      <OrderDetailsModal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        order={selectedOrder}
        readOnly
      />

    </Box>
  );
}

