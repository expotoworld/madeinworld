import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Avatar,






  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Store as StoreIcon,
  LocationOn as LocationIcon,
  PhotoCamera as PhotoIcon,
  Navigation as NavigationIcon,
} from '@mui/icons-material';
import { useToast } from '../contexts/ToastContext';

// API base for production routing via Cloudflare Worker
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
const getImageUrl = (url) => {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
};


const StoreListPage = () => {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [, setSelectedImage] = useState(null);
  const { showToast } = useToast();

  const [storeForm, setStoreForm] = useState({
    name: '',
    city: '',
    address: '',
    latitude: '',
    longitude: '',
    type: '',
    image_url: '',
    is_active: true,
  });

  const storeTypeOptions = [
    { value: '无人门店', label: '无人门店', color: '#2196f3', miniApp: '无人商店' },
    { value: '无人仓店', label: '无人仓店', color: '#4caf50', miniApp: '无人商店' },
    { value: '展销商店', label: '展销商店', color: '#ffd556', miniApp: '展销展消' },
    { value: '展销商城', label: '展销商城', color: '#f38900', miniApp: '展销展消' },
  ];



  const fetchStores = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/v1/stores`);
      if (response.ok) {
        const data = await response.json();
        setStores(data);
      } else {
        showToast('Failed to fetch stores', 'error');
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      showToast('Error fetching stores', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const handleCreateStore = async () => {


    try {
      const response = await fetch(`${API_BASE}/api/v1/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...storeForm,
          latitude: parseFloat(storeForm.latitude),
          longitude: parseFloat(storeForm.longitude),
        }),
      });

      if (response.ok) {
        showToast('Store created successfully', 'success');
        setOpenDialog(false);
        resetForm();
        fetchStores();
      } else {
        showToast('Failed to create store', 'error');
      }
    } catch (error) {
      console.error('Error creating store:', error);
      showToast('Error creating store', 'error');
    }
  };

  const handleUpdateStore = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/stores/${editingStore.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...storeForm,
          latitude: parseFloat(storeForm.latitude),
          longitude: parseFloat(storeForm.longitude),
        }),
      });

      if (response.ok) {
        showToast('Store updated successfully', 'success');
        setOpenDialog(false);
        resetForm();
        fetchStores();
      } else {
        showToast('Failed to update store', 'error');
      }
    } catch (error) {
      console.error('Error updating store:', error);
      showToast('Error updating store', 'error');
    }
  };

  const handleDeleteStore = async (storeId) => {
    if (window.confirm('Are you sure you want to delete this store?')) {
      try {
        const response = await fetch(`${API_BASE}/api/v1/stores/${storeId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          showToast('Store deleted successfully', 'success');
          fetchStores();
        } else {
          showToast('Failed to delete store', 'error');
        }
      } catch (error) {
        console.error('Error deleting store:', error);
        showToast('Error deleting store', 'error');
      }
    }
  };

  const handleImageUpload = async (storeId, file) => {
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_BASE}/api/v1/stores/${storeId}/image`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        showToast('Image uploaded successfully', 'success');
        fetchStores();
      } else {
        showToast('Failed to upload image', 'error');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      showToast('Error uploading image', 'error');
    }
  };

  const openStoreDialog = (store = null) => {
    if (store) {
      setEditingStore(store);
      setStoreForm({
        name: store.name,
        city: store.city,
        address: store.address,
        latitude: store.latitude.toString(),
        longitude: store.longitude.toString(),
        type: store.type,
        image_url: store.image_url || '',
        is_active: store.is_active,
      });
    } else {
      setEditingStore(null);
      resetForm();
    }
    setOpenDialog(true);
  };

  const resetForm = () => {
    setStoreForm({
      name: '',
      city: '',
      address: '',
      latitude: '',
      longitude: '',
      type: '',
      image_url: '',
      is_active: true,
    });
    setSelectedImage(null);
  };

  const getStoreTypeInfo = (type) => {
    return storeTypeOptions.find(opt => opt.value === type) || { color: '#666', miniApp: 'Unknown' };
  };

  const openInMaps = (latitude, longitude, name) => {
    const url = `https://maps.google.com/?q=${latitude},${longitude}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading stores...</Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Store Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openStoreDialog()}
        >
          Add Store
        </Button>
      </Box>

      {stores.length === 0 ? (
        <Alert severity="info">
          No stores found. Create your first store to get started.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {stores.map((store) => {
            const typeInfo = getStoreTypeInfo(store.type);
            return (
              <Grid item xs={12} md={6} lg={4} key={store.id}>
                <Card>
                  <CardContent>
                    <Box display="flex" alignItems="center" mb={2}>
                      <Avatar
                        src={store.image_url ? getImageUrl(store.image_url) : ''}
                        sx={{
                          width: 56,
                          height: 56,
                          mr: 2,
                          bgcolor: typeInfo.color
                        }}
                      >
                        <StoreIcon />
                      </Avatar>
                      <Box flexGrow={1}>
                        <Typography variant="h6" component="h2">
                          {store.name}
                        </Typography>
                        <Chip
                          label={store.type}
                          size="small"
                          sx={{
                            bgcolor: typeInfo.color,
                            color: 'white',
                            mb: 0.5
                          }}
                        />
                        <Typography variant="caption" display="block" color="text.secondary">
                          {typeInfo.miniApp}
                        </Typography>
                      </Box>
                    </Box>

                    <Box display="flex" alignItems="center" mb={1}>
                      <LocationIcon fontSize="small" color="action" sx={{ mr: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        {store.city}
                      </Typography>
                    </Box>

                    <Typography variant="body2" color="text.secondary" mb={2}>
                      {store.address}
                    </Typography>

                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Tooltip title="Navigate">
                          <IconButton
                            size="small"
                            onClick={() => openInMaps(store.latitude, store.longitude, store.name)}
                          >
                            <NavigationIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Upload Image">
                          <IconButton size="small" component="label">
                            <PhotoIcon />
                            <input
                              type="file"
                              hidden
                              accept="image/*"
                              onChange={(e) => {
                                if (e.target.files[0]) {
                                  handleImageUpload(store.id, e.target.files[0]);
                                }
                              }}
                            />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Box>
                        <IconButton
                          size="small"
                          onClick={() => openStoreDialog(store)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteStore(store.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Store Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingStore ? 'Edit Store' : 'Create Store'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                autoFocus
                label="Store Name"
                fullWidth
                variant="outlined"
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="City"
                fullWidth
                variant="outlined"
                value={storeForm.city}
                onChange={(e) => setStoreForm({ ...storeForm, city: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Address"
                fullWidth
                variant="outlined"
                multiline
                rows={2}
                value={storeForm.address}
                onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Latitude"
                fullWidth
                variant="outlined"
                type="number"
                inputProps={{ step: "any" }}
                value={storeForm.latitude}
                onChange={(e) => setStoreForm({ ...storeForm, latitude: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Longitude"
                fullWidth
                variant="outlined"
                type="number"
                inputProps={{ step: "any" }}
                value={storeForm.longitude}
                onChange={(e) => setStoreForm({ ...storeForm, longitude: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Store Type</InputLabel>
                <Select
                  value={storeForm.type}
                  onChange={(e) => setStoreForm({ ...storeForm, type: e.target.value })}
                  label="Store Type"
                >
                  {storeTypeOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Box display="flex" alignItems="center">
                        <Chip
                          label={option.label}
                          size="small"
                          sx={{
                            bgcolor: option.color,
                            color: 'white',
                            mr: 1
                          }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          ({option.miniApp})
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={editingStore ? handleUpdateStore : handleCreateStore}
            variant="contained"
          >
            {editingStore ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StoreListPage;
