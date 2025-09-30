import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, IconButton, FormControl, InputLabel, Select, MenuItem, Typography } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { orgService, relationshipService } from '../services/api';

const ProductLogisticsEditor = ({ open, onClose, product }) => {
  const [tpls, setTpls] = useState([]);
  const [rows, setRows] = useState([{ tpl_org_id: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const l = await orgService.getOrganizations('3PL');
      setTpls(l?.organizations || []);
    };
    load();
  }, [open]);

  useEffect(() => { if (!open) setRows([{ tpl_org_id: '' }]); }, [open]);

  const addRow = () => setRows(prev => [...prev, { tpl_org_id: '' }]);
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) => setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const save = async () => {
    try {
      setSaving(true);
      const mappings = rows.filter(r => r.tpl_org_id).map(r => ({ tpl_org_id: r.tpl_org_id }));
      await relationshipService.manageProductLogistics(product.id, mappings);
      onClose(true);
    } catch (e) {
      alert(e.message || 'Failed to save logistics');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Product Logistics (3PL)</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Assign 3PL organizations for product: {product?.title}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          {rows.map((row, idx) => (
            <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, alignItems: 'center' }}>
              <FormControl fullWidth size="small">
                <InputLabel>3PL</InputLabel>
                <Select label="3PL" value={row.tpl_org_id} onChange={(e) => updateRow(idx, { tpl_org_id: e.target.value })}>
                  {tpls.map(t => <MenuItem key={t.org_id} value={t.org_id}>{t.name}</MenuItem>)}
                </Select>
              </FormControl>
              <IconButton onClick={() => removeRow(idx)}><DeleteIcon /></IconButton>
            </Box>
          ))}
          <Button startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: 'start' }}>Add 3PL</Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProductLogisticsEditor;

