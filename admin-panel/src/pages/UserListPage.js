import { useState, useEffect } from 'react';
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
  const userRoles = ['Customer', 'Admin', 'Manufacturer', '3PL', 'Partner', 'Author'];
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


  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, orderBy, order, roleFilter, statusFilter]);

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleRoleFilterChange = (event) => {
    setRoleFilter(event.target.value);
  };

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
  };

  const handleMenuClick = (event, user) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const [editFormData, setEditFormData] = useState({});

  const openEditDialog = (user) => {
    setEditFormData({ ...user });
    setEditDialogOpen(true);
  };

  const handleEditFormChange = (field, value) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.username || formData.username.length < 3) errors.username = 'Username must be at least 3 characters';
    if (!formData.email) errors.email = 'Email is required';
    if (!formData.role) errors.role = 'Role is required';
    if (!formData.status) errors.status = 'Status is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      await userService.createUser(formData);
      showToast('User created successfully', 'success');
      setCreateDialogOpen(false);
      setFormData({ username: '', email: '', first_name: '', middle_name: '', last_name: '', role: 'Customer', status: 'active' });
      fetchUsers();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to create user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editFormData.id) return;
    setSubmitting(true);
    try {
      await userService.updateUser(editFormData.id, { role: editFormData.role, status: editFormData.status, email: editFormData.email, phone: editFormData.phone });
      showToast('User updated successfully', 'success');
      setEditDialogOpen(false);
      fetchUsers();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to update user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = (userId) => {
    setUserToDelete(userId);
    setDeleteDialogOpen(true);
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
      'Author': 'info',
    };
    return colors[role] || 'default';
  };

  const getStatusChipColor = (status) => {
    const colors = {
      'active': 'success',
      'deactivated': 'default',
    };
    return colors[status] || 'default';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>
        Users
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={3}>
            <TextField
              label="Search"
              value={searchTerm}
              onChange={handleSearchChange}
              fullWidth
              InputProps={{ endAdornment: <SearchIcon /> }}
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
        </Grid>
      </Paper>

      {/* Status indicators */}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {loading && <Typography variant="body2" sx={{ mt: 1 }}>Loading...</Typography>}


      {/* User list */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sortDirection={orderBy === 'created_at' ? order : false}>
                  <TableSortLabel
                    active={orderBy === 'created_at'}
                    direction={orderBy === 'created_at' ? order : 'asc'}
                    onClick={() => handleRequestSort('created_at')}
                  >
                    Created
                  </TableSortLabel>
                </TableCell>
                <TableCell>Last Login</TableCell>
                <TableCell>Orders</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <PersonIcon fontSize="small" />
                      <Typography>{user.full_name || user.username}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <EmailIcon fontSize="small" />
                      <Typography>{user.email || '-'}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={1}>
                      <PhoneIcon fontSize="small" />
                      <Typography>{user.phone || '-'}</Typography>
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
      </Paper>


        <TablePagination
          component="div"
          count={totalUsers}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 20, 50]}
        />

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={() => { if (selectedUser) openEditDialog(selectedUser); handleMenuClose(); }}>
            <EditIcon fontSize="small" style={{ marginRight: 8 }} /> Edit
          </MenuItem>
          <MenuItem onClick={() => { if (selectedUser) handleDeleteUser(selectedUser.id); handleMenuClose(); }}>
            <DeleteIcon fontSize="small" style={{ marginRight: 8 }} /> Delete
          </MenuItem>
        </Menu>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create User</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Username" fullWidth value={formData.username} onChange={(e) => handleFormChange('username', e.target.value)} error={!!formErrors.username} helperText={formErrors.username} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Email" fullWidth value={formData.email} onChange={(e) => handleFormChange('email', e.target.value)} error={!!formErrors.email} helperText={formErrors.email} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="First Name" fullWidth value={formData.first_name} onChange={(e) => handleFormChange('first_name', e.target.value)} error={!!formErrors.first_name} helperText={formErrors.first_name} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Middle Name" fullWidth value={formData.middle_name} onChange={(e) => handleFormChange('middle_name', e.target.value)} error={!!formErrors.middle_name} helperText={formErrors.middle_name} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Last Name" fullWidth value={formData.last_name} onChange={(e) => handleFormChange('last_name', e.target.value)} error={!!formErrors.last_name} helperText={formErrors.last_name} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Phone" type="tel" fullWidth value={formData.phone || ''} onChange={(e) => handleFormChange('phone', e.target.value)} error={!!formErrors.phone} helperText={formErrors.phone} />
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
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateUser} disabled={submitting}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField label="Email" fullWidth value={editFormData.email || ''} onChange={(e) => handleEditFormChange('email', e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Phone" fullWidth value={editFormData.phone || ''} onChange={(e) => handleEditFormChange('phone', e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select value={editFormData.role || ''} label="Role" onChange={(e) => handleEditFormChange('role', e.target.value)}>
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
                <Select value={editFormData.status || ''} label="Status" onChange={(e) => handleEditFormChange('status', e.target.value)}>
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
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateUser} disabled={submitting}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this user? This action cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDelete} disabled={submitting}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button to Create User */}
      <Box position="fixed" bottom={24} right={24}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
          Create User
        </Button>
      </Box>
    </Box>
  );
};

export default UserListPage;
