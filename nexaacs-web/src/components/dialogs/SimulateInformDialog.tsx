import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAcsStore } from '../../stores/acsStore';
import type { TechnologyType } from '../../types';
import { formatZodError, simulateInformSchema } from '../../validation/schemas';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SimulateInformDialog({ open, onClose }: Props) {
  const navigate = useNavigate();
  const simulateOntInform = useAcsStore((s) => s.simulateOntInform);

  const [serial, setSerial] = useState('ZTEG9910SIM1');
  const [manufacturer, setManufacturer] = useState('ZTE');
  const [model, setModel] = useState('ZXHN F670L');
  const [productClass, setProductClass] = useState('F670L');
  const [technology, setTechnology] = useState<TechnologyType>('GPON');
  const [formError, setFormError] = useState('');

  const handleSubmit = () => {
    setFormError('');
    const parsed = simulateInformSchema.safeParse({
      serial,
      manufacturer,
      model,
      productClass,
      technology,
    });
    if (!parsed.success) {
      setFormError(formatZodError(parsed.error));
      return;
    }
    const id = simulateOntInform(
      parsed.data.serial,
      parsed.data.manufacturer,
      parsed.data.model,
      parsed.data.productClass,
      parsed.data.technology,
    );
    onClose();
    navigate(`/devices/${id}`);
  };

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
        onClose();
      }}
      disableEscapeKeyDown
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Simulate CWMP ONT Inform</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Simulates a physical CPE/ONT sending a TR-069 <code>Inform</code> SOAP request to the ACS CWMP endpoint, enrolling or updating the device record.
        </Typography>
        <Stack spacing={2}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField
            label="Serial Number"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            select
            label="Manufacturer"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            size="small"
            fullWidth
          >
            {['ZTE', 'Huawei', 'Fiberhome', 'Nokia', 'VSOL', 'TP-Link', 'D-Link', 'Raisecom'].map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Model Name" value={model} onChange={(e) => setModel(e.target.value)} size="small" fullWidth />
          <TextField label="Product Class" value={productClass} onChange={(e) => setProductClass(e.target.value)} size="small" fullWidth />
          <TextField
            select
            label="Technology"
            value={technology}
            onChange={(e) => setTechnology(e.target.value as TechnologyType)}
            size="small"
            fullWidth
          >
            {(['GPON', 'EPON', 'Router', 'N/A'] as TechnologyType[]).map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit}>
          Send CWMP Inform
        </Button>
      </DialogActions>
    </Dialog>
  );
}
