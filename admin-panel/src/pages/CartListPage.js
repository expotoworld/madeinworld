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
  FilterList as FilterIcon,
  Search as SearchIcon,

} from '@mui/icons-material';
import { cartService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import CartDetailsModal from '../components/CartDetailsModal';

const CartListPage = () => {
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedCart, setSelectedCart] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cartToDelete, setCartToDelete] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    mini_app_type: '',
    user_id: '',
    store_id: '',
    date_from: '',
    date_to: '',
    sort_by: 'updated_at',
    sort_order: 'desc',
  });

  const { showToast } = useToast();

  const miniAppTypeLabels = {
    RetailStore: '零售商店',
    UnmannedStore: '无人商店',
    ExhibitionSales: '展销展消',
    GroupBuying: '团购团批',
  };

  const miniAppTypeColors = {
    RetailStore: '#520ee6',
    UnmannedStore: '#2196f3',
    ExhibitionSales: '#ffd556',
    GroupBuying: '#076200',
  };



  const fetchCarts = useCallback(async () => {
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

      const response = await cartService.getCarts(params);
      setCarts(response.carts || []);
      setTotal(response.total || 0);
    } catch (err) {
      console.error('Error fetching carts:', err);
      setError(err.message || 'Failed to load carts');
      showToast('Failed to load carts', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filters, showToast]);

  useEffect(() => {
    fetchCarts();
  }, [fetchCarts]);

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

  const handleViewCart = async (cart) => {
    try {
      const cartDetails = await cartService.getCart(cart.id);
      setSelectedCart(cartDetails);
      setDetailsModalOpen(true);
    } catch (err) {
      console.error('Error fetching cart details:', err);
      showToast('Failed to load cart details', 'error');
    }
  };

  const handleDeleteCart = (cart) => {
    setCartToDelete(cart);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteCart = async () => {
    if (!cartToDelete) return;

    try {
      await cartService.deleteCart(cartToDelete.id);
      showToast('Cart deleted successfully', 'success');
      setDeleteConfirmOpen(false);
      setCartToDelete(null);
      fetchCarts(); // Refresh the list
    } catch (err) {
      console.error('Error deleting cart:', err);
      showToast('Failed to delete cart', 'error');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  if (loading && carts.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600 }}>
        Cart Management
      </Typography>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ overflowX: 'auto' }}>
          <Grid container spacing={2} alignItems="center" sx={{ minWidth: 1100 }}>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                label="Search"
                placeholder="Search by user email or product name"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth>
                <InputLabel>Mini-App Type</InputLabel>
                <Select
                  value={filters.mini_app_type}
                  label="Mini-App Type"
                  onChange={(e) => handleFilterChange('mini_app_type', e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {Object.entries(miniAppTypeLabels).map(([key, label]) => (
                    <MenuItem key={key} value={key}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                label="User ID"
                value={filters.user_id}
                onChange={(e) => handleFilterChange('user_id', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                label="Date From"
                type="date"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                label="Date To"
                type="date"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={1}>
              <Button
                variant="outlined"
                startIcon={<FilterIcon />}
                onClick={() => setFilters({
                  search: '',
                  mini_app_type: '',
                  user_id: '',
                  store_id: '',
                  date_from: '',
                  date_to: '',
                  sort_by: 'updated_at',
                  sort_order: 'desc',
                })}
              >
                Clear
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Carts Table */}
      <Card>
        <CardContent>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Cart ID</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Mini-App Type</TableCell>
                  <TableCell>Store</TableCell>
                  <TableCell align="right">Items</TableCell>
                  <TableCell align="right">Total Value</TableCell>
                  <TableCell>Last Updated</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {carts.map((cart) => (
                  <TableRow key={cart.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {cart.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {cart.user_name || 'Unknown User'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {cart.user_email}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={miniAppTypeLabels[cart.mini_app_type] || cart.mini_app_type}
                        size="small"
                        sx={{
                          backgroundColor: miniAppTypeColors[cart.mini_app_type] || '#gray',
                          color: 'white',
                          fontWeight: 500,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {cart.store_name || '-'}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={500}>
                        {cart.item_count}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={500}>
                        {formatCurrency(cart.total_value)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(cart.updated_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => handleViewCart(cart)}
                        sx={{ mr: 1 }}
                      >
                        <ViewIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteCart(cart)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
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
        </CardContent>
      </Card>

      {/* Cart Details Modal */}
      {selectedCart && (
        <CartDetailsModal
          open={detailsModalOpen}
          onClose={() => {
            setDetailsModalOpen(false);
            setSelectedCart(null);
          }}
          cart={selectedCart}
          onUpdate={fetchCarts}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this cart? This action cannot be undone.
          </Typography>
          {cartToDelete && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>Cart ID:</strong> {cartToDelete.id}
              </Typography>
              <Typography variant="body2">
                <strong>User:</strong> {cartToDelete.user_name} ({cartToDelete.user_email})
              </Typography>
              <Typography variant="body2">
                <strong>Items:</strong> {cartToDelete.item_count}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={confirmDeleteCart} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CartListPage;
