import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  Grid,
  Card,
  CardContent,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  CalendarToday as CalendarIcon,
  TrendingUp as TrendingUpIcon,
  PhoneIphone as PhoneIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { userService } from '../services/api';
import { useToast } from '../contexts/ToastContext';

const UserListPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalUsers, setTotalUsers] = useState(0);
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [analytics, setAnalytics] = useState(null);

  // Menu and dialog states
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null); // Store user ID for deletion
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    role: 'Customer',
    status: 'active'
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const { showToast } = useToast();

  // User roles and statuses
  const userRoles = ['Customer', 'Admin', 'Manufacturer', '3PL', 'Partner'];
  const userStatuses = ['active', 'deactivated'];

  // Fetch users data
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = {
        page: page + 1,
        limit: rowsPerPage,
        sort: orderBy,
        order: order,
      };

      if (searchTerm) params.search = searchTerm;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;

      const response = await userService.getUsers(params);
      setUsers(response.users || []);
      setTotalUsers(response.total || 0);
      setError(null);
    } catch (err) {
      setError('Failed to fetch users');
      showToast('Failed to fetch users', 'error');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      const analyticsData = await userService.getUserAnalytics();
      setAnalytics(analyticsData);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, orderBy, order, searchTerm, roleFilter, statusFilter]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Handle sorting
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Handle pagination
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Handle search
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  // Handle filter changes
  const handleRoleFilterChange = (event) => {
    setRoleFilter(event.target.value);
    setPage(0);
  };

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
    setPage(0);
  };

  // Handle menu actions
  const handleMenuClick = (event, user) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const handleEditUser = () => {
    // Store user data before closing menu (which sets selectedUser to null)
    const userToEdit = selectedUser;
    handleMenuClose();

    // Populate form with selected user data
    setFormData({
      user_id: userToEdit.id, // Store the user ID for later use (backend uses 'id' field)
      username: userToEdit.username || '',
      email: userToEdit.email || '',
      phone: userToEdit.phone || '',
      first_name: userToEdit.first_name || '',
      middle_name: userToEdit.middle_name || '',
      last_name: userToEdit.last_name || '',
      role: userToEdit.role || 'Customer',
      status: userToEdit.status || 'active'
    });
    setFormErrors({});
    setEditDialogOpen(true);
  };

  const handleDeleteUser = () => {
    // Store user ID before closing menu (which sets selectedUser to null)
    setUserToDelete(selectedUser.id); // Store user ID for deletion (backend uses 'id' field)
    handleMenuClose();
    setDeleteDialogOpen(true);
  };

  // Form handling functions
  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      phone: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      role: 'Customer',
      status: 'active'
    });
    setFormErrors({});
  };

  const handleCreateUser = () => {
    resetForm();
    setCreateDialogOpen(true);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (isEdit = false) => {
    const errors = {};

    if (!formData.username.trim()) errors.username = 'Username is required';
    if (!formData.email.trim()) errors.email = 'Email is required';


    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.email && !emailRegex.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // CRUD operations
  const handleSubmitCreate = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await userService.createUser(formData);
      showToast('User created successfully', 'success');
      setCreateDialogOpen(false);
      resetForm();
      fetchUsers(); // Refresh the list
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to create user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitEdit = async () => {
    if (!validateForm(true)) return;

    setSubmitting(true);
    try {
      console.log('Form data:', formData);
      console.log('User ID:', formData.user_id);

      // Transform frontend form data to backend expected format
      const updateData = {};

      // Send name parts individually (backend composes full_name server-side)
      if (formData.first_name !== undefined) updateData.first_name = formData.first_name;
      if (formData.middle_name !== undefined) updateData.middle_name = formData.middle_name;
      if (formData.last_name !== undefined) updateData.last_name = formData.last_name;

      if (formData.email !== undefined) updateData.email = formData.email;
      if (formData.phone !== undefined) updateData.phone = formData.phone;
      if (formData.role !== undefined) updateData.role = formData.role;
      if (formData.status !== undefined) updateData.status = formData.status;

      await userService.updateUser(formData.user_id, updateData);
      showToast('User updated successfully', 'success');
      setEditDialogOpen(false);
      resetForm();
      fetchUsers(); // Refresh the list
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to update user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    setSubmitting(true);
    try {
      console.log('Deleting user ID:', userToDelete);
      await userService.deleteUser(userToDelete);
      showToast('User deleted successfully', 'success');
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchUsers(); // Refresh the list
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Get role chip color
  const getRoleChipColor = (role) => {
    const colors = {
      'Customer': 'default',
      'Admin': 'error',
      'Manufacturer': 'primary',
      '3PL': 'secondary',
      'Partner': 'success',
    };
    return colors[role] || 'default';
  };

  // Get status chip color
  const getStatusChipColor = (status) => {
    const colors = {
      'active': 'success',
      'deactivated': 'error',
    };
    return colors[status] || 'default';
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const d = new Date(dateString);
    return d.toLocaleString();
  };

  // Table columns configuration
  const columns = [
    { id: 'username', label: 'Username', sortable: true },
    { id: 'full_name', label: 'Name', sortable: true },
    { id: 'email', label: 'Email', sortable: true },
    { id: 'phone', label: 'Phone Number', sortable: true },
    { id: 'role', label: 'Role', sortable: true },
    { id: 'status', label: 'Status', sortable: false },
    { id: 'created_at', label: 'Joined', sortable: true },
    { id: 'last_login', label: 'Last Login', sortable: true },
    { id: 'order_count', label: 'Orders', sortable: true },
    { id: 'actions', label: 'Actions', sortable: false },
  ];

  if (loading && users.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading users...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          User Management
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage user accounts, roles, and permissions
        </Typography>
      </Box>

      {/* Analytics Cards */}
      {analytics && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <PersonIcon color="primary" sx={{ mr: 2 }} />
                  <Box>
                    <Typography variant="h6">{analytics.total_users}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Users
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <TrendingUpIcon color="success" sx={{ mr: 2 }} />
                  <Box>
                    <Typography variant="h6">{analytics.active_users}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Active Users
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CalendarIcon color="info" sx={{ mr: 2 }} />
                  <Box>
                    <Typography variant="h6">{analytics.new_users_today}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      New Today
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CalendarIcon color="warning" sx={{ mr: 2 }} />
                  <Box>
                    <Typography variant="h6">{analytics.new_users_this_week}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      New This Week
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters and Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Users</Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateUser}
          >
            Create User
          </Button>
        </Box>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search users..."
              value={searchTerm}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={roleFilter}
                label="Role"
                onChange={handleRoleFilterChange}
              >
                <MenuItem value="">All Roles</MenuItem>
                {userRoles.map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={handleStatusFilterChange}
              >
                <MenuItem value="">All Statuses</MenuItem>
                {userStatuses.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              fullWidth
              variant="outlined"
              onClick={() => {
                setSearchTerm('');
                setRoleFilter('');
                setStatusFilter('');
              }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Users Table */}
      <Paper>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 1000 }}>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell key={column.id}>
                    {column.sortable ? (
                      <TableSortLabel
                        active={orderBy === column.id}
                        direction={orderBy === column.id ? order : 'asc'}
                        onClick={() => handleRequestSort(column.id)}
                      >
                        {column.label}
                      </TableSortLabel>
                    ) : (
                      column.label
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      {user.username}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      {user.full_name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      {user.email || 'N/A'}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <PhoneIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      {user.phone || 'N/A'}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.role}
                      color={getRoleChipColor(user.role)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.status}
                      color={getStatusChipColor(user.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{formatDate(user.created_at)}</TableCell>
                  <TableCell>{formatDate(user.last_login)}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.order_count || 0}
                      variant="outlined"
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="More actions">
                      <IconButton
                        onClick={(event) => handleMenuClick(event, user)}
                        size="small"
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={totalUsers}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEditUser}>
          <EditIcon sx={{ mr: 1 }} />
          Edit User
        </MenuItem>
        <MenuItem onClick={handleDeleteUser}>
          <DeleteIcon sx={{ mr: 1 }} />
          Delete User
        </MenuItem>
      </Menu>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New User</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                value={formData.username}
                onChange={(e) => handleFormChange('username', e.target.value)}
                error={!!formErrors.username}
                helperText={formErrors.username}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => handleFormChange('email', e.target.value)}
                error={!!formErrors.email}
                helperText={formErrors.email}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone"
                value={formData.phone || ''}
                onChange={(e) => handleFormChange('phone', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                value={formData.first_name}
                onChange={(e) => handleFormChange('first_name', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Middle Name"
                value={formData.middle_name}
                onChange={(e) => handleFormChange('middle_name', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={formData.last_name}
                onChange={(e) => handleFormChange('last_name', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={formData.role}
                  label="Role"
                  onChange={(e) => handleFormChange('role', e.target.value)}
                >
                  {userRoles.map((role) => (
                    <MenuItem key={role} value={role}>
                      {role}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  label="Status"
                  onChange={(e) => handleFormChange('status', e.target.value)}
                >
                  {userStatuses.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitCreate}
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Username"
                value={formData.username}
                onChange={(e) => handleFormChange('username', e.target.value)}
                error={!!formErrors.username}
                helperText={formErrors.username}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) => handleFormChange('email', e.target.value)}
                error={!!formErrors.email}
                helperText={formErrors.email}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone"
                value={formData.phone || ''}
                onChange={(e) => handleFormChange('phone', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                value={formData.first_name}
                onChange={(e) => handleFormChange('first_name', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Middle Name"
                value={formData.middle_name}
                onChange={(e) => handleFormChange('middle_name', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={formData.last_name}
                onChange={(e) => handleFormChange('last_name', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={formData.role}
                  label="Role"
                  onChange={(e) => handleFormChange('role', e.target.value)}
                >
                  {userRoles.map((role) => (
                    <MenuItem key={role} value={role}>
                      {role}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  label="Status"
                  onChange={(e) => handleFormChange('status', e.target.value)}
                >
                  {userStatuses.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitEdit}
            disabled={submitting}
          >
            {submitting ? 'Updating...' : 'Update User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => { setDeleteDialogOpen(false); setUserToDelete(null); }}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete this user? This action cannot be undone and will remove all associated data.
          </Typography>
          {selectedUser && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2">User to be deleted:</Typography>
              <Typography><strong>Name:</strong> {selectedUser.full_name}</Typography>
              <Typography><strong>Email:</strong> {selectedUser.email}</Typography>
              <Typography><strong>Role:</strong> {selectedUser.role}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteDialogOpen(false); setUserToDelete(null); }} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={submitting}
          >
            {submitting ? 'Deleting...' : 'Delete User'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserListPage;
