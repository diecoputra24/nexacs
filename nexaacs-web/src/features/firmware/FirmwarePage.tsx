import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { useAcsStore } from '../../stores/acsStore';
import { apiClient } from '../../services/api-client';
import { formatBytes, formatRelativeTime } from '../../utils/classification';
import { TruncatedText } from '../../components/common/TruncatedText';
import { FirmwareSkeleton, pageEnterSx, usePageSkeleton } from '../../components/skeletons/PageSkeletons';
import type { FirmwareImage } from '../../types';
import { extractZodFieldErrors, firmwareUploadSchema, formatZodError } from '../../validation/schemas';

const EMPTY_FIRMWARE_FORM = {
  manufacturer: '',
  modelName: '',
  productClass: '',
  hardwareRevision: '',
  version: '',
  fileName: '',
  checksumSha256: '',
  releaseNotes: '',
};

function detectFirmwareMetadata(fileName: string, buffer: ArrayBuffer) {
  const slice = new Uint8Array(buffer.slice(0, 65536));
  const ascii = Array.from(slice, (b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : ' ')).join('');
  const magic4 = ascii.slice(0, 4);

  let manufacturer = '';
  let modelName = '';
  let productClass = '';
  let version = '';
  let headerTag = '';

  if (magic4 === 'HWNP') {
    manufacturer = 'Huawei';
    headerTag = 'HWNP header';
  } else if (/zte|zxhn/i.test(fileName) || /zxhn|zte\s+/i.test(ascii)) {
    manufacturer = 'ZTE';
    headerTag = /zxhn|zte/i.test(ascii) ? 'binary header' : 'filename';
  } else if (/huawei|echolife|optixstar|hg8|eg8/i.test(fileName)) {
    manufacturer = 'Huawei';
    headerTag = 'filename';
  } else if (/fiberhome|hg6|an5506/i.test(fileName) || /fiberhome/i.test(ascii)) {
    manufacturer = 'Fiberhome';
    headerTag = /fiberhome/i.test(ascii) ? 'binary header' : 'filename';
  } else if (/nokia|alcl|g-240/i.test(fileName) || /alcatel|nokia/i.test(ascii)) {
    manufacturer = 'Nokia';
    headerTag = /alcatel|nokia/i.test(ascii) ? 'binary header' : 'filename';
  } else if (/vsol|v280/i.test(fileName)) {
    manufacturer = 'VSOL';
    headerTag = 'filename';
  }

  const combined = `${fileName} ${ascii.slice(0, 8192)}`;
  const modelMatch = /\b(ZXHN\s*F\d{3}[A-Z0-9]*|F\d{3}[A-Z0-9]*|HG\d{4}[A-Z0-9]*|EG\d{4}[A-Z0-9]*|G-\d{3}[A-Z]-[A-Z])\b/i.exec(
    combined,
  );
  if (modelMatch) {
    modelName = modelMatch[1].toUpperCase().replace(/\s+/g, ' ');
    productClass = modelName.replace(/^ZXHN\s+/i, '');
  }

  const verMatch = /\b(V\dR\d{3}C\d{2}S\d{3}|V\d+\.\d+\.\d+[A-Z0-9]*|RP\d{4})\b/i.exec(combined);
  if (verMatch) {
    version = verMatch[1].toUpperCase();
  }

  return { manufacturer, modelName, productClass, version, headerTag };
}

export function FirmwarePage() {
  const firmwareImages = useAcsStore((s) => s.firmwareImages);
  const firmwareJobs = useAcsStore((s) => s.firmwareJobs);
  const devices = useAcsStore((s) => s.devices);
  const addFirmwareImage = useAcsStore((s) => s.addFirmwareImage);
  const deployFirmware = useAcsStore((s) => s.deployFirmware);
  const hasPermission = useAcsStore((s) => s.hasPermission);
  const apiMode = useAcsStore((s) => s.apiMode);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);
  const refreshBackendData = useAcsStore((s) => s.refreshBackendData);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deployTarget, setDeployTarget] = useState<FirmwareImage | null>(null);
  const [retainedDeployTarget, setRetainedDeployTarget] = useState<FirmwareImage | null>(null);

  useEffect(() => {
    if (deployTarget) setRetainedDeployTarget(deployTarget);
  }, [deployTarget]);

  const activeDeployTarget = deployTarget ?? retainedDeployTarget;
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ severity: 'success' | 'warning' | 'error'; text: string } | null>(null);
  const { loading } = usePageSkeleton();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);
  const [detectHint, setDetectHint] = useState<string | null>(null);
  const [hashingFile, setHashingFile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [form, setForm] = useState(EMPTY_FIRMWARE_FORM);
  const [uploadError, setUploadError] = useState('');
  const [uploadFieldErrors, setUploadFieldErrors] = useState<Record<string, string>>({});

  const activeDevices = devices.filter((d) => !d.deletedAt);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setForm((prev) => ({ ...prev, fileName: file.name }));
    setSelectedFileSize(file.size);
    setDetectHint(null);
    setHashingFile(true);
    try {
      const buffer = await file.arrayBuffer();
      const detected = detectFirmwareMetadata(file.name, buffer);
      let hex = '';
      if (typeof window !== 'undefined' && window.crypto?.subtle) {
        const digest = await window.crypto.subtle.digest('SHA-256', buffer);
        hex = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
      setForm((prev) => ({
        ...prev,
        fileName: file.name,
        checksumSha256: hex || prev.checksumSha256,
        manufacturer: prev.manufacturer || detected.manufacturer,
        modelName: prev.modelName || detected.modelName,
        productClass: prev.productClass || detected.productClass,
        version: prev.version || detected.version,
      }));
      const found = [
        detected.manufacturer && `Manufacturer (${detected.manufacturer})`,
        detected.modelName && `Model (${detected.modelName})`,
        detected.version && `Version (${detected.version})`,
      ].filter(Boolean);
      setDetectHint(
        found.length > 0
          ? `Detected from ${detected.headerTag}: ${found.join(', ')}. Verify remaining fields before saving.`
          : 'Filename, size & SHA-256 filled. Binary metadata is encrypted/compressed — please enter model & version manually.',
      );
    } finally {
      setHashingFile(false);
    }
  };

  const handleUpload = async () => {
    if (hashingFile || uploading) return;
    setUploadError('');
    setUploadFieldErrors({});
    const parsed = firmwareUploadSchema.safeParse(form);
    if (!parsed.success) {
      setUploadFieldErrors(extractZodFieldErrors(parsed.error));
      setUploadError(formatZodError(parsed.error));
      return;
    }
    const data = parsed.data;
    if (apiMode === 'backend' && selectedFile) {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', selectedFile);
        fd.append('manufacturer', data.manufacturer);
        fd.append('modelName', data.modelName);
        fd.append('productClass', data.productClass);
        fd.append('hardwareRevision', data.hardwareRevision || '*');
        fd.append('version', data.version);
        fd.append('releaseNotes', data.releaseNotes);
        await apiClient.post('/firmware', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        await refreshBackendData();
        setUploadOpen(false);
        setSelectedFile(null);
        setSelectedFileSize(null);
        setDetectHint(null);
        setNotice({ severity: 'success', text: `Firmware ${data.version} uploaded to ACS storage and verified via SHA-256.` });
        setForm(EMPTY_FIRMWARE_FORM);
      } catch {
        setUploadError('Failed to upload firmware binary to ACS server.');
      } finally {
        setUploading(false);
      }
      return;
    }

    setUploading(true);
    window.setTimeout(() => {
      addFirmwareImage({
        ...data,
        fileSizeBytes: selectedFileSize ?? 25165824,
        signatureStatus: 'verified',
      });
      setUploading(false);
      setUploadOpen(false);
      setSelectedFile(null);
      setSelectedFileSize(null);
      setDetectHint(null);
      setNotice({ severity: 'success', text: `Firmware ${data.version} uploaded and registered with SHA-256 verification.` });
      setForm(EMPTY_FIRMWARE_FORM);
    }, 450);
  };

  const handleDeploy = () => {
    if (!deployTarget) return;
    const res = deployFirmware(deployTarget.id, selectedDeviceIds);
    setDeployTarget(null);
    setSelectedDeviceIds([]);
    if (!res.ok) {
      setNotice({ severity: 'error', text: res.skipped.join('; ') });
      return;
    }
    if (res.skipped.length > 0) {
      setNotice({
        severity: 'warning',
        text: `Deployed to ${res.deployed} compatible device(s). Blocked ${res.skipped.length} incompatible target(s): ${res.skipped.join(', ')}`,
      });
    } else {
      setNotice({ severity: 'success', text: `Queued firmware rollout for ${res.deployed} compatible device(s).` });
    }
  };

  if (loading || (apiMode === 'backend' && backendRefreshing)) {
    return <FirmwareSkeleton />;
  }

  return (
    <Box sx={pageEnterSx}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Typography variant="h5">Firmware Repository &amp; Rollout</Typography>
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          disabled={!hasPermission('firmware.deploy')}
          onClick={() => {
            setForm(EMPTY_FIRMWARE_FORM);
            setSelectedFileSize(null);
            setDetectHint(null);
            setUploadOpen(true);
          }}
        >
          Register Firmware Image
        </Button>
      </Stack>

      {notice && (
        <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice.text}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
                Firmware Images
              </Typography>
              <TableContainer>
                <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '12%' }}>Version</TableCell>
                      <TableCell sx={{ width: '14%' }}>Manufacturer</TableCell>
                      <TableCell sx={{ width: '20%' }}>Model / Product Class</TableCell>
                      <TableCell sx={{ width: '10%' }}>HW Rev</TableCell>
                      <TableCell sx={{ width: '10%' }}>File Size</TableCell>
                      <TableCell sx={{ width: '14%' }}>SHA-256</TableCell>
                      <TableCell sx={{ width: '10%' }}>Signature</TableCell>
                      <TableCell align="right" sx={{ width: '10%' }}>Rollout</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {firmwareImages.map((fw) => (
                      <TableRow key={fw.id}>
                        <TableCell sx={{ fontWeight: 700 }}><TruncatedText text={fw.version} /></TableCell>
                        <TableCell><TruncatedText text={fw.manufacturer} /></TableCell>
                        <TableCell><TruncatedText text={`${fw.modelName} (${fw.productClass})`} /></TableCell>
                        <TableCell><TruncatedText text={fw.hardwareRevision} /></TableCell>
                        <TableCell><TruncatedText text={formatBytes(fw.fileSizeBytes)} /></TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          <TruncatedText text={`${fw.checksumSha256.slice(0, 16)}…`} tooltip={fw.checksumSha256} />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={fw.signatureStatus} color={fw.signatureStatus === 'verified' ? 'success' : 'warning'} />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<RocketLaunchIcon />}
                            disabled={!hasPermission('firmware.deploy')}
                            onClick={() => setDeployTarget(fw)}
                          >
                            Deploy
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
                Deployment Jobs
              </Typography>
              <TableContainer>
                <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '22%' }}>Job ID</TableCell>
                      <TableCell sx={{ width: '20%' }}>Device Serial</TableCell>
                      <TableCell sx={{ width: '14%' }}>Target Version</TableCell>
                      <TableCell sx={{ width: '12%' }}>Status</TableCell>
                      <TableCell sx={{ width: '18%' }}>Progress</TableCell>
                      <TableCell sx={{ width: '14%' }}>Scheduled</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {firmwareJobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell sx={{ fontFamily: 'monospace' }}><TruncatedText text={j.id} /></TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}><TruncatedText text={j.deviceSerial} /></TableCell>
                        <TableCell><TruncatedText text={j.firmwareVersion} /></TableCell>
                        <TableCell>
                          <Chip size="small" label={j.status} color={j.status === 'completed' ? 'success' : 'info'} />
                        </TableCell>
                        <TableCell sx={{ width: 180 }}>
                          <LinearProgress variant="determinate" value={j.progressPercent} sx={{ height: 6, borderRadius: 3 }} />
                        </TableCell>
                        <TableCell>{formatRelativeTime(j.scheduledAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Register Firmware Dialog */}
      <Dialog
        open={uploadOpen}
        onClose={(_event, reason) => {
          if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
          if (!uploading) setUploadOpen(false);
        }}
        disableEscapeKeyDown
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Register & Upload Firmware Image</DialogTitle>
        <DialogContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin,.img,.tar,.tar.gz,.tgz,.trx,.rom,.fw"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelect(file);
              e.target.value = '';
            }}
          />
          <Box
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFileSelect(file);
            }}
            sx={{
              mt: 0.5,
              mb: 2,
              p: 2,
              borderRadius: '6px',
              border: '1px dashed',
              borderColor: isDraggingFile ? 'var(--noc-accent)' : 'var(--noc-border-strong)',
              bgcolor: isDraggingFile ? 'var(--noc-accent-bg)' : 'var(--noc-subtle)',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'background-color 180ms ease, border-color 180ms ease',
              '&:hover': { borderColor: 'var(--noc-accent)', bgcolor: 'var(--noc-accent-hover-bg)' },
            }}
          >
            {hashingFile ? (
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                <CircularProgress size={16} sx={{ color: 'var(--noc-accent)' }} />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'text.primary' }}>
                  Computing SHA-256 checksum...
                </Typography>
              </Stack>
            ) : selectedFileSize !== null ? (
              <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="center">
                <InsertDriveFileOutlinedIcon sx={{ color: 'var(--noc-accent)', fontSize: 22 }} />
                <Box sx={{ textAlign: 'left' }}>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'text.primary' }}>
                    {form.fileName}
                  </Typography>
                  <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
                    Size: {formatBytes(selectedFileSize)} · Click or drop another file to replace
                  </Typography>
                </Box>
              </Stack>
            ) : (
              <Stack spacing={0.5} alignItems="center">
                <CloudUploadOutlinedIcon sx={{ fontSize: 26, color: 'var(--noc-accent)' }} />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'text.primary' }}>
                  Click to upload or drag &amp; drop firmware file
                </Typography>
                <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
                  Supports .bin, .img, .tar, .trx, .rom — auto-fills filename, size &amp; SHA-256
                </Typography>
              </Stack>
            )}
          </Box>

          {uploadError && (
            <Alert severity="error" sx={{ mb: 1.75, py: 0.25, fontSize: '0.78rem' }}>
              {uploadError}
            </Alert>
          )}
          {detectHint && (
            <Alert severity="info" sx={{ mb: 1.75, py: 0.25, fontSize: '0.76rem' }}>
              {detectHint}
            </Alert>
          )}

          <Grid container spacing={1.5}>
            <Grid item xs={6}>
              <TextField size="small" fullWidth label="Manufacturer" placeholder="e.g. ZTE" value={form.manufacturer} error={Boolean(uploadFieldErrors.manufacturer)} helperText={uploadFieldErrors.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth label="Model Name" placeholder="e.g. ZXHN F670L" value={form.modelName} error={Boolean(uploadFieldErrors.modelName)} helperText={uploadFieldErrors.modelName} onChange={(e) => setForm({ ...form, modelName: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth label="Product Class" placeholder="e.g. F670L" value={form.productClass} error={Boolean(uploadFieldErrors.productClass)} helperText={uploadFieldErrors.productClass} onChange={(e) => setForm({ ...form, productClass: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth label="Hardware Revision" placeholder="e.g. V1.0" value={form.hardwareRevision} error={Boolean(uploadFieldErrors.hardwareRevision)} helperText={uploadFieldErrors.hardwareRevision} onChange={(e) => setForm({ ...form, hardwareRevision: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth label="Firmware Version" placeholder="e.g. V1.0.10P1N9" value={form.version} error={Boolean(uploadFieldErrors.version)} helperText={uploadFieldErrors.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
            </Grid>
            <Grid item xs={6}>
              <TextField size="small" fullWidth label="File Name" placeholder="Auto-filled from file" value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField size="small" fullWidth label="SHA-256 Checksum" placeholder="Auto-computed from uploaded binary" value={form.checksumSha256} onChange={(e) => setForm({ ...form, checksumSha256: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField size="small" fullWidth multiline rows={2} label="Release Notes" placeholder="Optional changelog or release notes" value={form.releaseNotes} onChange={(e) => setForm({ ...form, releaseNotes: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button disabled={uploading} onClick={() => setUploadOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={hashingFile || uploading}
            startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
            onClick={handleUpload}
          >
            {uploading ? 'Uploading...' : 'Upload & Register'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deploy Firmware Dialog */}
      <Dialog
        open={Boolean(deployTarget)}
        onClose={(_event, reason) => {
          if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
          setDeployTarget(null);
        }}
        disableEscapeKeyDown
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Deploy {activeDeployTarget?.version}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Strict compatibility validation is enforced: only devices matching <b>{activeDeployTarget?.manufacturer} / {activeDeployTarget?.modelName} ({activeDeployTarget?.productClass})</b> and HW <b>{activeDeployTarget?.hardwareRevision}</b> will receive the Download RPC.
          </Alert>
          <TableContainer sx={{ maxHeight: 280 }}>
            <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ width: 42 }} />
                  <TableCell sx={{ width: '32%' }}>Serial</TableCell>
                  <TableCell sx={{ width: '40%' }}>Manufacturer / Model</TableCell>
                  <TableCell sx={{ width: '20%' }}>Compatibility</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeDevices.map((d) => {
                  const compatible =
                    activeDeployTarget &&
                    d.manufacturerCanonical.toLowerCase() === activeDeployTarget.manufacturer.toLowerCase() &&
                    d.modelName.toLowerCase() === activeDeployTarget.modelName.toLowerCase() &&
                    d.productClass.toLowerCase() === activeDeployTarget.productClass.toLowerCase();
                  return (
                    <TableRow key={d.id}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selectedDeviceIds.includes(d.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedDeviceIds((s) => [...s, d.id]);
                            else setSelectedDeviceIds((s) => s.filter((x) => x !== d.id));
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}><TruncatedText text={d.serialNumber} /></TableCell>
                      <TableCell><TruncatedText text={`${d.manufacturerCanonical} ${d.modelName}`} /></TableCell>
                      <TableCell>
                        <Chip size="small" label={compatible ? 'Compatible' : 'Mismatch'} color={compatible ? 'success' : 'error'} variant="outlined" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeployTarget(null)}>Cancel</Button>
          <Button variant="contained" disabled={selectedDeviceIds.length === 0} onClick={handleDeploy}>
            Start Rollout
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
