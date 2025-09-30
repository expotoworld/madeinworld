import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Store as StoreIcon,
} from '@mui/icons-material';
import { productService } from '../services/api';

import ProductForm from '../components/ProductForm';
import ProductDetailsModal from '../components/ProductDetailsModal';
import DeleteProductDialog from '../components/DeleteProductDialog';
import ProductStatusToggle from '../components/ProductStatusToggle';
import ImagePreviewModal from '../components/ImagePreviewModal';



// Resolve image URLs via Worker
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
const toImg = (url) => (url && !url.startsWith('http') ? `${API_BASE}${url}` : url || '');

const ProductListPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  // Image preview modal

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCtx, setPreviewCtx] = useState(null); // { mode, entity }


  const fetchProducts = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = isAdmin
        ? await productService.getProducts()
        : await productService.getManufacturerProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err.message || 'Failed to load products');
      setProducts([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isAdmin]);


  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleAddProduct = () => {
    setAddModalOpen(true);
  };

  const handleCloseModal = () => {
    setAddModalOpen(false);
  };

  const handleProductCreated = () => {
    // Refresh the product list after successful creation
    fetchProducts();
    setAddModalOpen(false);
  };

  // Handler functions for CRUD operations
  const handleViewDetails = (product) => {
    setSelectedProduct(product);
    setDetailsModalOpen(true);
  };

  const handleEditProduct = (product) => {
    setSelectedProduct(product);
    setEditModalOpen(true);
  };

  const handleDeleteProduct = (product) => {
    setSelectedProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleProductUpdated = (updated) => {
    // Update the local list immediately for a snappy UX, then refresh from server
    if (updated && updated.id) {
      setProducts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    }
    // Keep the edit modal open so the user can proceed to Image Management (Step 3)
    fetchProducts(true);
  };

  const handleProductDeleted = () => {
    // Refresh the product list after successful deletion
    fetchProducts();
    setDeleteDialogOpen(false);
    setSelectedProduct(null);
  };

  const handleCloseModals = () => {
    setDetailsModalOpen(false);
    setEditModalOpen(false);
    setDeleteDialogOpen(false);
    setSelectedProduct(null);
  };

  const handleStatusChanged = (productId, newStatus) => {
    // Update the product status in the local state
    setProducts(prevProducts =>
      prevProducts.map(product =>
        product.id === productId
          ? { ...product, is_active: newStatus }
          : product
      )
    );
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  // Helper function to get the correct type display for a product
  const getProductTypeDisplay = (product) => {
    // For RetailStore and GroupBuying, use mini_app_type as the primary identifier
    if (product.mini_app_type === 'RetailStore') {
      return '零售商店';
    } else if (product.mini_app_type === 'GroupBuying') {
      return '团购团批';
    } else if (product.mini_app_type === 'UnmannedStore' || product.mini_app_type === 'ExhibitionSales') {
      // For location-dependent mini-apps, use store_type from the associated store
      // The backend should populate this correctly via JOIN with stores table
      return product.store_type;
    }
    // Fallback to store_type
    return product.store_type;
  };

  const getStoreTypeChip = (product) => {
    const typeDisplay = getProductTypeDisplay(product);

    // Color mapping for store/mini-app types
    const getTypeColor = (type) => {
      const colorMap = {
        '零售商店': { bg: '#520ee6', hover: '#4a0dd1' }, // purple
        '无人门店': { bg: '#2196f3', hover: '#1976d2' }, // blue
        '无人仓店': { bg: '#4caf50', hover: '#388e3c' }, // green
        '展销商店': { bg: '#ffd556', hover: '#ffcc33' }, // yellow
        '展销商城': { bg: '#f38900', hover: '#e67c00' }, // orange
        '团购团批': { bg: '#076200', hover: '#054d00' }, // dark green
      };
      return colorMap[type] || { bg: '#757575', hover: '#616161' }; // default gray
    };

    const colors = getTypeColor(typeDisplay);

    return (
      <Chip
        label={typeDisplay}
        size="small"
        variant="filled"
        sx={{
          fontWeight: 500,
          fontSize: '12px',
          backgroundColor: colors.bg,
          color: '#fff',
          '&:hover': {
            backgroundColor: colors.hover,
          }
        }}
      />
    );
  };

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
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 4,
        }}
      >
        <Box>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
            Products
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your product catalog and inventory
          </Typography>
        </Box>

        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddProduct}
            sx={{
              borderRadius: '8px',
              textTransform: 'none',
              fontWeight: 600,
              px: 3,
              py: 1.5,
            }}
          >
            Add Product
          </Button>
        )}
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Products Table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>SKU</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Categories</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Price</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Stock</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!products || products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <StoreIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary" gutterBottom>
                          No products found
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Get started by adding your first product
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  (products || []).map((product) => (
                    <TableRow
                      key={product.id}
                      hover
                      sx={{
                        opacity: product.is_active ? 1 : 0.6,
                        backgroundColor: product.is_active ? 'inherit' : 'action.hover'
                      }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar
                            src={toImg(product.image_urls?.[0])}
                            alt={product.title}
                            sx={{
                              width: 48,
                              height: 48,
                              filter: product.is_active ? 'none' : 'grayscale(50%)',
                              cursor: 'pointer'
                            }}
                            variant="rounded"
                            imgProps={{ onError: (e) => { e.currentTarget.src=''; } }}
                            onClick={() => {
                              setPreviewCtx({ mode: 'product', entity: { id: product.id } });
                              setPreviewOpen(true);
                            }}
                          >
                            <StoreIcon />
                          </Avatar>
                          <Box>
                            <Typography
                              variant="body1"
                              sx={{
                                fontWeight: 500,
                                textDecoration: product.is_active ? 'none' : 'line-through',
                                color: product.is_active ? 'text.primary' : 'text.secondary'
                              }}
                            >
                              {product.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {product.description_long}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {product.sku}
                        </Typography>
                      </TableCell>

                      {/* Categories Column */}
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {product.category_ids && product.category_ids.length > 0 ? (
                            product.category_ids.map((categoryId) => (
                              <Chip
                                key={categoryId}
                                label={`Cat ${categoryId}`}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: '0.75rem', height: 20 }}
                              />
                            ))
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No categories
                            </Typography>
                          )}
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          {getStoreTypeChip(product)}
                          {/* 热门推荐 tag - Only for 无人商店 and 展销展消 mini-apps */}
                          {['UnmannedStore', 'ExhibitionSales'].includes(product.mini_app_type) && product.is_featured && (
                            <Chip
                              label="热门推荐"
                              size="small"
                              variant="filled"
                              sx={{
                                fontSize: '0.75rem',
                                height: 20,
                                backgroundColor: '#e2430f',
                                color: '#fff',
                                '&:hover': {
                                  backgroundColor: '#cc3a0e',
                                }
                              }}
                            />
                          )}
                          {/* Mini-APP 推荐 tag - For all mini-app types */}
                          {product.is_mini_app_recommendation && (
                            <Chip
                              label="Mini-APP 推荐"
                              size="small"
                              variant="filled"
                              sx={{
                                fontSize: '0.75rem',
                                height: 20,
                                backgroundColor: '#0adcd5',
                                color: '#fff',
                                '&:hover': {
                                  backgroundColor: '#09c4be',
                                }
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Box>
                          <Typography variant="body1" sx={{ fontWeight: 600 }}>
                            {formatPrice(product.main_price)}
                          </Typography>
                          {product.strikethrough_price && (
                            <Typography
                              variant="body2"
                              sx={{
                                textDecoration: 'line-through',
                                color: 'text.secondary',
                              }}
                            >
                              {formatPrice(product.strikethrough_price)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>

                      <TableCell>
                        {(product.store_type === '无人门店' || product.store_type === '无人仓店') ? (
                          <Typography variant="body2">
                            {product.stock_left || 0} units
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            N/A
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {isAdmin && (
                            <ProductStatusToggle
                              product={product}
                              onStatusChanged={handleStatusChanged}
                            />
                          )}
                          <Chip
                            label={product.is_active ? 'Active' : 'Inactive'}
                            size="small"
                            color={product.is_active ? 'success' : 'default'}
                            variant="filled"
                          />
                        </Box>
                      </TableCell>

                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="View Details">
                            <IconButton
                              size="small"
                              onClick={() => handleViewDetails(product)}
                              sx={{ color: 'primary.main' }}
                            >
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {isAdmin && (
                            <>
                              <Tooltip title="Edit Product">
                                <IconButton
                                  size="small"
                                  onClick={() => handleEditProduct(product)}
                                  sx={{ color: 'warning.main' }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Product">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteProduct(product)}
                                  sx={{ color: 'error.main' }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add Product Modal */}
      <ProductForm
        open={addModalOpen}
        onClose={handleCloseModal}
        onProductCreated={handleProductCreated}
      />

      {/* Product Details Modal */}
      <ProductDetailsModal
        open={detailsModalOpen}
        onClose={handleCloseModals}
        product={selectedProduct}
        onUpdated={fetchProducts}
      />


      {/* Edit Product Modal */}
      <ProductForm
        open={editModalOpen}
        onClose={handleCloseModals}
        product={selectedProduct}
        onProductUpdated={handleProductUpdated}
      />

      {/* Delete Product Dialog */}
      <DeleteProductDialog
        open={deleteDialogOpen}
        onClose={handleCloseModals}
        product={selectedProduct}
        onProductDeleted={handleProductDeleted}
      />

      {/* Image Preview / Manage Modal */}
      <ImagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        mode={previewCtx?.mode}
        entity={previewCtx?.entity}
        onUpdated={fetchProducts}
      />

    </Box>
  );
};

export default ProductListPage;
