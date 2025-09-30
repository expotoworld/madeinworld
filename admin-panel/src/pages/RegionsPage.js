import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Card, CardContent, Table, TableHead, TableRow, TableCell, TableBody, Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { regionService } from '../services/api';

const RegionsPage = () => {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(false);


  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = async () => {
    try {
      setLoading(true);

      const data = await regionService.getRegions();
      setRegions(data?.regions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => { setEditing(null); setForm({ name: '', description: '' }); setOpen(true); };
  const startEdit = (r) => { setEditing(r); setForm({ name: r.name || '', description: r.description || '' }); setOpen(true); };

  const save = async () => {
    try {
      if (editing) {
        await regionService.updateRegion(editing.region_id, { name: form.name, description: form.description || null });
      } else {
        await regionService.createRegion({ name: form.name, description: form.description || null });
      }
      setOpen(false);
      await load();
    } catch (e) {
      alert(e.message || 'Save failed');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this region?')) return;
    try { await regionService.deleteRegion(id); await load(); } catch (e) { alert(e.message || 'Delete failed'); }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Regions</Typography>
          <Typography variant="body2" color="text.secondary">Manage store routing regions</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={startCreate}>New Region</Button>
      </Box>

      <Card>
        <CardContent sx={{ p: 0 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(regions || []).map((r) => (
                <TableRow key={r.region_id} hover>
                  <TableCell>{r.region_id}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.description || '-'}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => startEdit(r)} sx={{ mr: 1 }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => remove(r.region_id)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && (!regions || regions.length === 0) && (
                <TableRow><TableCell colSpan={4} align="center">No regions</TableCell></TableRow>
              )}
              {loading && (
                <TableRow><TableCell colSpan={4} align="center">Loading...</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Region' : 'Create Region'}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'grid', gap: 2 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
            <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RegionsPage;

