import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, IconButton, FormControl, InputLabel, Select, MenuItem, Typography } from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { orgService, relationshipService } from '../services/api';

const StorePartnersEditor = ({ open, onClose, store }) => {
  const [partners, setPartners] = useState([]);
  const [rows, setRows] = useState([{ partner_org_id: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const p = await orgService.getOrganizations('Partner');
      setPartners(p?.organizations || []);
    };
    load();
  }, [open]);

  useEffect(() => { if (!open) setRows([{ partner_org_id: '' }]); }, [open]);

  const addRow = () => setRows(prev => [...prev, { partner_org_id: '' }]);
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, patch) => setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const save = async () => {
    try {
      setSaving(true);
      const mappings = rows.filter(r => r.partner_org_id).map(r => ({ partner_org_id: r.partner_org_id }));
      await relationshipService.manageStorePartners(store.id, mappings);
      onClose(true);
    } catch (e) {
      alert(e.message || 'Failed to save partners');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => onClose(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Store Partners</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Assign partner organizations for store: {store?.name}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          {rows.map((row, idx) => (
            <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, alignItems: 'center' }}>
              <FormControl fullWidth size="small">
                <InputLabel>Partner</InputLabel>
                <Select label="Partner" value={row.partner_org_id} onChange={(e) => updateRow(idx, { partner_org_id: e.target.value })}>
                  {partners.map(p => <MenuItem key={p.org_id} value={p.org_id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
              <IconButton onClick={() => removeRow(idx)}><DeleteIcon /></IconButton>
            </Box>
          ))}
          <Button startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: 'start' }}>Add Partner</Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};

export default StorePartnersEditor;

