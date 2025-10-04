import axios from 'axios';

// Single base URL via Cloudflare Worker
const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://device-api.expomadeinworld.com';
export const AUTH_BASE = `${API_BASE}/api/auth`;
export const ADMIN_BASE = `${API_BASE}/api/admin`;
export const CATALOG_BASE = `${API_BASE}/api/v1`;
// Route manufacturer endpoints through the same gateway mount as admin -> order-service
export const MANUFACTURER_BASE = `${API_BASE}/api/admin/manufacturer`;

// Token storage helpers
const TOKEN_KEY = 'admin_token';
const REFRESH_KEY = 'admin_refresh_token';

function getAccessToken() {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw)?.token || null; } catch { return null; }
}
function setAccessToken(token, expiresAt) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt }));
}
function getRefreshToken() {
  const raw = localStorage.getItem(REFRESH_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw)?.refresh_token || null; } catch { return null; }
}
function setRefreshToken(refresh_token, refresh_expires_at) {
  localStorage.setItem(REFRESH_KEY, JSON.stringify({ refresh_token, refresh_expires_at }));
}

let isRefreshing = false;
let pendingRequests = [];

async function performRefresh() {
  if (isRefreshing) {
    return new Promise((resolve, reject) => pendingRequests.push({ resolve, reject }));
  }
  isRefreshing = true;
  try {
    const rt = getRefreshToken();
    if (!rt) throw new Error('No refresh token');
<<<<<<< HEAD
    const resp = await axios.post(`${AUTH_BASE}/token/refresh`, { refresh_token: rt, rotate: false });
=======
    const resp = await axios.post(`${AUTH_BASE}/token/refresh`, { refresh_token: rt });
>>>>>>> origin/main
    const newToken = resp.data?.token;
    const newTokenExp = resp.data?.expires_at;
    const newRefresh = resp.data?.refresh_token;
    const newRefreshExp = resp.data?.refresh_expires_at;
<<<<<<< HEAD
    if (!newToken) throw new Error('Invalid refresh response');
    setAccessToken(newToken, newTokenExp);
    if (newRefresh && newRefreshExp) setRefreshToken(newRefresh, newRefreshExp);
=======
    if (!newToken || !newRefresh) throw new Error('Invalid refresh response');
    setAccessToken(newToken, newTokenExp);
    setRefreshToken(newRefresh, newRefreshExp);
>>>>>>> origin/main
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    pendingRequests.forEach(p => p.resolve(newToken));
    pendingRequests = [];
    return newToken;
  } catch (e) {
    pendingRequests.forEach(p => p.reject(e));
    pendingRequests = [];
    // Clear storage on refresh failure
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem('admin_user');
    throw e;
  } finally {
    isRefreshing = false;
  }
}

// Create axios instance with base configuration (Catalog API v1)
const api = axios.create({
  baseURL: CATALOG_BASE,
  timeout: 10000, // 10 seconds timeout
  headers: { 'Content-Type': 'application/json' },
});

// Attach token on requests (both api instance and global axios)
function attachRequestInterceptor(instance) {
  instance.interceptors.request.use(
    (config) => {
<<<<<<< HEAD
      const url = typeof config.url === 'string' ? config.url : '';
      const isRefresh = url.includes('/token/refresh');
      if (!isRefresh) {
        const tok = getAccessToken();
        if (tok) config.headers.Authorization = `Bearer ${tok}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
}
attachRequestInterceptor(api);
attachRequestInterceptor(axios);

// 401 handler with silent refresh (once) then retry
function attachResponseInterceptor(instance) {
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config || {};
      const url = typeof originalRequest.url === 'string' ? originalRequest.url : '';
      const isRefresh = url.includes('/token/refresh');
      if (!isRefresh && error.response?.status === 401 && !originalRequest?._retry) {
        originalRequest._retry = true;
        try {
          const newTok = await performRefresh();
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers['Authorization'] = `Bearer ${newTok}`;
          return instance(originalRequest);
        } catch (e) {
          if (window.location.hash !== '#/login') window.location.hash = '#/login';
          return Promise.reject(error);
        }
      }
=======
      const tok = getAccessToken();
      if (tok) config.headers.Authorization = `Bearer ${tok}`;
      return config;
    },
    (error) => Promise.reject(error)
  );
}
attachRequestInterceptor(api);
attachRequestInterceptor(axios);

// 401 handler with silent refresh (once) then retry
function attachResponseInterceptor(instance) {
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      if (error.response?.status === 401 && !originalRequest?._retry) {
        originalRequest._retry = true;
        try {
          const newTok = await performRefresh();
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers['Authorization'] = `Bearer ${newTok}`;
          return instance(originalRequest);
        } catch (e) {
          // Redirect to login on failure
          if (window.location.hash !== '#/login') window.location.hash = '#/login';
          return Promise.reject(error);
        }
      }
>>>>>>> origin/main
      return Promise.reject(error);
    }
  );
}
attachResponseInterceptor(api);
attachResponseInterceptor(axios);

// Helper function to get auth headers
const getAuthHeaders = () => {
  const savedToken = localStorage.getItem('admin_token');
  if (savedToken) {
    try {
      const tokenData = JSON.parse(savedToken);
      if (tokenData.token) {
        return {
          'Authorization': `Bearer ${tokenData.token}`
        };
      }
    } catch (error) {
      console.error('Error parsing stored token:', error);
    }
  }
  return {};
};

// Response interceptor for handling auth errors (final fallback)
// Do NOT clear tokens on the first 401; let the refresh interceptor above handle retry.
// Only clear if a retry already happened or no refresh token is present.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const original = error.config || {}
    const hasTried = !!original._retry
    const hasRefresh = !!localStorage.getItem('admin_refresh_token')
    if (error.response?.status === 401 && (hasTried || !hasRefresh)) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (window.location.hash !== '#/login') {
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('Response error:', error);

    // Handle common error scenarios
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      console.error(`API Error ${status}:`, data);

      switch (status) {
        case 400:
          throw new Error(data.error || 'Bad request');
        case 404:
          throw new Error('Resource not found');
        case 409:
          throw new Error(data.error || 'Conflict - resource already exists');
        case 500:
          throw new Error('Internal server error');
        default:
          throw new Error(data.error || `Server error: ${status}`);
      }
    } else if (error.request) {
      // Network error
      console.error('Network error:', error.request);
      throw new Error('Network error - please check your connection');
    } else {
      // Other error
      console.error('Error:', error.message);
      throw new Error(error.message);
    }
  }
);

// User service methods
export const userService = {
  // Get all users with pagination and filtering
  getUsers: async (params = {}) => {
    const response = await axios.get(`${ADMIN_BASE}/users`, {
      params,
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get single user by ID
  getUser: async (userId) => {
    const response = await axios.get(`${ADMIN_BASE}/users/${userId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Create new user
  createUser: async (userData) => {
    const response = await axios.post(`${ADMIN_BASE}/users`, userData, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Update user
  updateUser: async (userId, userData) => {
    const response = await axios.put(`${ADMIN_BASE}/users/${userId}`, userData, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Delete user
  deleteUser: async (userId) => {
    const response = await axios.delete(`${ADMIN_BASE}/users/${userId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Update user status
  updateUserStatus: async (userId, statusData) => {
    const response = await axios.post(`${ADMIN_BASE}/users/${userId}/status`, statusData, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get user analytics
  getUserAnalytics: async () => {
    const response = await axios.get(`${ADMIN_BASE}/users/analytics`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Bulk update users
  bulkUpdateUsers: async (bulkData) => {
    const response = await axios.post(`${ADMIN_BASE}/users/bulk-update`, bulkData, {
      headers: getAuthHeaders()
    });
    return response.data;
  },
};

// API service methods
export const productService = {
  // Get all products
  getProducts: async (params = {}) => {
    const response = await api.get('/products', { params, headers: getAuthHeaders() });
    return response.data;
  },

  // Get manufacturer-scoped products (authenticated non-admins)
  getManufacturerProducts: async (params = {}) => {
    const response = await api.get('/manufacturer/products', { params, headers: getAuthHeaders() });
    return response.data;
  },

  // Get single product by ID
  getProduct: async (id) => {
    const response = await api.get(`/products/${id}`, { headers: getAuthHeaders() });
    return response.data;
  },

  // Create new product
  createProduct: async (productData) => {
    const response = await api.post('/products', productData);
    return response.data;
  },

  // Update existing product
  updateProduct: async (productId, productData) => {
    const response = await api.put(`/products/${productId}`, productData);
    return response.data;
  },

	  // Validate shelf code uniqueness per store (real-time)
	  validateShelfCode: async ({ store_id, shelf_code, product_id = null }) => {
	    const params = { store_id, shelf_code };
	    if (product_id) params.product_id = product_id;
	    const response = await api.get('/products/validate-shelf-code', { params });
	    return response.data; // expected shape: { valid: boolean }
	  },


  // Delete product (soft delete by default)
  deleteProduct: async (productId, hardDelete = false) => {
    const params = hardDelete ? { hard: 'true' } : {};
    const response = await api.delete(`/products/${productId}`, { params });
    return response.data;
  },

  // Upload product image
  uploadProductImage: async (productId, imageFile) => {
    const formData = new FormData();
    formData.append('productImage', imageFile);

    const response = await api.post(`/products/${productId}/image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export const categoryService = {
  // Get all categories
  getCategories: async (params = {}) => {
    const response = await api.get('/categories', { params });
    return response.data;
  },

  // Get categories by mini-app type and store (for dynamic filtering)
  getCategoriesByMiniApp: async (miniAppType, storeId = null) => {
    const params = {
      mini_app_type: miniAppType,
      include_subcategories: true
    };
    if (storeId) {
      params.store_id = storeId;
    }
    const response = await api.get('/categories', { params });
    return response.data;
  },

  // Get subcategories for a specific category
  getSubcategories: async (categoryId) => {
    const response = await api.get(`/categories/${categoryId}/subcategories`);
    return response.data;
  },

  // Get single category by ID
  getCategory: async (id) => {
    const response = await api.get(`/categories/${id}`);
    return response.data;
  },

  // Create new category
  createCategory: async (categoryData) => {
    const response = await api.post('/categories', categoryData);
    return response.data;
  },
};

export const storeService = {
  // Get all stores (public read)
  getStores: async (params = {}) => {
    const response = await api.get('/stores', { params });
    return response.data;
  },

  // Get stores by mini-app type (public read)
  getStoresByMiniApp: async (miniAppType) => {
    const params = { mini_app_type: miniAppType };
    const response = await api.get('/stores', { params });
    return response.data;
  },

  // Get stores by specific store type (public read)
  getStoresByType: async (storeType) => {
    const params = { type: storeType };
    const response = await api.get('/stores', { params });
    return response.data;
  },

  // Admin writes
  createStore: async (payload) => {
    const response = await api.post('/stores', payload, { headers: getAuthHeaders() });
    return response.data;
  },
  updateStore: async (id, payload) => {
    const response = await api.put(`/stores/${id}`, payload, { headers: getAuthHeaders() });
    return response.data;
  },
  deleteStore: async (id) => {
    const response = await api.delete(`/stores/${id}`, { headers: getAuthHeaders() });
    return response.data;
  },
  uploadStoreImage: async (id, file) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post(`/stores/${id}/image`, formData, {
      headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

export const healthService = {
  // Check service health
  checkHealth: async () => {
    const response = await api.get('/health');
    return response.data;
  },
};

// Order service methods
export const orderService = {
  // Get all orders with pagination and filtering
  getOrders: async (params = {}) => {
    const response = await axios.get(`${ADMIN_BASE}/orders`, {
      params,
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get single order by ID
  getOrder: async (orderId) => {
    const response = await axios.get(`${ADMIN_BASE}/orders/${orderId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Update order status
  updateOrderStatus: async (orderId, status, reason = '') => {
    const response = await axios.put(`${ADMIN_BASE}/orders/${orderId}/status`, {
      status,
      reason
    }, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Delete/cancel order
  deleteOrder: async (orderId) => {
    const response = await axios.delete(`${ADMIN_BASE}/orders/${orderId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Bulk update orders
  bulkUpdateOrders: async (orderIds, status, reason = '') => {
    const response = await axios.post(`${ADMIN_BASE}/orders/bulk-update`, {
      order_ids: orderIds,
      status,
      reason
    }, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get order statistics
  getStatistics: async (dateFrom = '', dateTo = '') => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    const response = await axios.get(`${ADMIN_BASE}/orders/statistics`, {
      params,
      headers: getAuthHeaders()
    });
    return response.data;
  },
};

// Cart service methods
export const cartService = {
  // Get all carts with pagination and filtering
  getCarts: async (params = {}) => {
    const response = await axios.get(`${ADMIN_BASE}/carts`, {
      params,
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get single cart by ID
  getCart: async (cartId) => {
    const response = await axios.get(`${ADMIN_BASE}/carts/${cartId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Update cart item quantity
  updateCartItem: async (cartId, productId, quantity) => {
    const response = await axios.put(`${ADMIN_BASE}/carts/${cartId}/items`, {
      product_id: productId,
      quantity: quantity
    }, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Delete cart
  deleteCart: async (cartId) => {
    const response = await axios.delete(`${ADMIN_BASE}/carts/${cartId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get cart statistics
  getStatistics: async (dateFrom = '', dateTo = '') => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;

    const response = await axios.get(`${ADMIN_BASE}/carts/statistics`, {
      params,
      headers: getAuthHeaders()
    });
    return response.data;
  },
};

// Manufacturer order service methods
export const manufacturerOrderService = {
  // Get manufacturer-scoped orders
  getOrders: async (params = {}) => {
    const response = await axios.get(`${MANUFACTURER_BASE}/orders`, {
      params,
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Get single order details (read-only)
  getOrder: async (orderId) => {
    const response = await axios.get(`${MANUFACTURER_BASE}/orders/${orderId}`, {
      headers: getAuthHeaders()
    });
    return response.data;
  },

  // Update order status (only allowed for orders including their products)
  updateOrderStatus: async (orderId, status, reason = '') => {
    const response = await axios.put(`${MANUFACTURER_BASE}/orders/${orderId}/status`, {
      status,
      reason
    }, {
      headers: getAuthHeaders()
    });
    return response.data;
  },
};


// Organization service methods
export const orgService = {
  getOrganizations: async (orgType = null) => {
    const params = {};
    if (orgType) params.org_type = orgType;
    const response = await api.get('/organizations', { params, headers: getAuthHeaders() });
    return response.data;
  },
  createOrganization: async (payload) => {
    const response = await api.post('/organizations', payload, { headers: getAuthHeaders() });
    return response.data;
  },
  updateOrganization: async (id, payload) => {
    const response = await api.put(`/organizations/${id}`, payload, { headers: getAuthHeaders() });
    return response.data;
  },
  deleteOrganization: async (id) => {
    const response = await api.delete(`/organizations/${id}`, { headers: getAuthHeaders() });
    return response.data;
  },
  getOrganizationUsers: async (orgId) => {
    const response = await api.get(`/organizations/${orgId}/users`, { headers: getAuthHeaders() });
    return response.data;
  },
  setOrganizationUsers: async (orgId, assignments) => {
    const response = await api.post(`/organizations/${orgId}/users`, { assignments }, { headers: getAuthHeaders() });
    return response.data;
  },
};

// Regions service methods
export const regionService = {
  getRegions: async () => {
    const response = await api.get('/regions', { headers: getAuthHeaders() });
    return response.data;
  },
  createRegion: async (payload) => {
    const response = await api.post('/regions', payload, { headers: getAuthHeaders() });
    return response.data;
  },
  updateRegion: async (id, payload) => {
    const response = await api.put(`/regions/${id}`, payload, { headers: getAuthHeaders() });
    return response.data;
  },
  deleteRegion: async (id) => {
    const response = await api.delete(`/regions/${id}`, { headers: getAuthHeaders() });
    return response.data;
  },
};

// Relationship management
export const relationshipService = {
  manageProductSourcing: async (productId, mappings) => {
    const response = await api.post(`/products/${productId}/sourcing`, { mappings }, { headers: getAuthHeaders() });
    return response.data;
  },
  manageProductLogistics: async (productId, mappings) => {
    const response = await api.post(`/products/${productId}/logistics`, { mappings }, { headers: getAuthHeaders() });
    return response.data;
  },
  getProductSourcing: async (productId) => {
    const response = await api.get(`/products/${productId}/sourcing`, { headers: getAuthHeaders() });
    return response.data; // { mappings: [ { manufacturer_org_id, region_id, name } ] }
  },
  getProductLogistics: async (productId) => {
    const response = await api.get(`/products/${productId}/logistics`, { headers: getAuthHeaders() });
    return response.data; // { mappings: [ { tpl_org_id, name } ] }
  },
  getStorePartners: async (storeId) => {
    const response = await api.get(`/stores/${storeId}/partners`, { headers: getAuthHeaders() });
    return response.data;
  },
  // Batch fetch partners for multiple stores
  getStorePartnersBatch: async (storeIds = []) => {
    const ids = (storeIds || []).filter(Boolean).join(',');
    const response = await api.get(`/store-partners`, {
      params: { store_ids: ids },
      headers: getAuthHeaders(),
    });
    return response.data; // { results: { "7": { partners: [...] }, ... } }
  },
  manageStorePartners: async (storeId, mappings) => {
    const response = await api.post(`/stores/${storeId}/partners`, { mappings }, { headers: getAuthHeaders() });
    return response.data;
  },
};


// Export the axios instance as default for custom requests
export default api;
