import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableRow, TableCell, TableBody,
  FormControl, InputLabel, Select, MenuItem, Chip, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, IconButton, Tooltip, Stack, FormHelperText,
  Autocomplete, CircularProgress, Checkbox, Collapse
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Add as AddIcon, People as PeopleIcon } from '@mui/icons-material';
import { orgService, userService } from '../services/api';

const orgTypeOptions = [
  { value: '', label: 'All' },
  { value: 'Manufacturer', label: 'Manufacturer' },
  { value: '3PL', label: '3PL' },
  { value: 'Partner', label: 'Partner' },
  { value: 'Brand', label: 'Brand' },
];

const emptyForm = (defaultType = '') => ({
  org_type: defaultType || '',
  name: '',
  parent_org_id: '',
  contact_email: '',
  contact_phone: '',
  contact_address: '',
});

const OrganizationsPage = () => {
  const [orgType, setOrgType] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // org or null
  const [form, setForm] = useState(emptyForm(''));
  const [errors, setErrors] = useState({});
  const [brandOptions, setBrandOptions] = useState([]);

  // User assignment state
  const [selectedUsers, setSelectedUsers] = useState([]); // [{ id, label, email, role }]
  const [userOptions, setUserOptions] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [loadingUserOptions, setLoadingUserOptions] = useState(false);

  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [usersDialogOrg, setUsersDialogOrg] = useState(null);
  const [usersDialogUsers, setUsersDialogUsers] = useState([]);

  const mapOrgTypeToUserRole = (t) => {
    if (t === 'Manufacturer') return 'Manufacturer';
    if (t === '3PL') return '3PL';
    if (t === 'Partner') return 'Partner';
    return null;
  };

  // Inline editor states
  const [expandedOrgId, setExpandedOrgId] = useState(null);
  const [inlineUsersByOrg, setInlineUsersByOrg] = useState({}); // { [orgId]: [{id,label,email,role,orgRole}] }
  const [inlineLoading, setInlineLoading] = useState(false);
  const [inlineSearch, setInlineSearch] = useState('');
  const [inlineUserOptions, setInlineUserOptions] = useState([]);
  const [inlineLoadingOptions, setInlineLoadingOptions] = useState(false);

  // Pagination for modal user search
  const [userPage, setUserPage] = useState(1);


  // Inline options loader (for inline editor below the table)
  const loadMoreInline = useCallback(async (org) => {
    const role = mapOrgTypeToUserRole(org.org_type);
    if (!role) return;
    try {
      setInlineLoadingOptions(true);
      const res = await userService.getUsers({ role, search: inlineSearch, limit: 20, page: 1 });
      const opts = (res?.users || []).map(u => ({ id: u.id, label: `${u.full_name || u.username}${u.email ? ' ('+u.email+')' : ''}`, email: u.email, role: u.role }));
      setInlineUserOptions(opts);
    } catch (e) { console.error(e); setInlineUserOptions([]); }
    finally { setInlineLoadingOptions(false); }
  }, [inlineSearch]);

  useEffect(() => {
    if (!expandedOrgId) return;
    const currentOrg = (orgs || []).find(x => x.org_id === expandedOrgId);
    if (!currentOrg) return;
    loadMoreInline(currentOrg);
  }, [expandedOrgId, inlineSearch, loadMoreInline, orgs]);


  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await orgService.getOrganizations(orgType || null);
      setOrgs(data?.organizations || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [orgType]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(orgType));
    setErrors({});
    setSelectedUsers([]);
    setOpen(true);
  };

  // Load options when type or search changes (debounced) with pagination
  useEffect(() => {
    if (!open) return;
    const role = mapOrgTypeToUserRole(form.org_type);
    if (!role) { setUserOptions([]); return; }
    setLoadingUserOptions(true);
    const h = setTimeout(async () => {
      try {
        const res = await userService.getUsers({ role, search: userSearch, limit: 20, page: userPage, sort: 'full_name', order: 'asc' });
        const pageOpts = (res?.users || []).map(u => ({ id: u.id, label: `${u.full_name || u.username}${u.email ? ' ('+u.email+')' : ''}`, email: u.email, role: u.role }));
        setUserOptions(prev => userPage === 1 ? pageOpts : [...prev.filter(o => !o.loadMore), ...pageOpts.filter(o1 => !prev.some(p => p.id === o1.id))]);
        if ((res?.users || []).length === 20) {
          setUserOptions(prev => [...prev.filter(o => !o.loadMore), { id: '__load_more', label: 'Load more...', loadMore: true }]);
        }
      } catch (e) { console.error('Failed to fetch users', e); if (userPage === 1) setUserOptions([]); }
      finally { setLoadingUserOptions(false); }
    }, 300);
    return () => clearTimeout(h);
  }, [open, form.org_type, userSearch, userPage]);
  // Reset page on type or search change
  useEffect(() => { setUserPage(1); }, [form.org_type, userSearch, open]);

  // Load parent options when needed (Manufacturers/3PL/Partners choose a Brand parent)
  useEffect(() => {
    const loadParents = async () => {
      if (!open) return;
      if (!form.org_type || form.org_type === 'Brand') return;
      try {
        const res = await orgService.getOrganizations('Brand');
        setBrandOptions(res?.organizations || []);
      } catch (e) {
        console.error('Failed to load brands', e);
        setBrandOptions([]);
      }
    };
    loadParents();
  }, [open, form.org_type]);


  const openEdit = async (o) => {
    setEditing(o);
    setForm({
      org_type: o.org_type || '',
      name: o.name || '',
      parent_org_id: o.parent_org_id || '',
      contact_email: o.contact_email || '',
      contact_phone: o.contact_phone || '',
      contact_address: o.contact_address || '',
    });
    setErrors({});
    // Preload assigned users for this org
    try {
      const res = await orgService.getOrganizationUsers(o.org_id);
      const items = (res?.users || []).map(u => ({ id: u.user_id, label: `${u.full_name || 'Unnamed'}${u.email ? ' ('+u.email+')' : ''}`, email: u.email, role: u.role, orgRole: u.org_role }));
      setSelectedUsers(items);
    } catch (e) { console.error('Failed to load org users', e); setSelectedUsers([]); }
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        org_type: form.org_type,
        name: form.name.trim(),
        parent_org_id: form.parent_org_id || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        contact_address: form.contact_address || null,
      };

      // Frontend validation
      const nextErrors = {};
      if (!payload.org_type) nextErrors.org_type = 'Type is required';
      if (!payload.name) nextErrors.name = 'Name is required';
      if (payload.org_type === 'Manufacturer' || payload.org_type === '3PL') {
        if (!payload.parent_org_id) nextErrors.parent_org_id = 'Parent Brand is required for Manufacturer and 3PL';
      }
      if (payload.org_type === 'Brand') {
        if (payload.parent_org_id) nextErrors.parent_org_id = 'Brand organizations cannot have a parent';
      }
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;

      let newOrgId = editing?.org_id || null;
      if (editing) {
        await orgService.updateOrganization(editing.org_id, payload);
      } else {
        const created = await orgService.createOrganization(payload);
        newOrgId = created?.org_id || null;
      }
      // Save user assignments (role-restricted). Skip for Brand or when no org id.
      const targetOrgId = editing ? editing.org_id : newOrgId;
      if (targetOrgId && form.org_type !== 'Brand') {
        const assignments = selectedUsers.map(u => ({ user_id: u.id, org_role: u.orgRole || 'Manager' }));
        await orgService.setOrganizationUsers(targetOrgId, assignments);
      }
      setOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      // Surface backend messages politely
      alert(e?.response?.data?.error || e.message || 'Failed to save organization');
    }
  };


  const handleDelete = async (o) => {
    if (!window.confirm(`Delete organization "${o.name}"? This cannot be undone.`)) return;
    try {
      await orgService.deleteOrganization(o.org_id);
      await load();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to delete organization');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Organizations</Typography>
          <Typography variant="body2" color="text.secondary">Unified organizations across manufacturers, 3PLs, partners, and brands</Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControl sx={{ minWidth: 200 }} size="small">
            <InputLabel>Type</InputLabel>
            <Select label="Type" value={orgType} onChange={(e) => setOrgType(e.target.value)}>
              {orgTypeOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add Organization</Button>
        </Stack>
      </Box>

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Org ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Parent</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(orgs || []).map((o) => (
                <TableRow key={o.org_id} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{o.org_id}</TableCell>
                  <TableCell>{o.name}</TableCell>

	                {/* Inline collapsible editor */}
	                {expandedOrgId === o.org_id && (
	                  <TableRow>
	                    <TableCell colSpan={5} sx={{ bgcolor: 'action.hover' }}>
	                      <Collapse in={expandedOrgId === o.org_id} timeout="auto" unmountOnExit>
	                        <Box sx={{ p: 2 }}>
	                          {o.org_type === 'Brand' ? (
	                            <Typography variant="body2" color="text.secondary">Brand organizations cannot have users assigned.</Typography>
	                          ) : (
	                            <Stack spacing={1}>
	                              {(inlineUsersByOrg[o.org_id] || []).map((u) => (
	                                <Box key={u.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
	                                  <Chip label={u.label} />
	                                  <FormControl size="small" sx={{ minWidth: 140 }}>
	                                    <InputLabel>Org Role</InputLabel>
	                                    <Select
	                                      label="Org Role"
	                                      value={u.orgRole || 'Manager'}
	                                      onChange={(e) => {
	                                        const val = e.target.value;
	                                        setInlineUsersByOrg(prev => ({
	                                          ...prev,
	                                          [o.org_id]: (prev[o.org_id] || []).map(x => x.id === u.id ? { ...x, orgRole: val } : x)
	                                        }));
	                                      }}
	                                    >
	                                      <MenuItem value="Owner">Owner</MenuItem>
	                                      <MenuItem value="Manager">Manager</MenuItem>
	                                      <MenuItem value="Staff">Staff</MenuItem>
	                                    </Select>
	                                  </FormControl>
	                                  <Button size="small" color="error" onClick={() => setInlineUsersByOrg(prev => ({ ...prev, [o.org_id]: (prev[o.org_id] || []).filter(x => x.id !== u.id) }))}>Remove</Button>
	                                </Box>
	                              ))}
	                              <Autocomplete
	                                size="small"
	                                options={inlineUserOptions}
	                                loading={inlineLoadingOptions}
	                                onInputChange={(e, v) => {
	                                  setInlineSearch(v);
	                                }}
	                                onChange={(e, val) => {
	                                  if (!val || val.loadMore) return;
	                                  setInlineUsersByOrg(prev => ({ ...prev, [o.org_id]: [ ...(prev[o.org_id] || []), { ...val, orgRole: 'Manager' } ] }));
	                                }}
	                                getOptionLabel={(opt) => opt.label || ''}
	                                renderInput={(params) => (
	                                  <TextField {...params} label={`Add ${mapOrgTypeToUserRole(o.org_type)} user`} placeholder="Search users" />
	                                )}
	                                renderOption={(props, option) => (
	                                  <li {...props} key={option.id} onMouseDown={(e) => {
	                                    if (option.loadMore) { e.preventDefault(); e.stopPropagation(); loadMoreInline(o); }
	                                  }}>
	                                    <Typography variant="body2">{option.label}</Typography>
	                                  </li>
	                                )}
	                              />
	                              <Stack direction="row" spacing={1}>
	                                <Button variant="outlined" onClick={() => setExpandedOrgId(null)}>Close</Button>
	                                <Button variant="contained" disabled={inlineLoading} onClick={async () => {
	                                  try {
	                                    setInlineLoading(true);
	                                    const assignments = (inlineUsersByOrg[o.org_id] || []).map(u => ({ user_id: u.id, org_role: u.orgRole || 'Manager' }));
	                                    await orgService.setOrganizationUsers(o.org_id, assignments);
	                                  } catch (e) { console.error(e); alert(e?.response?.data?.error || 'Failed to save users'); }
	                                  finally { setInlineLoading(false); }
	                                }}>Save</Button>
	                              </Stack>
	                            </Stack>
	                          )}
	                        </Box>



	                      </Collapse>
	                    </TableCell>
	                  </TableRow>
	                )}


                  <TableCell>
                    <Chip size="small" label={o.org_type} />
                  </TableCell>
                  <TableCell>{o.parent_org_name || '-'}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="View Users">
                      <IconButton size="small" onClick={async () => { try { const res = await orgService.getOrganizationUsers(o.org_id); setUsersDialogUsers(res?.users || []); setUsersDialogOrg(o); setUsersDialogOpen(true);} catch(e){ console.error(e);} }}>
                        <PeopleIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEdit(o)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => handleDelete(o)}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && (!orgs || orgs.length === 0) && (
                <TableRow><TableCell colSpan={5} align="center">No organizations</TableCell></TableRow>
              )}
              {loading && (
                <TableRow><TableCell colSpan={5} align="center">Loading...</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Organization' : 'Add Organization'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={form.org_type}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setForm({ ...form, org_type: nextType, parent_org_id: nextType === 'Brand' ? '' : form.parent_org_id });
                  if (nextType === 'Brand') setSelectedUsers([]);
                  setErrors({});
                }}
              >
                {orgTypeOptions.filter(o => o.value !== '').map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              fullWidth
            />
            {form.org_type && form.org_type !== 'Brand' ? (
              <FormControl fullWidth size="small" error={Boolean(errors.parent_org_id)}>
                <InputLabel>Parent Brand</InputLabel>
                <Select
                  label="Parent Brand"
                  value={form.parent_org_id || ''}
                  onChange={(e) => {
                    setForm({ ...form, parent_org_id: e.target.value });
                    if (errors.parent_org_id) setErrors({ ...errors, parent_org_id: undefined });
                  }}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {brandOptions.map((b) => (
                    <MenuItem key={b.org_id} value={b.org_id}>{b.name}</MenuItem>
                  ))}
                </Select>
                {errors.parent_org_id && (
                  <FormHelperText>{errors.parent_org_id}</FormHelperText>
                )}
              </FormControl>
            ) : (
              null
            )}
            <TextField
              size="small"
              label="Contact Email (optional)"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Contact Phone (optional)"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Contact Address (optional)"
              value={form.contact_address}
              onChange={(e) => setForm({ ...form, contact_address: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
            {/* User assignment (after contact fields) */}
            {form.org_type && form.org_type !== 'Brand' ? (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Assign Users</Typography>
                <Autocomplete
                  multiple
                  options={userOptions}
                  value={selectedUsers}
                  onChange={(e, val) => setSelectedUsers(val)}
                  filterSelectedOptions
                  disableCloseOnSelect
                  getOptionLabel={(o) => o.label || ''}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      label={`Select ${mapOrgTypeToUserRole(form.org_type)} users`}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search users by name or email"
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {loadingUserOptions ? <CircularProgress size={18} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  renderOption={(props, option, { selected }) => {
                    if (option.loadMore) {
                      return (
                        <li
                          {...props}
                          key={option.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setUserPage((p) => p + 1);
                          }}
                        >
                          <Typography variant="body2" color="primary">{option.label}</Typography>
                        </li>
                      );
                    }
                    return (
                      <li {...props} key={option.id}>
                        <Checkbox style={{ marginRight: 8 }} checked={selected} />
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Typography variant="body2">{option.label}</Typography>
                          <Typography variant="caption" color="text.secondary">Role: {option.role}</Typography>
                        </Box>
                      </li>
                    );
                  }}
                />

                {/* Selected users with per-user org role selection */}
                {selectedUsers.length > 0 && (
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {selectedUsers.map((u) => (
                      <Box key={u.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={u.label} />
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                          <InputLabel>Org Role</InputLabel>
                          <Select
                            label="Org Role"
                            value={u.orgRole || 'Manager'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, orgRole: val } : x)));
                            }}
                          >
                            <MenuItem value="Owner">Owner</MenuItem>
                            <MenuItem value="Manager">Manager</MenuItem>
                            <MenuItem value="Staff">Staff</MenuItem>
                          </Select>
                        </FormControl>
                        <Button size="small" color="error" onClick={() => setSelectedUsers((prev) => prev.filter((x) => x.id !== u.id))}>Remove</Button>
                      </Box>
                    ))}
                  </Stack>
                )}

              </Box>
            ) : (
              <FormHelperText>Brand organizations cannot have users assigned.</FormHelperText>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>{editing ? 'Save Changes' : 'Create'}</Button>
        </DialogActions>
      </Dialog>

      {/* Users dialog */}
      <Dialog open={usersDialogOpen} onClose={() => setUsersDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Users in {usersDialogOrg?.name}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            {(usersDialogUsers || []).length === 0 && (
              <Typography variant="body2" color="text.secondary">No users assigned.</Typography>
            )}
            {(usersDialogUsers || []).map((u) => (
              <Box key={u.user_id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{u.full_name || 'Unnamed'}</Typography>
                  <Typography variant="caption" color="text.secondary">{u.email || 'No email'} • {u.role}</Typography>
                </Box>
                <Chip size="small" label={u.org_role} />
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUsersDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default OrganizationsPage;

