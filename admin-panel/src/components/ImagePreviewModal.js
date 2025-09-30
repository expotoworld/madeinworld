import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Button,
  Card,
  CardMedia,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
} from '@mui/icons-material';
import ImageCarousel from './ImageCarousel';
import api from '../services/api';

// Helper to resolve absolute URL via Worker base
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
const toImg = (url) => (url && !url.startsWith('http') ? `${API_BASE}${url}` : url || '');

/**
 * Universal Image Preview & Management Modal
 *
 * Modes:
 * - product: supports multiple images with drag-and-drop reorder, set primary, delete, upload (uses /products/:id/images endpoints)
 * - store: single image replace (POST /stores/:id/image)
 * - category: single image replace (POST /categories/:id/image)
 * - subcategory: single image replace (POST /subcategories/:id/image)
 */
export default function ImagePreviewModal({
  open,
  onClose,
  mode, // 'product' | 'store' | 'category' | 'subcategory'
  entity,
  onUpdated, // callback to notify parent to refresh list
}) {
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]); // for product mode
  const [currentUrl, setCurrentUrl] = useState(''); // for single-image modes

  const title = useMemo(() => {
    switch (mode) {
      case 'product': return 'Product Images';
      case 'store': return 'Store Image';
      case 'category': return 'Category Image';
      case 'subcategory': return 'Subcategory Image';
      default: return 'Image';
    }
  }, [mode]);

  const productId = entity?.id;

  const loadProductImages = useCallback(async (id) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/products/${id}/images`);
      setImages(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('loadProductImages error', e);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleProductUpload = async (files) => {
    if (!productId) return;
    setLoading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('images', f));
      await api.post(`/products/${productId}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadProductImages(productId);
      if (onUpdated) onUpdated();
    } catch (e) {
      console.error('handleProductUpload error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleProductDelete = async (imageId) => {
    if (!productId) return;
    setLoading(true);
    try {
      await api.delete(`/products/${productId}/images/${imageId}`);
      setImages((prev) => prev.filter((i) => i.id !== imageId));
      if (onUpdated) onUpdated();
    } catch (e) {
      console.error('handleProductDelete error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleProductReorder = async (reorderedImages) => {
    if (!productId) return;
    setLoading(true);
    try {
      const image_orders = reorderedImages.map((img, index) => ({ image_id: img.id, display_order: index + 1 }));
      await api.put(`/products/${productId}/images/reorder`, { image_orders });
      setImages(reorderedImages);
      if (onUpdated) onUpdated();
    } catch (e) {
      console.error('handleProductReorder error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimary = async (imageId) => {
    if (!productId) return;
    setLoading(true);
    try {
      await api.put(`/products/${productId}/images/${imageId}/primary`);
      setImages((prev) => prev.map((img) => ({ ...img, is_primary: img.id === imageId })));
      if (onUpdated) onUpdated();
    } catch (e) {
      console.error('handleSetPrimary error', e);
    } finally {
      setLoading(false);
    }
  };

  const singleUpload = async (file) => {
    if (!entity?.id) return;
    const formData = new FormData();
    formData.append('image', file);
    let path = '';
    if (mode === 'store') path = `/stores/${entity.id}/image`;
    if (mode === 'category') path = `/categories/${entity.id}/image`;
    if (mode === 'subcategory') path = `/subcategories/${entity.id}/image`;
    if (!path) return;
    setLoading(true);
    try {
      const { data } = await api.post(path, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data?.image_url) setCurrentUrl(data.image_url);
      if (onUpdated) onUpdated();
    } catch (e) {
      console.error('singleUpload error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (mode === 'product' && entity?.id) {
      loadProductImages(entity.id);
    } else if (entity?.image_url || entity?.imageUrl) {
      setCurrentUrl(entity.image_url || entity.imageUrl || '');
    } else if (mode === 'store' && entity?.image_url) {
      setCurrentUrl(entity.image_url);
    } else {
      setCurrentUrl('');
    }
  }, [open, mode, entity, loadProductImages]);

  const renderBody = () => {
    if (mode === 'product') {
      return (
        <Box>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
              <CircularProgress />
            </Box>
          )}
          <ImageCarousel
            images={images}
            onImageUpload={handleProductUpload}
            onImageDelete={handleProductDelete}
            onImageReorder={handleProductReorder}
            onSetPrimary={handleSetPrimary}
            loading={loading}
            maxImages={10}
          />
        </Box>
      );
    }

    // Single-image modes
    return (
      <Box>
        <Card sx={{ borderRadius: 2, mb: 2 }}>
          <Box sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
            <CardMedia
              component="img"
              image={toImg(currentUrl) || '/placeholder-product.png'}
              alt="Preview"
              sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', bgcolor: '#f5f5f5' }}
            />
          </Box>
        </Card>
        <Button variant="outlined" component="label" fullWidth disabled={loading}>
          {loading ? 'Uploading...' : 'Replace Image'}
          <input
            type="file"
            hidden
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files && e.target.files[0];
              if (file) singleUpload(file);
            }}
          />
        </Button>
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={mode === 'product' ? 'lg' : 'sm'}
      fullWidth
      PaperProps={{ sx: { maxHeight: '90vh' } }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={700}>{title}</Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: 2, minHeight: mode === 'product' ? 520 : undefined }}>
        {renderBody()}
      </DialogContent>
    </Dialog>
  );
}

