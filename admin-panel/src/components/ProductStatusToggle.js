import React, { useState } from 'react';
import {
  Switch,
  FormControlLabel,
  CircularProgress,
  Tooltip,
  Alert,
  Snackbar,
} from '@mui/material';


const ProductStatusToggle = ({ product, onStatusChanged }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleStatusToggle = async (event) => {
    const newStatus = event.target.checked;
    
    try {
      setLoading(true);
      setError(null);

      // TODO: Implement updateProductStatus API call
      // await productService.updateProductStatus(product.id, newStatus);
      
      // For now, simulate the API call
      setTimeout(() => {
        // Call the callback to update the product in the parent component
        onStatusChanged(product.id, newStatus);
        setLoading(false);
      }, 500);
      
    } catch (err) {
      console.error('Error updating product status:', err);
      setError(err.message || 'Failed to update product status');
      setLoading(false);
    }
  };

  const handleCloseError = () => {
    setError(null);
  };

  return (
    <>
      <Tooltip 
        title={loading ? 'Updating...' : `Click to ${product.is_active ? 'deactivate' : 'activate'} product`}
      >
        <FormControlLabel
          control={
            loading ? (
              <CircularProgress size={20} sx={{ mx: 1 }} />
            ) : (
              <Switch
                checked={product.is_active}
                onChange={handleStatusToggle}
                size="small"
                color="primary"
              />
            )
          }
          label=""
          sx={{ margin: 0 }}
        />
      </Tooltip>

      {/* Error Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseError} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
};

export default ProductStatusToggle;
