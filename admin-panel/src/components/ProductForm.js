import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  FormControlLabel,
  Switch,
  Autocomplete,
} from '@mui/material';

import api, { productService, storeService, categoryService, orgService, relationshipService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import ImageCarousel from './ImageCarousel';

const steps = ['Product Details', 'Image Management'];

const ProductForm = ({ open, onClose, onProductCreated, product = null, onProductUpdated }) => {
  const { showSuccess, showError } = useToast();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    // Step 1 - Basic Product Details
    title: '',
    sku: '',
    description_long: '',
    weight: '1',
    main_price: '',
    strikethrough_price: '',
    cost_price: '',
    stock_left: 0,
    minimum_order_quantity: 1,

    // Step 2 - Categorization & Settings
    mini_app_type: '零售门店',
    store_id: null,
    shelf_code: '',
    category_ids: [],
    subcategory_ids: [],
    is_featured: false,
    is_mini_app_recommendation: false,
    is_active: true,

    // Org assignments (single selection)
    manufacturer_org_id: '',
    tpl_org_id: '',
  });

  // Step 3 - Image Management
  const [productId, setProductId] = useState(null);
  const [productImages, setProductImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Dynamic dropdown data
  const [stores, setStores] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  // Organizations for sourcing/logistics
  const [manufacturers, setManufacturers] = useState([]);
  const [tpls, setTpls] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);

  const [shelfCodeError, setShelfCodeError] = useState('');
  const [shelfCodeChecking, setShelfCodeChecking] = useState(false);

  const [loadingSubcategories, setLoadingSubcategories] = useState(false);

  // Mini-app type options (memoized to stabilize dependencies)
  const miniAppTypes = useMemo(() => ([
    { value: '零售门店', label: '零售门店', requiresStore: false },
    { value: '无人商店', label: '无人商店', requiresStore: true },
    { value: '展销展消', label: '展销展消', requiresStore: true },
    { value: '团购团批', label: '团购团批', requiresStore: false },
  ]), []);



  // Helper function to convert backend mini-app type to frontend display value
  const convertBackendMiniAppType = (backendType) => {
    const backendToFrontendMap = {
      'RetailStore': '零售门店',
      'UnmannedStore': '无人商店',
      'ExhibitionSales': '展销展消',
      'GroupBuying': '团购团批',
    };
    return backendToFrontendMap[backendType] || '零售门店';
  };



  const handleInputChange = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setFormData({
      ...formData,
      [field]: value,
    });
  };

  const handleCategoriesChange = (categoryIds) => {
    setFormData({
      ...formData,
      category_ids: categoryIds,
      subcategory_ids: [], // Reset subcategories when categories change
    });
    // Load subcategories for selected categories
    if (categoryIds.length > 0) {
      loadSubcategories(categoryIds[0]); // Load subcategories for first selected category
    } else {
      setSubcategories([]);
    }
  };

  const handleSubcategoriesChange = (subcategoryIds) => {
    setFormData({
      ...formData,
      subcategory_ids: subcategoryIds,
    });
  };

  // Load stores based on mini-app type
  const loadStores = useCallback(async (miniAppType) => {
    if (!miniAppTypes.find(type => type.value === miniAppType)?.requiresStore) {
      setStores([]);
      return;
    }

    try {
      setLoadingStores(true);
      const storesData = await storeService.getStoresByMiniApp(
        miniAppType === '无人商店' ? 'UnmannedStore' : 'ExhibitionSales'
      );
      setStores(storesData);
    } catch (error) {
      console.error('Error loading stores:', error);
      showError('Failed to load stores');
      setStores([]);
    } finally {
      setLoadingStores(false);
    }
  }, [miniAppTypes, showError]);

  // Load categories based on mini-app type and store
  const loadCategories = useCallback(async (miniAppType, storeId = null) => {
    try {
      setLoadingCategories(true);
      const miniAppTypeMap = {
        '零售门店': 'RetailStore',
        '无人商店': 'UnmannedStore',
        '展销展消': 'ExhibitionSales',
        '团购团批': 'GroupBuying',
      };

      const categoriesData = await categoryService.getCategoriesByMiniApp(
        miniAppTypeMap[miniAppType],
        storeId
      );
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading categories:', error);
      showError('Failed to load categories');
      setCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  }, [showError]);

  // Load subcategories for a specific category
  const loadSubcategories = useCallback(async (categoryId) => {
    try {
      setLoadingSubcategories(true);
      const subcategoriesData = await categoryService.getSubcategories(categoryId);
      setSubcategories(subcategoriesData);
    } catch (error) {
      console.error('Error loading subcategories:', error);
      showError('Failed to load subcategories');
      setSubcategories([]);
    } finally {
      setLoadingSubcategories(false);
    }
  }, [showError]);

  // Load existing product images when editing
  const loadProductImages = async (productId) => {
    try {
      const { data } = await api.get(`/products/${productId}/images`);
      setProductImages(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading product images:', error);
      setProductImages([]);
    }
  };

  // Handle mini-app type change
  const handleMiniAppTypeChange = (event) => {
    const newMiniAppType = event.target.value;
    setFormData({
      ...formData,
      mini_app_type: newMiniAppType,
      store_id: null,
      category_ids: [],
      subcategory_ids: [],
    });

    // Load stores if required
    loadStores(newMiniAppType);
    // Load categories for new mini-app type
    loadCategories(newMiniAppType);
    // Clear subcategories
    setSubcategories([]);
  };

  // Handle store selection change
  const handleStoreChange = (event) => {
    const newStoreId = event.target.value;
    setFormData({
      ...formData,
      store_id: newStoreId,
      category_ids: [],
      subcategory_ids: [],
    });

    // Reload categories for new store
    loadCategories(formData.mini_app_type, newStoreId);
    // Clear subcategories
    setSubcategories([]);
  };

  // Real-time shelf code validation (debounced)
  useEffect(() => {
    const requiresStore = ['无人商店', '展销展消'].includes(formData.mini_app_type);
    if (!requiresStore || !formData.store_id) {
      setShelfCodeError('');
      return;
    }
    const code = (formData.shelf_code || '').trim();
    if (!code) {
      setShelfCodeError('');
      return;
    }
    setShelfCodeChecking(true);
    const t = setTimeout(async () => {
      try {
        const result = await productService.validateShelfCode({
          store_id: formData.store_id,
          shelf_code: code,
          product_id: productId,
        });
        if (result && result.valid === false) {
          setShelfCodeError('Shelf code already exists for this store');
        } else {
          setShelfCodeError('');
        }
      } catch (e) {
        // Fail-open: do not block user if validation endpoint not available
        setShelfCodeError('');
      } finally {
        setShelfCodeChecking(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [formData.mini_app_type, formData.store_id, formData.shelf_code, productId]);

  // Load categories when mini-app type changes or on mount
  useEffect(() => {
    loadCategories(formData.mini_app_type);
  }, [formData.mini_app_type, loadCategories]);

  // Initialize form data when editing an existing product
  useEffect(() => {
    if (product && open) {
      const frontendMiniAppType = convertBackendMiniAppType(product.mini_app_type);
      setFormData({
        title: product.title || '',
        sku: product.sku || '',
        description_long: product.description_long || '',
        weight: (product.weight != null ? product.weight.toString() : '1'),
        main_price: product.main_price || '',
        strikethrough_price: product.strikethrough_price || '',
        cost_price: product.cost_price || '',
        stock_left: product.stock_left || 0,
        minimum_order_quantity: product.minimum_order_quantity || 1,
        mini_app_type: frontendMiniAppType,
        store_id: product.store_id || null,
        shelf_code: product.shelf_code || '',
        category_ids: product.category_ids || [],
        subcategory_ids: product.subcategory_ids || [],
        is_featured: product.is_featured || false,
        is_mini_app_recommendation: product.is_mini_app_recommendation || false,
        is_active: product.is_active !== undefined ? product.is_active : true,
      });
      setProductId(product.id);
      loadProductImages(product.id);
      loadCategories(frontendMiniAppType);
      if (product.category_ids && product.category_ids.length > 0) {
        loadSubcategories(product.category_ids[0]);
      }
      if (['无人商店', '展销展消'].includes(frontendMiniAppType)) {
        loadStores(frontendMiniAppType);
      }

	      // Prefill existing sourcing/logistics assignments when editing
	      (async () => {
	        try {
	          const [sourcing, logistics] = await Promise.all([
	            relationshipService.getProductSourcing(product.id).catch(() => null),
	            relationshipService.getProductLogistics(product.id).catch(() => null),
	          ]);
	          const firstManufacturer = sourcing?.mappings?.[0]?.manufacturer_org_id || '';
	          const firstTpl = logistics?.mappings?.[0]?.tpl_org_id || '';
	          if (firstManufacturer || firstTpl) {
	            setFormData(prev => ({
	              ...prev,
	              manufacturer_org_id: firstManufacturer,
	              tpl_org_id: firstTpl,
	            }));
	          }
	        } catch (e) {
	          console.warn('Failed to prefill assignments', e);
	        }
	      })();

    } else if (!product && open) {
      setFormData({
        title: '',
        sku: '',
        description_long: '',
        weight: '1',
        main_price: '',
        strikethrough_price: '',
        cost_price: '',
        stock_left: 0,
        minimum_order_quantity: 1,
        mini_app_type: '零售门店',
        store_id: null,
        shelf_code: '',
        category_ids: [],

        subcategory_ids: [],
        is_featured: false,
        is_mini_app_recommendation: false,
        is_active: true,
      });
      setProductId(null);
      setProductImages([]);
      setActiveStep(0);
    }
  }, [product, open, loadCategories, loadStores, loadSubcategories]);

  // Handle multiple image upload
  const handleMultipleImageUpload = async (files) => {
    if (!productId) {
      showError('Please create the product first');
      return;
    }


    try {
      setUploadingImages(true);
      const formData = new FormData();

      files.forEach((file) => {
        formData.append('images', file);
      });

      const { data } = await api.post(`/products/${productId}/images`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setProductImages(prev => [...prev, ...data.images]);
      showSuccess(`${data.images.length} image(s) uploaded successfully`);
    } catch (error) {
      console.error('Error uploading images:', error);
      showError(`Failed to upload images: ${error.message}`);
    } finally {
      setUploadingImages(false);
    }
  };

  // Handle image deletion
  const handleImageDelete = async (imageId) => {
    if (!productId) return;

    try {
      await api.delete(`/products/${productId}/images/${imageId}`);
      setProductImages(prev => prev.filter(img => img.id !== imageId));
      showSuccess('Image deleted successfully');
    } catch (error) {
      console.error('Error deleting image:', error);
      showError('Failed to delete image');
    }
  };

  // Handle image reordering
  const handleImageReorder = async (reorderedImages) => {
    if (!productId) return;

    try {
      const imageOrders = reorderedImages.map((img, index) => ({
        image_id: img.id,
        display_order: index + 1,
      }));

      await api.put(`/products/${productId}/images/reorder`, { image_orders: imageOrders });
      setProductImages(reorderedImages);
      showSuccess('Images reordered successfully');
    } catch (error) {
      console.error('Error reordering images:', error);
      showError('Failed to reorder images');
    }
  };

  // Handle setting primary image
  const handleSetPrimaryImage = async (imageId) => {
    if (!productId) return;

    try {
      await api.put(`/products/${productId}/images/${imageId}/primary`);
      setProductImages(prev => prev.map(img => ({
        ...img,
        is_primary: img.id === imageId,
      })));
      showSuccess('Primary image set successfully');
    } catch (error) {
      console.error('Error setting primary image:', error);
      showError('Failed to set primary image');
    }
  };
  // Load organizations when entering Step 2
  useEffect(() => {
    if (!open) return;
    if (activeStep !== 0) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingOrgs(true);
        const [m, l] = await Promise.all([
          orgService.getOrganizations('Manufacturer'),
          orgService.getOrganizations('3PL'),
        ]);
        if (!cancelled) {
          setManufacturers(m?.organizations || []);
          setTpls(l?.organizations || []);
        }
      } catch (e) {
        console.error('Failed to load organizations', e);
      } finally {
        if (!cancelled) setLoadingOrgs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeStep]);


  // Handle Step 1: Basic Details validation
  // eslint-disable-next-line no-unused-vars
  const handleStep1Submit = () => {
    try {
      setError(null);

      // Validate required fields for Step 1
      if (!formData.title || !formData.sku || !formData.main_price || !formData.weight) {
        throw new Error('Please fill in all required fields');
      }

      // Validate weight >= 1 gram
      const weightVal = parseFloat(formData.weight);
      if (isNaN(weightVal) || weightVal < 1) {
        throw new Error('Product weight must be at least 1 gram');
      }

      // Validate minimum order quantity
      if (formData.minimum_order_quantity < 1) {
        throw new Error('Minimum order quantity must be at least 1');
      }

      // Move to Step 2
      setActiveStep(1);
    } catch (error) {
      setError(error.message);
    }
  };

  // Handle Step 2: Categorization & Settings validation and product creation
  const handleStep2Submit = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate mini-app specific requirements
      const selectedMiniAppType = miniAppTypes.find(type => type.value === formData.mini_app_type);
      if (selectedMiniAppType?.requiresStore && !formData.store_id) {
        throw new Error('Please select a store for this mini-app type');
      }
      if (selectedMiniAppType?.requiresStore && formData.store_id) {
        const code = (formData.shelf_code || '').trim();
        if (!code) {
          throw new Error('Please enter a shelf code');
        }
        if (shelfCodeError) {
          throw new Error('Shelf code must be unique for the selected store');
        }
      }

      // Map mini-app type to backend values
      const miniAppTypeMap = {
        '零售门店': 'RetailStore',
        '无人商店': 'UnmannedStore',
        '展销展消': 'ExhibitionSales',
        '团购团批': 'GroupBuying',
      };

      // Determine store_type based on mini-app type logic
      let storeType;
      if (formData.mini_app_type === '无人商店') {
        // For unmanned stores, store_type should be derived from selected store
        const selectedStore = stores.find(store => store.id === parseInt(formData.store_id));
        storeType = selectedStore ? selectedStore.type : '无人门店'; // fallback within unmanned context
      } else if (formData.mini_app_type === '展销展消') {
        // For exhibition sales, store_type should be derived from selected store
        const selectedStore = stores.find(store => store.id === parseInt(formData.store_id));
        storeType = selectedStore ? selectedStore.type : '展销商店'; // fallback within exhibition context
      } else {
        // For 零售门店 and 团购团批, store_type must be NULL
        storeType = null;
      }

      // Prepare data for API
      const requiresStore = miniAppTypes.find(t => t.value === formData.mini_app_type)?.requiresStore;
      const productData = {
        ...formData,
        main_price: parseFloat(formData.main_price),
        strikethrough_price: formData.strikethrough_price
          ? parseFloat(formData.strikethrough_price)
          : null,
        cost_price: formData.cost_price
          ? parseFloat(formData.cost_price)
          : null,
        weight: formData.weight ? parseFloat(formData.weight) : 1,
        stock_left: parseInt(formData.stock_left) || 0,
        minimum_order_quantity: parseInt(formData.minimum_order_quantity) || 1,
        mini_app_type: miniAppTypeMap[formData.mini_app_type],
        store_type: storeType,
        store_id: formData.store_id ? parseInt(formData.store_id) : null,
        shelf_code: requiresStore && formData.store_id ? (formData.shelf_code?.trim() || null) : null,
        is_active: formData.is_active,
        category_ids: formData.category_ids,
        subcategory_ids: formData.subcategory_ids,
        // Main page featured only for 无人商店 and 展销展消
        is_featured: ['无人商店', '展销展消'].includes(formData.mini_app_type) ? formData.is_featured : false,
        is_mini_app_recommendation: formData.is_mini_app_recommendation,
      };

      // Debug: Log the data being sent to API
      console.log('🔍 Product data being sent to API:', {
        category_ids: productData.category_ids,
        subcategory_ids: productData.subcategory_ids,
        formData_categories: formData.category_ids,
        formData_subcategories: formData.subcategory_ids
      });

      let response;
      if (product) {
        // Update existing product
        response = await productService.updateProduct(product.id, productData);
        // Apply sourcing/logistics assignments
        try {
          const pid = product.id;
          const selectedStore = stores.find(s => s.id === parseInt(formData.store_id));
          const regionId = selectedStore?.region_id || null;
          const promises = [];
          if (formData.manufacturer_org_id && regionId) {
            promises.push(
              relationshipService.manageProductSourcing(pid, [{ region_id: regionId, manufacturer_org_id: formData.manufacturer_org_id }])
            );
          }
          if (formData.tpl_org_id) {
            promises.push(
              relationshipService.manageProductLogistics(pid, [{ tpl_org_id: formData.tpl_org_id }])
            );
          }
          if (promises.length) await Promise.all(promises);
        } catch (e) {
          console.warn('Assignments update failed (non-blocking):', e);
        }
        // Fetch fresh product to reflect latest values (e.g., cost_price) without page refresh
        try {
          const fresh = await productService.getProduct(product.id);
          if (onProductUpdated) onProductUpdated(fresh);
        } catch (e) {
          console.warn('Could not fetch fresh product after update:', e);
          if (onProductUpdated) onProductUpdated();
        }
        showSuccess('Product updated successfully! Now manage images.');
        setActiveStep(1); // Move to Step 2 (Image Management)
      } else {
        // Create new product
        response = await productService.createProduct(productData);
        const pid = response.product_id;
        setProductId(pid);
        // Apply sourcing/logistics assignments
        try {
          const selectedStore = stores.find(s => s.id === parseInt(formData.store_id));
          const regionId = selectedStore?.region_id || null;
          const promises = [];
          if (formData.manufacturer_org_id && regionId) {
            promises.push(
              relationshipService.manageProductSourcing(pid, [{ region_id: regionId, manufacturer_org_id: formData.manufacturer_org_id }])
            );
          }
          if (formData.tpl_org_id) {
            promises.push(
              relationshipService.manageProductLogistics(pid, [{ tpl_org_id: formData.tpl_org_id }])
            );
          }
          if (promises.length) await Promise.all(promises);
        } catch (e) {
          console.warn('Assignments update failed (non-blocking):', e);
        }
        showSuccess('Product created successfully! Now add images.');
        setActiveStep(1); // Move to Step 2 (Image Management)
      }

    } catch (err) {
      console.error(`Error ${product ? 'updating' : 'creating'} product:`, err);
      let errorMessage = err.message || `Failed to ${product ? 'update' : 'create'} product`;

      // Handle specific error cases
      if (err.message && err.message.includes('duplicate key value violates unique constraint "products_sku_key"')) {
        errorMessage = `SKU "${formData.sku}" already exists. Please use a different SKU (e.g., "${formData.sku}-${Date.now().toString().slice(-4)}")`;
      } else if (err.message && err.message.includes('SKU')) {
        errorMessage = `SKU error: ${err.message}`;
      }

      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Handle Step 3: Complete the process
  const handleStep3Submit = () => {
    if (product) {
      showSuccess('Product updated successfully with all details!');
      if (onProductUpdated) {
        onProductUpdated();
      }
    } else {
      showSuccess('Product created successfully with all details!');
      if (onProductCreated) {
        onProductCreated();
      }
    }
    handleClose();
  };

  const handleClose = () => {
    // Reset form state
    setActiveStep(0);
    setFormData({
      title: '',
      sku: '',
      description_long: '',
      weight: '1',
      main_price: '',
      strikethrough_price: '',
      cost_price: '',
      stock_left: 0,
      minimum_order_quantity: 1,
      mini_app_type: '零售门店',
      store_id: null,
      shelf_code: '',
      category_ids: [],
      subcategory_ids: [],
      is_featured: false,
      is_mini_app_recommendation: false,
      is_active: true,
      manufacturer_org_id: '',
      tpl_org_id: '',
    });
    setProductId(null);
    setProductImages([]);
    setUploadingImages(false);
    setStores([]);
    setCategories([]);
    setSubcategories([]);
    setError(null);
    setSuccess(null);
    setLoading(false);

    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: '12px' }
      }}
    >
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {product ? 'Edit Product' : 'Add New Product'}
        </Typography>

        <Stepper activeStep={activeStep} sx={{ mt: 2 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </DialogTitle>

      <DialogContent sx={{ pt: 6, pb: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {/* Step 1: Basic Product Details */}
        {activeStep === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            <TextField
              label="Product Title *"
              value={formData.title}
              onChange={handleInputChange('title')}
              fullWidth
              disabled={loading}
            />

            <TextField
              label="SKU *"
              value={formData.sku}
              onChange={handleInputChange('sku')}
              fullWidth
              disabled={loading}
              helperText="Unique product identifier"
            />

            <TextField
              label="Product Description"


              value={formData.description_long}
              onChange={handleInputChange('description_long')}
              fullWidth
              multiline
              rows={3}
              disabled={loading}
              helperText="Detailed description for product"
            />


            <TextField
              label="Product Weight (grams) *"
              value={formData.weight}
              onChange={handleInputChange('weight')}
              type="number"
              inputProps={{ step: '0.01', min: '1' }}
              fullWidth
              disabled={loading}
              helperText="grams"
            />

            {/* Pricing Section */}
            <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Pricing & Inventory</Typography>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Main Price *"
                value={formData.main_price}
                onChange={handleInputChange('main_price')}
                type="number"
                inputProps={{ step: '0.01', min: '0' }}
                fullWidth
                disabled={loading}
              />

              <TextField
                label="Strikethrough Price"
                value={formData.strikethrough_price}
                onChange={handleInputChange('strikethrough_price')}
                type="number"
                inputProps={{ step: '0.01', min: '0' }}
                fullWidth
                disabled={loading}
                helperText="Optional original price"
              />

              <TextField
                label="Cost Price"
                value={formData.cost_price}
                onChange={handleInputChange('cost_price')}
                type="number"
                inputProps={{ step: '0.01', min: '0' }}
                fullWidth
                disabled={loading}
                helperText="Manufacturer price (admin only)"
              />
            </Box>


            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Stock Quantity"
                value={formData.stock_left}
                onChange={handleInputChange('stock_left')}
                type="number"
                inputProps={{ min: '0' }}
                fullWidth
                disabled={loading}
                helperText="Available inventory"
              />

              <TextField
                label="Minimum Order Quantity *"
                value={formData.minimum_order_quantity}
                onChange={handleInputChange('minimum_order_quantity')}
                type="number"
                inputProps={{ min: '1' }}
                fullWidth
                disabled={loading}
                helperText="Minimum order quantity"
              />
            </Box>
          </Box>
        )}

        {/* Product Details: Categorization & Settings */}
        {activeStep === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Mini-App Configuration</Typography>

            <FormControl fullWidth disabled={loading}>
              <InputLabel>Mini-APP Type *</InputLabel>
              <Select
                value={formData.mini_app_type}
                onChange={handleMiniAppTypeChange}
                label="Mini-APP Type *"
              >
                {miniAppTypes.map((type) => (
                  <MenuItem key={type.value} value={type.value}>
                    {type.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Conditional Store Selection */}
            {miniAppTypes.find(type => type.value === formData.mini_app_type)?.requiresStore && (
              <FormControl fullWidth disabled={loading || loadingStores}>
                <InputLabel>Store Location *</InputLabel>
                <Select
                  value={formData.store_id || ''}
                  onChange={handleStoreChange}
                  label="Store Location *"
                >
                  {stores.map((store) => (
                    <MenuItem key={store.id} value={store.id}>
                      {store.name} - {store.city}
                    </MenuItem>
                  ))}
                </Select>
                {loadingStores && (
                  <Typography variant="caption" sx={{ mt: 1, color: 'text.secondary' }}>
                    Loading stores...
                  </Typography>
                )}
              </FormControl>
            )}

            <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>Product Categories</Typography>

            {/* Dynamic Category Selection */}
            <FormControl fullWidth disabled={loading || loadingCategories}>
              <InputLabel>Category *</InputLabel>
              <Select
                value={formData.category_ids[0] || ''}
                onChange={(e) => handleCategoriesChange(e.target.value ? [e.target.value] : [])}
                label="Category *"
              >
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
              {loadingCategories && (
                <Typography variant="caption" sx={{ mt: 1, color: 'text.secondary' }}>
                  Loading categories...
                </Typography>
              )}
            </FormControl>

            {/* Dynamic Subcategory Selection */}
            {subcategories.length > 0 && (
              <FormControl fullWidth disabled={loading || loadingSubcategories}>
                <InputLabel>Subcategory</InputLabel>
                <Select
                  value={formData.subcategory_ids[0] || ''}
                  onChange={(e) => handleSubcategoriesChange(e.target.value ? [e.target.value] : [])}
                  label="Subcategory"
                >
                  {subcategories.map((subcategory) => (
                    <MenuItem key={subcategory.id} value={subcategory.id.toString()}>
                      {subcategory.name}
                    </MenuItem>
                  ))}
                </Select>
                {loadingSubcategories && (
                  <Typography variant="caption" sx={{ mt: 1, color: 'text.secondary' }}>
                    Loading subcategories...
                  </Typography>
                )}
              </FormControl>
            )}

            {/* Shelf Code (only for store-based mini-apps) */}
            {miniAppTypes.find(type => type.value === formData.mini_app_type)?.requiresStore && formData.store_id && (
              <TextField
                label="Shelf Code"
                value={formData.shelf_code}
                onChange={handleInputChange('shelf_code')}
                required
                inputProps={{ maxLength: 50 }}
                fullWidth
                disabled={loading}
                error={Boolean(shelfCodeError)}
                helperText={
                  shelfCodeError
                    ? shelfCodeError
                    : (shelfCodeChecking
                        ? 'Checking...'
                        : ((formData.shelf_code || '').trim() ? 'Available • Unique per store' : 'Unique per store'))
                }
                FormHelperTextProps={{
                  sx: { color: shelfCodeError ? 'error.main' : (shelfCodeChecking ? 'text.secondary' : 'success.main') }
                }}
              />
            )}


            {/* Main Page Featured Toggle - Only for 无人商店 and 展销展消 */}
            {['无人商店', '展销展消'].includes(formData.mini_app_type) && (
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_featured}
                      onChange={handleInputChange('is_featured')}
                      disabled={loading}
                      color="secondary"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        Add to 热门推荐 (Main Page Featured)
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        Featured products appear prominently in the main app
                      </Typography>
                    </Box>
                  }
                  sx={{ alignItems: 'flex-start' }}
                />
              </Box>
            )}

            {/* Mini-App Recommendation Toggle - For all mini-apps */}
            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_mini_app_recommendation}
                    onChange={handleInputChange('is_mini_app_recommendation')}
                    disabled={loading}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      Mini-App Recommendation
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Product appears in the recommendation section of the {formData.mini_app_type} mini-app
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start' }}
              />
            </Box>

            <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>Product Settings</Typography>

            {/* Product Status Toggle */}
            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_active}
                    onChange={handleInputChange('is_active')}
                    disabled={loading}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      Product Status
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formData.is_active ? 'Active - Visible to customers' : 'Inactive - Hidden from customers'}
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start' }}
              />
            </Box>

	            {/* Organization Assignments */}
	            <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>Organization Assignments</Typography>

	            <Autocomplete
	              options={manufacturers}
	              getOptionLabel={(option) => option?.name || ''}
	              loading={loadingOrgs}
	              value={manufacturers.find(o => o.org_id === formData.manufacturer_org_id) || null}
	              onChange={(_, newValue) => setFormData({ ...formData, manufacturer_org_id: newValue ? newValue.org_id : '' })}
	              renderInput={(params) => (
	                <TextField {...params} label="Manufacturer" placeholder="Search manufacturers..." fullWidth />
	              )}
	              disabled={loading}
	            />

	            <Box sx={{ mt: 2 }} />

	            <Autocomplete
	              options={tpls}
	              getOptionLabel={(option) => option?.name || ''}
	              loading={loadingOrgs}
	              value={tpls.find(o => o.org_id === formData.tpl_org_id) || null}
	              onChange={(_, newValue) => setFormData({ ...formData, tpl_org_id: newValue ? newValue.org_id : '' })}
	              renderInput={(params) => (
	                <TextField {...params} label="3PL" placeholder="Search 3PL organizations..." fullWidth />
	              )}
	              disabled={loading}
	            />

          </Box>
        )}

        {/* Step 2: Image Management */}
        {activeStep === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Product Images
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Upload multiple images for your product. The first image will be used as the main thumbnail.
            </Typography>

            <ImageCarousel
              images={productImages}
              onImageUpload={handleMultipleImageUpload}
              onImageDelete={handleImageDelete}
              onImageReorder={handleImageReorder}
              onSetPrimary={handleSetPrimaryImage}
              loading={uploadingImages}
              maxImages={10}
            />
          </Box>
        )}
      </DialogContent>


      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>

        {/* Back Button (for steps 2 and 3) */}
        {activeStep > 0 && (
          <Button
            onClick={() => setActiveStep(activeStep - 1)}
            disabled={loading}
          >
            Back
          </Button>
        )}

        {/* Step-specific action buttons */}
        {activeStep === 0 && (
          <Button
            variant="contained"
            onClick={handleStep2Submit}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading
              ? (product ? 'Updating Product...' : 'Creating Product...')
              : (product ? 'Update Product & Continue' : 'Create Product & Continue')
            }
          </Button>
        )}


        {activeStep === 1 && (
          <Button
            variant="contained"
            onClick={handleStep3Submit}
            disabled={loading || uploadingImages}
            color="success"
          >
            {product ? 'Complete Product Update' : 'Complete Product Creation'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ProductForm;
