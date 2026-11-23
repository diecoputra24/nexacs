import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
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
import { useParams } from 'react-router-dom';
import { useAcsStore } from '../../stores/acsStore';
import { UsersRolesPanel } from '../settings/UsersRolesPanel';
import { TruncatedText } from '../../components/common/TruncatedText';
import { NocToast } from '../../components/feedback/NocToast';
import { formatDateTime } from '../../utils/classification';
import { pageEnterSx, SecuritySkeleton, usePageSkeleton } from '../../components/skeletons/PageSkeletons';

const SECTION_META: Record<string, { key: 'users' | 'audit' | 'trust'; title: string; subtitle: string }> = {
  users: {
    key: 'users',
    title: 'Users & RBAC Permissions',
    subtitle: 'Manage operator accounts and customize per-role RBAC permission access.',
  },
  audit: {
    key: 'audit',
    title: 'Audit Logs',
    subtitle: 'Inspect sanitized login, provisioning, credential, and RBAC audit trails.',
  },
  trust: {
    key: 'trust',
    title: 'Device & USP Trust Policy',
    subtitle: 'Review encryption, idle session enforcement, and CWMP/USP security posture.',
  },
};

export function SecurityPage() {
  const { section = 'users' } = useParams<{ section?: string }>();
  const activeSection = SECTION_META[section] ?? SECTION_META.users;
  const activeKey = activeSection.key;

  const [auditSearch, setAuditSearch] = useState('');
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; text: string }>({
    open: false,
    severity: 'success',
    text: '',
  });
  const { loading } = usePageSkeleton();
  const apiMode = useAcsStore((s) => s.apiMode);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);

  const auditLogs = useAcsStore((s) => s.auditLogs);
  const settings = useAcsStore((s) => s.settings);
  const hasPermission = useAcsStore((s) => s.hasPermission);

  const filteredLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter(
      (l) =>
        !q ||
        l.action.toLowerCase().includes(q) ||
        (l.actorUsername || l.actorEmail || '').toLowerCase().includes(q) ||
        l.targetId.toLowerCase().includes(q),
    );
  }, [auditLogs, auditSearch]);

  if (loading || (apiMode === 'backend' && backendRefreshing)) {
    return <SecuritySkeleton />;
  }

  return (
    <Box sx={pageEnterSx}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">Security · {activeSection.title}</Typography>
      </Box>

      {activeKey === 'users' && (
        <UsersRolesPanel onToast={(severity, text) => setToast({ open: true, severity, text })} />
      )}

      {activeKey === 'audit' && (
        <Card>
          <CardContent>
            {!hasPermission('security.audit.view') ? (
              <Alert severity="error">
                Permission Denied: <code>security.audit.view</code> is required to inspect audit logs.
              </Alert>
            ) : (
              <>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="subtitle1">Platform Audit Logs (Secrets Redacted)</Typography>
                  <TextField
                    size="small"
                    placeholder="Filter action, actor, or target..."
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    sx={{ minWidth: 260 }}
                  />
                </Stack>
                <TableContainer>
                  <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: '16%' }}>Timestamp</TableCell>
                        <TableCell sx={{ width: '12%' }}>Actor</TableCell>
                        <TableCell sx={{ width: '10%' }}>Role</TableCell>
                        <TableCell sx={{ width: '18%' }}>Action</TableCell>
                        <TableCell sx={{ width: '16%' }}>Target</TableCell>
                        <TableCell sx={{ width: '28%' }}>Metadata</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                            No audit logs recorded yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredLogs.map((l) => {
                          const roleLabel = l.actorRole.trim().toLowerCase().replace(/\s+/g, '') === 'superadmin'
                            ? 'admin'
                            : l.actorRole.trim().toLowerCase().replace(/\s+/g, '');
                          const metaStr = JSON.stringify(l.metadata);
                          return (
                            <TableRow key={l.id}>
                              <TableCell><TruncatedText text={formatDateTime(l.createdAt)} /></TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.76rem' }}>
                                <TruncatedText text={l.actorUsername || l.actorEmail} />
                              </TableCell>
                              <TableCell><TruncatedText text={roleLabel} /></TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}><TruncatedText text={l.action} /></TableCell>
                              <TableCell sx={{ fontFamily: 'monospace' }}><TruncatedText text={l.targetId} /></TableCell>
                              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>
                                <TruncatedText text={metaStr} />
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeKey === 'trust' && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Encryption & Secret Protection
                </Typography>
                <Stack spacing={1}>
                  <Typography variant="body2">• Authentication &amp; Sessions: Username + bcrypt passwords, 1-hour idle timeout &amp; sliding JWT expiry</Typography>
                  <Typography variant="body2">• Brute-Force Protection: Rate-limited `/auth/login` (10 attempts / 5m) &amp; authenticated `/auth/refresh`</Typography>
                  <Typography variant="body2">• Device Credentials &amp; PPPoE Secrets: Encrypted at rest via AES-256-GCM</Typography>
                  <Typography variant="body2">• Default API &amp; List Masking: Enabled (all passwords redacted unless explicitly revealed)</Typography>
                  <Typography variant="body2">• HTTP Hardening: Strict CORS allowlist, `X-Frame-Options: DENY`, `nosniff`, &amp; `no-store` API cache policy</Typography>
                  <Typography variant="body2">• WebSocket &amp; Log Sanitizer: JWT WebSocket auth + redaction of passwords, passphrases &amp; tokens</Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Enrollment & Protocol Trust
                </Typography>
                <Stack spacing={1}>
                  <Typography variant="body2">
                    • Auto Enrollment on CWMP Inform: <b>{settings.protocol.allowAutoEnrollment ? 'Allowed' : 'Allowlist Only'}</b>
                  </Typography>
                  <Typography variant="body2">
                    • USP Controller Identity: <code>{settings.protocol.uspControllerId}</code>
                  </Typography>
                  <Typography variant="body2">
                    • USP Default MTP: <b>{settings.protocol.uspMtp.toUpperCase()}</b>
                  </Typography>
                  <Typography variant="body2">
                    • Tenant Access Boundary: Strict <code>tenant_id</code> isolation across all domain tables
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <NocToast
        open={toast.open}
        severity={toast.severity}
        text={toast.text}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </Box>
  );
}
