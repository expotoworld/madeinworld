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
  FormHelperText,
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
import ImagePreviewModal from '../components/ImagePreviewModal';

import { regionService, storeService, orgService, relationshipService } from '../services/api';


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
  // Image preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCtx, setPreviewCtx] = useState(null); // { mode, entity }

  const { showToast } = useToast();

  const [storeForm, setStoreForm] = useState({
    name: '',
    city: '',
    address: '',
    latitude: '',
    longitude: '',
    type: '',
    region_id: '',
    image_url: '',
    is_active: true,
    partner_org_id: '',
  });
  const [regions, setRegions] = useState([]);
  const [regionError, setRegionError] = useState('');
  const [partnerOptions, setPartnerOptions] = useState([]);
  const [partnersByStore, setPartnersByStore] = useState({});


  const storeTypeOptions = [
    { value: '无人门店', label: '无人门店', color: '#2196f3', miniApp: '无人商店' },
    { value: '无人仓店', label: '无人仓店', color: '#4caf50', miniApp: '无人商店' },
    { value: '展销商店', label: '展销商店', color: '#ffd556', miniApp: '展销展消' },
    { value: '展销商城', label: '展销商城', color: '#f38900', miniApp: '展销展消' },
  ];



  const fetchPartnersForStores = useCallback(async (list) => {
    try {
      const ids = (list || []).map(s => s.id).filter(Boolean);
      if (ids.length === 0) {
        setPartnersByStore({});
        return;
      }
      // Try batch endpoint first
      const data = await relationshipService.getStorePartnersBatch(ids);
      const results = data?.results || {};
      const map = {};
      Object.entries(results).forEach(([storeId, payload]) => {
        const partner = (payload && payload.partners && payload.partners[0]) || null;
        map[Number(storeId)] = partner;
      });
      setPartnersByStore(map);
    } catch (e) {
      console.error('Batch partner fetch failed, falling back to per-store', e);
      // Fallback to per-store requests
      try {
        const entries = await Promise.all(
          (list || []).map(async (s) => {
            try {
              const data = await relationshipService.getStorePartners(s.id);
              const partner = (data && data.partners && data.partners[0]) || null;
              return [s.id, partner];
            } catch (err) {
              console.error('Failed to fetch partner for store', s.id, err);
              return [s.id, null];
            }
          })
        );
        const map = {};
        entries.forEach(([id, partner]) => { map[id] = partner; });
        setPartnersByStore(map);
      } catch (inner) {
        console.error('Failed to fetch store partners (fallback)', inner);
      }
    }
  }, []);

  const fetchStores = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/v1/stores`);
      if (response.ok) {
        const data = await response.json();
        setStores(data);
        await fetchPartnersForStores(data);

      } else {
        showToast('Failed to fetch stores', 'error');
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      showToast('Error fetching stores', 'error');

    } finally {
      setLoading(false);
    }
  }, [showToast, fetchPartnersForStores]);

  useEffect(() => {
    (async () => {
      try {
        const data = await regionService.getRegions();
        const list = data?.regions || [];
        setRegions(list);
      } catch (e) {
        console.error('Failed to load regions', e);
      }
    })();
  }, []);


  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // Auto-select first region when creating a new store and regions are available
  useEffect(() => {
    if (openDialog && !editingStore) {
      const firstId = regions && regions.length > 0 ? regions[0].region_id : null;
      if (firstId && storeForm.region_id === '') {

        setStoreForm((f) => ({ ...f, region_id: String(firstId) }));
      }
    }
  }, [openDialog, editingStore, regions, storeForm.region_id]);
  // Prefill partner when editing a store
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!openDialog || !editingStore) return;
      try {
        const data = await relationshipService.getStorePartners(editingStore.id);
        const partner = (data && data.partners && data.partners[0]) || null;
        if (mounted) {
          setStoreForm((f) => ({ ...f, partner_org_id: partner ? partner.partner_org_id : '' }));
        }
      } catch (e) {
        console.error('Failed to prefill partner for store', editingStore?.id, e);
      }
    };
    load();
    return () => { mounted = false; };
  }, [openDialog, editingStore]);


  // Load partner options when dialog opens (top-level)
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!openDialog) return;
      try {
        const data = await orgService.getOrganizations('Partner');
        const list = Array.isArray(data) ? data : (data?.organizations || []);
        if (mounted) setPartnerOptions(list);
      } catch (e) {
        console.error('Failed to load partner options', e);
      }
    };
    load();
    return () => { mounted = false; };
  }, [openDialog]);

  const handleCreateStore = async () => {
    try {
      // Validation: region is required
      if (!storeForm.region_id) {
        setRegionError('Please select a region before creating the store');
        showToast('Please select a region before creating the store', 'error');
        return;
      }
      console.log('[StoreListPage] (Create) region_id before payload:', storeForm.region_id, typeof storeForm.region_id);
      const payload = {
        ...storeForm,
        latitude: parseFloat(storeForm.latitude),
        longitude: parseFloat(storeForm.longitude),
        region_id: Number(storeForm.region_id),
        partner_org_id: storeForm.partner_org_id ? storeForm.partner_org_id : null,
      };
      if (
        payload.region_id === null ||
        payload.region_id === undefined ||
        Number.isNaN(payload.region_id) ||
        !Number.isInteger(payload.region_id) ||
        payload.region_id <= 0
      ) {

        setRegionError('Invalid region');
        showToast('Invalid region', 'error');
        return;
      }
      await storeService.createStore(payload);
      showToast('Store created successfully', 'success');
      setOpenDialog(false);
      resetForm();
      fetchStores();
    } catch (error) {
      console.error('Error creating store:', error);
      const msg = error?.response?.data?.error || error.message || 'Error creating store';
      showToast(msg, 'error');
    }
  };

  const handleUpdateStore = async () => {
    try {
      // Validation: region is required
      if (!storeForm.region_id) {
        setRegionError('Please select a region before updating the store');
        showToast('Please select a region before updating the store', 'error');
        return;
      }
      const payload = {
        ...storeForm,
        latitude: parseFloat(storeForm.latitude),
        longitude: parseFloat(storeForm.longitude),
        region_id: Number(storeForm.region_id),
        partner_org_id: storeForm.partner_org_id ? storeForm.partner_org_id : null,
      };
      if (
        payload.region_id === null ||
        payload.region_id === undefined ||
        Number.isNaN(payload.region_id) ||
        !Number.isInteger(payload.region_id) ||
        payload.region_id <= 0
      ) {
        setRegionError('Invalid region');
        showToast('Invalid region', 'error');
        return;
      }
      await storeService.updateStore(editingStore.id, payload);
      showToast('Store updated successfully', 'success');
      setOpenDialog(false);
      resetForm();
      fetchStores();
    } catch (error) {
      console.error('Error updating store:', error);
      const msg = error?.response?.data?.error || error.message || 'Error updating store';
      showToast(msg, 'error');
    }
  };

  const handleDeleteStore = async (storeId) => {
    if (!window.confirm('Are you sure you want to delete this store?')) return;
    try {
      await storeService.deleteStore(storeId);
      showToast('Store deleted successfully', 'success');
      fetchStores();
    } catch (error) {
      console.error('Error deleting store:', error);
      showToast(error.message || 'Error deleting store', 'error');
    }
  };

  const handleImageUpload = async (storeId, file) => {
    try {
      await storeService.uploadStoreImage(storeId, file);
      showToast('Image uploaded successfully', 'success');
      fetchStores();
    } catch (error) {
      console.error('Error uploading image:', error);
      showToast(error.message || 'Error uploading image', 'error');
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
        region_id: store.region_id ? String(store.region_id) : '',
        image_url: store.image_url || '',
        is_active: store.is_active,
        partner_org_id: partnersByStore[store.id]?.partner_org_id || '',
      });
    } else {
      setEditingStore(null);
      // Initialize a clean form and auto-select first region if available
      setStoreForm({
        name: '',
        city: '',
        address: '',
        latitude: '',
        longitude: '',
        type: '',
        region_id: regions && regions.length > 0 ? String(regions[0].region_id) : '',
        image_url: '',
        is_active: true,
      });
      setRegionError('');
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
      region_id: '',
      image_url: '',
      is_active: true,
      partner_org_id: '',
    });
    setSelectedImage(null);
  };

  const getStoreTypeInfo = (type) => {
    return storeTypeOptions.find(opt => opt.value === type) || { color: '#666', miniApp: 'Unknown' };
  };

  const openInMaps = (latitude, longitude) => {
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
                          bgcolor: typeInfo.color,
                          cursor: 'pointer'
                        }}
                        variant="rounded"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPreviewCtx({ mode: 'store', entity: { id: store.id, image_url: store.image_url } });
                          setPreviewOpen(true);
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


                        {partnersByStore[store.id]?.name ? (
                          <Box mb={1}>
                            <Chip label={`Partner: ${partnersByStore[store.id].name}`} size="small" />
                          </Box>
                        ) : null}

                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Tooltip title="Navigate">
                          <IconButton
                            size="small"
                            onClick={() => openInMaps(store.latitude, store.longitude)}
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

      {/* Image Preview / Manage Modal - at page level */}
      <ImagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        mode={previewCtx?.mode}
        entity={previewCtx?.entity}
        onUpdated={fetchStores}
      />

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
            <Grid item xs={12}>
              <FormControl fullWidth variant="outlined" error={!!regionError}>
                <InputLabel>Region</InputLabel>
                <Select
                  value={storeForm.region_id}
                  onChange={(e) => {
                    let val = e.target.value;
                    // Normalize: accept number or string digits only
                    if (typeof val === 'number') {
                      val = String(val);
                    } else if (typeof val === 'string') {
                      const n = Number(val);
                      if (!Number.isNaN(n)) {
                        val = String(n);
                      }
                    }
                    setStoreForm({ ...storeForm, region_id: val });
                    if (!val) {
                      setRegionError('Please select a region before updating the store');
                    } else {
                      setRegionError('');
                    }
                  }}
                  label="Region"
                >
                  {regions.map((r) => (
                    <MenuItem key={r.region_id} value={String(r.region_id)}>{r.name}</MenuItem>
                  ))}
                </Select>
                {regionError ? <FormHelperText>{regionError}</FormHelperText> : null}
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Partner Organization</InputLabel>
                <Select
                  value={storeForm.partner_org_id}
                  onChange={(e) => setStoreForm({ ...storeForm, partner_org_id: e.target.value })}
                  label="Partner Organization"
                >
                  <MenuItem value=""><em>No Partner</em></MenuItem>
                  {partnerOptions.map((p) => (
                    <MenuItem key={p.org_id} value={p.org_id}>{p.name}</MenuItem>
                  ))}
                </Select>
                <FormHelperText>Select a partner or leave empty</FormHelperText>
              </FormControl>
            </Grid>


          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={editingStore ? handleUpdateStore : handleCreateStore}
            variant="contained"
            disabled={!storeForm.region_id}
          >
            {editingStore ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StoreListPage;
