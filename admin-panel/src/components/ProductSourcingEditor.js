import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, IconButton, FormControl, InputLabel, Select, MenuItem, Typography } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { regionService, orgService, relationshipService } from '../services/api';

const ProductSourcingEditor = ({ open, onClose, product }) => {
  const [regions, setRegions] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [rows, setRows] = useState([{ region_id: '', manufacturer_org_id: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const r = await regionService.getRegions();
      setRegions(r?.regions || []);
      const m = await orgService.getOrganizations('Manufacturer');
      setManufacturers(m?.organizations || []);
    };
    load();
  }, [open]);

  useEffect(() => {
    if (!open) setRows([{ region_id: '', manufacturer_org_id: '' }]);
  }, [open]);

  const addRow = () => setRows(prev => [...prev, { region_id: '', manufacturer_org_id: '' }]);
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) => setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const save = async () => {
    try {
      setSaving(true);
      const mappings = rows
        .filter(r => r.region_id && r.manufacturer_org_id)
        .map(r => ({ region_id: parseInt(r.region_id, 10), manufacturer_org_id: r.manufacturer_org_id }));
      await relationshipService.manageProductSourcing(product.id, mappings);
      onClose(true);
    } catch (e) {
      alert(e.message || 'Failed to save sourcing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Product Sourcing</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Map manufacturer organizations per region for product: {product?.title}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          {rows.map((row, idx) => (
            <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 1, alignItems: 'center' }}>
              <FormControl fullWidth size="small">
                <InputLabel>Region</InputLabel>
                <Select label="Region" value={row.region_id} onChange={(e) => updateRow(idx, { region_id: e.target.value })}>
                  {regions.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Manufacturer</InputLabel>
                <Select label="Manufacturer" value={row.manufacturer_org_id} onChange={(e) => updateRow(idx, { manufacturer_org_id: e.target.value })}>
                  {manufacturers.map(m => <MenuItem key={m.org_id} value={m.org_id}>{m.name}</MenuItem>)}
                </Select>
              </FormControl>
              <IconButton onClick={() => removeRow(idx)}><DeleteIcon /></IconButton>
            </Box>
          ))}
          <Button startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: 'start' }}>Add mapping</Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProductSourcingEditor;

