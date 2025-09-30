import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,

  TextField,
  MenuItem,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';

const OrderDetailsModal = ({ open, onClose, order, onStatusUpdate, readOnly = false }) => {
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');

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

  const handleStartEdit = () => {
    setNewStatus(order.order.status);
    setStatusReason('');
    setEditingStatus(true);
  };

  const handleCancelEdit = () => {
    setEditingStatus(false);
    setNewStatus('');
    setStatusReason('');
  };

  const handleSaveStatus = async () => {
    if (newStatus && newStatus !== order.order.status) {
      await onStatusUpdate(order.order.id, newStatus, statusReason);
      setEditingStatus(false);
      setNewStatus('');
      setStatusReason('');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount) => {
    return `¥${amount.toFixed(2)}`;
  };

  if (!order) return null;

  const { order: orderInfo, items } = order;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            Order Details - #{orderInfo.id.slice(-8)}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={3}>
          {/* Order Information */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Order Information
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Order ID:</Typography>
                  <Typography variant="body2" fontWeight={500}>#{orderInfo.id}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Mini-App:</Typography>
                  <Chip
                    label={miniAppTypeLabels[orderInfo.mini_app_type] || orderInfo.mini_app_type}
                    size="small"
                    variant="outlined"
                  />
                </Box>
                {orderInfo.store_name && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Store:</Typography>
                    <Typography variant="body2" fontWeight={500}>{orderInfo.store_name}</Typography>
                  </Box>
                )}
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Total Amount:</Typography>
                  <Typography variant="body2" fontWeight={600} color="primary">
                    {formatCurrency(orderInfo.total_amount)}
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">Status:</Typography>
                  {readOnly ? (
                    <Chip
                      label={orderInfo.status.charAt(0).toUpperCase() + orderInfo.status.slice(1)}
                      size="small"
                      sx={{
                        backgroundColor: statusColors[orderInfo.status] || '#gray',
                        color: 'white',
                        fontWeight: 500,
                      }}
                    />
                  ) : editingStatus ? (
                    <Box display="flex" alignItems="center" gap={1}>
                      <TextField
                        select
                        size="small"
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                        sx={{ minWidth: 120 }}
                      >
                        <MenuItem value="pending">Pending</MenuItem>
                        <MenuItem value="confirmed">Confirmed</MenuItem>
                        <MenuItem value="processing">Processing</MenuItem>
                        <MenuItem value="shipped">Shipped</MenuItem>
                        <MenuItem value="delivered">Delivered</MenuItem>
                        <MenuItem value="cancelled">Cancelled</MenuItem>
                      </TextField>
                      <IconButton size="small" onClick={handleSaveStatus} color="primary">
                        <SaveIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={handleCancelEdit}>
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={orderInfo.status.charAt(0).toUpperCase() + orderInfo.status.slice(1)}
                        size="small"
                        sx={{
                          backgroundColor: statusColors[orderInfo.status] || '#gray',
                          color: 'white',
                          fontWeight: 500,
                        }}
                      />
                      <IconButton size="small" onClick={handleStartEdit}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Created:</Typography>
                  <Typography variant="body2">{formatDate(orderInfo.created_at)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Updated:</Typography>
                  <Typography variant="body2">{formatDate(orderInfo.updated_at)}</Typography>
                </Box>
              </Box>
            </Paper>

            {editingStatus && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom fontWeight={600}>
                  Status Update Reason
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="Reason (Optional)"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Enter reason for status change..."
                />
              </Paper>
            )}
          </Grid>

          {/* Customer Information */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Customer Information
              </Typography>
              <Box display="flex" flexDirection="column" gap={1}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Customer ID:</Typography>
                  <Typography variant="body2" fontWeight={500}>{orderInfo.user_id.slice(-8)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Name:</Typography>
                  <Typography variant="body2" fontWeight={500}>{orderInfo.user_name || 'N/A'}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Email:</Typography>
                  <Typography variant="body2">{orderInfo.user_email}</Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* Order Items */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom fontWeight={600}>
              Order Items ({items.length})
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Product</TableCell>
                    <TableCell align="center">Quantity</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Total Price</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>
                            {item.product_title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            SKU: {item.product_sku}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2">{item.quantity}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{formatCurrency(item.unit_price)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {formatCurrency(item.total_price)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3}>
                      <Typography variant="body1" fontWeight={600}>Total</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body1" fontWeight={600} color="primary">
                        {formatCurrency(orderInfo.total_amount)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default OrderDetailsModal;
