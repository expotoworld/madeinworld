import React, { useState, useEffect } from 'react';
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tabs,
  Tab,

  Avatar,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Category as CategoryIcon,
  AccountTree as SubcategoryIcon,
  Store as StoreIcon,
  ShoppingBag as RetailIcon,
  SmartToy as UnmannedIcon,
  Storefront as ExhibitionIcon,
  Group as GroupBuyingIcon,
  PhotoCamera as PhotoIcon,
} from '@mui/icons-material';
import { useToast } from '../contexts/ToastContext';

const CategoryListPage = () => {
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState(0);
  const [openDialog, setOpenDialog] = useState(false);
  const [openSubcategoryDialog, setOpenSubcategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [selectedCategoryForSubcategory, setSelectedCategoryForSubcategory] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const { showToast } = useToast();

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    mini_app_association: [],
    store_id: null,
    display_order: 1,
    is_active: true,
  });

  const [subcategoryForm, setSubcategoryForm] = useState({
    name: '',
    image_url: '',
    display_order: 1,
    is_active: true,
  });
  const [subcategoryImageFile, setSubcategoryImageFile] = useState(null);

  // Store type color mapping for consistent color coding across admin panel
  const storeTypeOptions = [
    { value: '无人门店', label: '无人门店', color: '#2196f3', miniApp: '无人商店' },
    { value: '无人仓店', label: '无人仓店', color: '#4caf50', miniApp: '无人商店' },
    { value: '展销商店', label: '展销商店', color: '#ffd556', miniApp: '展销展消' },
    { value: '展销商城', label: '展销商城', color: '#f38900', miniApp: '展销展消' },
  ];


  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
  const resolveImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${API_BASE}${url}`;
  };



  const getStoreTypeInfo = (type) => {
    return storeTypeOptions.find(opt => opt.value === type) || { color: '#666', miniApp: 'Unknown' };
  };

  const miniAppTabs = [
    {
      value: 'RetailStore',
      label: '零售门店',
      icon: <RetailIcon />,
      color: '#d32f2f',
      requiresStore: false,
      description: 'Direct category management without store location'
    },
    {
      value: 'UnmannedStore',
      label: '无人商店',
      icon: <UnmannedIcon />,
      color: '#1976d2',
      requiresStore: true,
      description: 'Categories scoped by store location (无人门店 + 无人仓店)'
    },
    {
      value: 'ExhibitionSales',
      label: '展销展消',
      icon: <ExhibitionIcon />,
      color: '#7b1fa2',
      requiresStore: true,
      description: 'Categories scoped by store location (展销商店 + 展销商城)'
    },
    {
      value: 'GroupBuying',
      label: '团购团批',
      icon: <GroupBuyingIcon />,
      color: '#f57c00',
      requiresStore: false,
      description: 'Direct category management without store location'
    },
  ];

  useEffect(() => {
    fetchCategories();
    fetchStores();
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchStores(); // Also fetch stores when tab changes
  }, [currentTab, selectedStore]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const currentMiniApp = miniAppTabs[currentTab];
      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
      let url = `${API_BASE}/api/v1/categories?mini_app_type=${currentMiniApp.value}&include_subcategories=true&include_store_info=true`;

      // Add store filter for location-based mini-apps
      if (currentMiniApp.requiresStore && selectedStore) {
        url += `&store_id=${selectedStore.id}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        // Ensure data is always an array
        setCategories(Array.isArray(data) ? data : []);
      } else {
        showToast('Failed to fetch categories', 'error');
        setCategories([]); // Reset to empty array on error
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
      showToast('Error fetching categories', 'error');
      setCategories([]); // Reset to empty array on exception
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const currentMiniApp = miniAppTabs[currentTab];
      if (!currentMiniApp.requiresStore) {
        setStores([]); // Reset stores for non-store-based mini-apps
        return;
      }

      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
      const response = await fetch(`${API_BASE}/api/v1/stores?mini_app_type=${currentMiniApp.value}`);
      if (response.ok) {
        const data = await response.json();
        // Ensure data is always an array
        const storesArray = Array.isArray(data) ? data : [];
        setStores(storesArray);
        // Auto-select first store if none selected
        if (storesArray.length > 0 && !selectedStore) {
          setSelectedStore(storesArray[0]);
        }
      } else {
        showToast('Failed to fetch stores', 'error');
        setStores([]); // Reset to empty array on error
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      showToast('Error fetching stores', 'error');
      setStores([]); // Reset to empty array on exception
    }
  };

  const handleCreateCategory = async () => {
    try {
      // Validate display order
      if (categoryForm.display_order < 1) {
        showToast('Display order must be at least 1', 'error');
        return;
      }

      const currentMiniApp = miniAppTabs[currentTab];
      const categoryData = {
        ...categoryForm,
        mini_app_association: [currentMiniApp.value],
        store_type_association: 'All',
        store_id: currentMiniApp.requiresStore ? selectedStore?.id : null,
      };

      const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
      const response = await fetch(`${API_BASE}/api/v1/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(categoryData),
      });

      if (response.ok) {
        showToast('Category created successfully', 'success');
        setOpenDialog(false);
        resetCategoryForm();
        fetchCategories();
      } else {
        const errorData = await response.json();
        if (response.status === 409) {
          showToast('Display order already exists. Please choose a different order.', 'error');
        } else {
          showToast(`Failed to create category: ${errorData.error || 'Unknown error'}`, 'error');
        }
      }
    } catch (error) {
      console.error('Error creating category:', error);
      showToast('Error creating category', 'error');
    }
  };

  const handleUpdateCategory = async () => {
    try {
      // Validate display order
      if (categoryForm.display_order < 1) {
        showToast('Display order must be at least 1', 'error');
        return;
      }

      const currentMiniApp = miniAppTabs[currentTab];
      const categoryData = {
        ...categoryForm,
        mini_app_association: [currentMiniApp.value],
        store_type_association: 'All',
        store_id: currentMiniApp.requiresStore ? selectedStore?.id : null,
      };

      const response = await fetch(`${(process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com')}/api/v1/categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(categoryData),
      });

      if (response.ok) {
        showToast('Category updated successfully', 'success');
        setOpenDialog(false);
        setEditingCategory(null);
        resetCategoryForm();
        fetchCategories();
      } else {
        const errorData = await response.json();
        if (response.status === 409) {
          showToast('Display order already exists. Please choose a different order.', 'error');
        } else {
          showToast(`Failed to update category: ${errorData.error || 'Unknown error'}`, 'error');
        }
      }
    } catch (error) {
      console.error('Error updating category:', error);
      showToast('Error updating category', 'error');
    }
  };



  const handleCreateSubcategory = async () => {
    try {
      // Validate display order
      if (subcategoryForm.display_order < 1) {
        showToast('Display order must be at least 1', 'error');
        return;
      }

      let subcategoryData = { ...subcategoryForm };

      // If there's an image file, we'll upload it after creating the subcategory
      if (subcategoryImageFile) {
        subcategoryData.image_url = ''; // Will be set after image upload
      }

      const response = await fetch(`${(process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com')}/api/v1/categories/${selectedCategoryForSubcategory.id}/subcategories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subcategoryData),
      });

      if (response.ok) {
        const createdSubcategory = await response.json();

        // Upload image if provided
        if (subcategoryImageFile) {
          await handleSubcategoryImageUpload(createdSubcategory.id, subcategoryImageFile);
        }

        showToast('Subcategory created successfully', 'success');
        setOpenSubcategoryDialog(false);
        setSubcategoryForm({ name: '', image_url: '', display_order: 1, is_active: true });
        setSubcategoryImageFile(null);
        setSelectedCategoryForSubcategory(null);

        // Add a small delay to ensure database consistency before refetching
        setTimeout(() => {
          fetchCategories();
        }, 100);
      } else {
        const errorData = await response.json();
        if (response.status === 409) {
          showToast('Display order already exists. Please choose a different order.', 'error');
        } else {
          showToast(`Failed to create subcategory: ${errorData.error || 'Unknown error'}`, 'error');
        }
      }
    } catch (error) {
      console.error('Error creating subcategory:', error);
      showToast('Error creating subcategory', 'error');
    }
  };

  const handleUpdateSubcategory = async () => {
    try {
      // Validate display order
      if (subcategoryForm.display_order < 1) {
        showToast('Display order must be at least 1', 'error');
        return;
      }

      let subcategoryData = { ...subcategoryForm };

      const response = await fetch(`${(process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com')}/api/v1/subcategories/${editingSubcategory.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subcategoryData),
      });

      if (response.ok) {
        // Upload image if provided
        if (subcategoryImageFile) {
          await handleSubcategoryImageUpload(editingSubcategory.id, subcategoryImageFile);
        }

        showToast('Subcategory updated successfully', 'success');
        setOpenSubcategoryDialog(false);
        setEditingSubcategory(null);
        setSubcategoryForm({ name: '', image_url: '', display_order: 1, is_active: true });
        setSubcategoryImageFile(null);
        fetchCategories();
      } else {
        const errorData = await response.json();
        if (response.status === 409) {
          showToast('Display order already exists. Please choose a different order.', 'error');
        } else {
          showToast(`Failed to update subcategory: ${errorData.error || 'Unknown error'}`, 'error');
        }
      }
    } catch (error) {
      console.error('Error updating subcategory:', error);
      showToast('Error updating subcategory', 'error');
    }
  };

  const handleDeleteSubcategory = async (subcategoryId) => {
    if (window.confirm('Are you sure you want to delete this subcategory?')) {
      try {
        const response = await fetch(`${(process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com')}/api/v1/subcategories/${subcategoryId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          showToast('Subcategory deleted successfully', 'success');
          fetchCategories();
        } else {
          showToast('Failed to delete subcategory', 'error');
        }
      } catch (error) {
        console.error('Error deleting subcategory:', error);
        showToast('Error deleting subcategory', 'error');
      }
    }
  };

  const handleSubcategoryImageUpload = async (subcategoryId, file) => {
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${(process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com')}/api/v1/subcategories/${subcategoryId}/image`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        showToast('Subcategory image uploaded successfully', 'success');
        fetchCategories();
      } else {
        showToast('Failed to upload subcategory image', 'error');
      }
    } catch (error) {
      console.error('Error uploading subcategory image:', error);
      showToast('Error uploading subcategory image', 'error');
    }
  };

  const openSubcategoryDialogHandler = (category, subcategory = null) => {
    setSelectedCategoryForSubcategory(category);
    if (subcategory) {
      setEditingSubcategory(subcategory);
      setSubcategoryForm({
        name: subcategory.name,
        image_url: subcategory.image_url || '',
        display_order: subcategory.display_order || 1,
        is_active: subcategory.is_active !== undefined ? subcategory.is_active : true,
      });
    } else {
      setEditingSubcategory(null);
      setSubcategoryForm({ name: '', image_url: '', display_order: 1, is_active: true });
    }
    setSubcategoryImageFile(null);
    setOpenSubcategoryDialog(true);
  };



  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Loading categories...</Typography>
      </Box>
    );
  }

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
    setSelectedStore(null);
    setCategories([]);
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: '',
      mini_app_association: [],
      store_id: null,
      display_order: 1,
      is_active: true,
    });
  };

  const openCategoryDialog = (category = null) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        name: category.name,
        mini_app_association: category.mini_app_association,
        store_id: category.store_id,
        display_order: category.display_order || 1,
        is_active: category.is_active,
      });
    } else {
      setEditingCategory(null);
      resetCategoryForm();
    }
    setOpenDialog(true);
  };

  const handleDeleteCategory = async (categoryId) => {
    if (window.confirm('Are you sure you want to delete this category?')) {
      try {
        const response = await fetch(`http://localhost:8080/api/v1/categories/${categoryId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          showToast('Category deleted successfully', 'success');
          fetchCategories();
        } else {
          showToast('Failed to delete category', 'error');
        }
      } catch (error) {
        console.error('Error deleting category:', error);
        showToast('Error deleting category', 'error');
      }
    }
  };



  const currentMiniApp = miniAppTabs[currentTab];

  return (
    <Box p={3}>
      <Typography variant="h4" component="h1" mb={3}>
        Category Management
      </Typography>

      {/* Mini-App Tabs */}
      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        variant="fullWidth"
        sx={{ mb: 3 }}
      >
        {miniAppTabs.map((tab, index) => (
          <Tab
            key={tab.value}
            icon={tab.icon}
            label={tab.label}
            sx={{
              color: tab.color,
              '&.Mui-selected': {
                color: tab.color,
                fontWeight: 'bold'
              }
            }}
          />
        ))}
      </Tabs>



      {/* Store Selection for Location-Based Mini-Apps */}
      {currentMiniApp.requiresStore && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" mb={2}>
              Select Store Location
            </Typography>
            {!stores || stores.length === 0 ? (
              <Alert severity="warning">
                No stores found for this mini-app type. Please create stores first.
              </Alert>
            ) : (
              <FormControl fullWidth>
                <InputLabel>Store Location</InputLabel>
                <Select
                  value={selectedStore?.id || ''}
                  label="Store Location"
                  onChange={(e) => {
                    const storeId = e.target.value;
                    const store = stores.find(s => s.id === storeId);
                    setSelectedStore(store);
                  }}
                >
                  {stores.map((store) => {
                    const typeInfo = getStoreTypeInfo(store.type);
                    return (
                      <MenuItem key={store.id} value={store.id}>
                        <Box display="flex" alignItems="center" width="100%">
                          <Avatar
                            src={store.image_url ? `${(process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com')}${store.image_url}` : ''}
                            sx={{
                              width: 32,
                              height: 32,
                              mr: 2,
                              bgcolor: typeInfo.color
                            }}
                          >
                            <StoreIcon />
                          </Avatar>
                          <Box>
                            <Typography variant="body1">
                              {store.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {store.city} • {store.type}
                            </Typography>
                          </Box>
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Bar */}
      <Box display="flex" justifyContent="flex-end" alignItems="center" mb={3}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openCategoryDialog()}
          disabled={currentMiniApp.requiresStore && !selectedStore}
          sx={{ bgcolor: currentMiniApp.color }}
        >
          Add Category
        </Button>
      </Box>

      {/* Categories List */}
      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <Typography>Loading categories...</Typography>
        </Box>
      ) : !categories || categories.length === 0 ? (
        <Alert severity="info">
          {currentMiniApp.requiresStore && !selectedStore
            ? 'Please select a store location to view categories.'
            : 'No categories found. Create your first category to get started.'
          }
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {categories.map((category) => (
            <Grid item xs={12} key={category.id}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center" width="100%">
                    <Avatar src={resolveImageUrl(category.image_url)} sx={{ mr: 2, width: 40, height: 40 }}>
                      <CategoryIcon />
                    </Avatar>
                    <Box flexGrow={1}>
                      <Typography variant="h6">
                        {category.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Order: {category.display_order || 'N/A'}
                        {category.store_name && ` • Store: ${category.store_name} (${category.store_city})`}
                      </Typography>
                    </Box>


                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCategoryDialog(category);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategory(category.id);
                      }}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography variant="subtitle1">
                        Subcategories ({category.subcategories?.length || 0})
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => openSubcategoryDialogHandler(category)}
                      >
                        Add Subcategory
                      </Button>
                    </Box>

                    {category.subcategories && category.subcategories.length > 0 ? (
                      <List>
                        {category.subcategories.map((subcategory) => (
                          <ListItem key={subcategory.id}>
                            <Avatar
                              src={resolveImageUrl(subcategory.image_url)}
                              sx={{ mr: 2, width: 40, height: 40 }}
                            >
                              <SubcategoryIcon />
                            </Avatar>
                            <ListItemText
                              primary={subcategory.name}
                              secondary={`Order: ${subcategory.display_order}`}
                            />
                            <ListItemSecondaryAction>
                              <Tooltip title="Upload Image">
                                <IconButton size="small" component="label">
                                  <PhotoIcon />
                                  <input
                                    type="file"
                                    hidden
                                    accept="image/*"
                                    onChange={(e) => {
                                      if (e.target.files[0]) {
                                        handleSubcategoryImageUpload(subcategory.id, e.target.files[0]);
                                      }
                                    }}
                                  />
                                </IconButton>
                              </Tooltip>
                              <IconButton
                                size="small"
                                onClick={() => openSubcategoryDialogHandler(category, subcategory)}
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteSubcategory(subcategory.id)}
                                color="error"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        ))}
                      </List>
                    ) : (
                      <Typography color="textSecondary">
                        No subcategories yet. Add one to get started.
                      </Typography>
                    )}
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Category Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center">
            {currentMiniApp.icon}
            <Typography variant="h6" sx={{ ml: 1 }}>
              {editingCategory ? 'Edit Category' : 'Create Category'} - {currentMiniApp.label}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Category Name"
            fullWidth
            variant="outlined"
            value={categoryForm.name}
            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            sx={{ mb: 2 }}
          />

          <TextField
            margin="dense"
            label="Display Order"
            type="number"
            fullWidth
            variant="outlined"
            value={categoryForm.display_order}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 1;
              setCategoryForm({ ...categoryForm, display_order: Math.max(1, value) });
            }}
            inputProps={{ min: 1 }}
            helperText="Minimum value is 1. Categories will be displayed in ascending order."
            sx={{ mb: 2 }}
          />

          {currentMiniApp.requiresStore && selectedStore && (
            <Alert severity="info" sx={{ mb: 2 }}>
              This category will be scoped to: <strong>{selectedStore.name}</strong> ({selectedStore.city})
            </Alert>
          )}

          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Typography variant="body2" color="text.secondary">
              Mini-App:
            </Typography>
            <Chip
              label={currentMiniApp.label}
              size="small"
              sx={{
                bgcolor: currentMiniApp.color,
                color: 'white'
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button
            onClick={editingCategory ? handleUpdateCategory : handleCreateCategory}
            variant="contained"
          >
            {editingCategory ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Subcategory Dialog */}
      <Dialog open={openSubcategoryDialog} onClose={() => setOpenSubcategoryDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSubcategory ? 'Edit Subcategory' : 'Create Subcategory'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Subcategory Name"
            fullWidth
            variant="outlined"
            value={subcategoryForm.name}
            onChange={(e) => setSubcategoryForm({ ...subcategoryForm, name: e.target.value })}
            sx={{ mb: 2 }}
          />
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Subcategory Image
            </Typography>
            <Button
              variant="outlined"
              component="label"
              startIcon={<PhotoIcon />}
              fullWidth
              sx={{ mb: 1 }}
            >
              {subcategoryImageFile ? subcategoryImageFile.name : 'Choose Image File'}
              <input
                type="file"
                hidden
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files[0]) {
                    setSubcategoryImageFile(e.target.files[0]);
                  }
                }}
              />
            </Button>
            {subcategoryImageFile && (
              <Typography variant="caption" color="text.secondary">
                Selected: {subcategoryImageFile.name}
              </Typography>
            )}
          </Box>
          <TextField
            margin="dense"
            label="Display Order"
            type="number"
            fullWidth
            variant="outlined"
            value={subcategoryForm.display_order}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 1;
              setSubcategoryForm({ ...subcategoryForm, display_order: Math.max(1, value) });
            }}
            inputProps={{ min: 1 }}
            helperText="Minimum value is 1"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSubcategoryDialog(false)}>Cancel</Button>
          <Button
            onClick={editingSubcategory ? handleUpdateSubcategory : handleCreateSubcategory}
            variant="contained"
          >
            {editingSubcategory ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CategoryListPage;
