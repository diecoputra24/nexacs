import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import TuneIcon from '@mui/icons-material/Tune';
import { useAcsStore } from '../../stores/acsStore';
import { NocDialog } from '../../components/dialogs/NocDialog';
import { TruncatedText } from '../../components/common/TruncatedText';
import { formatDateTime } from '../../utils/classification';
import type { PermissionCode, PlatformUser, RoleName } from '../../types';
import {
  createUserSchema,
  extractZodFieldErrors,
  formatZodError,
  updateUserSchema,
} from '../../validation/schemas';

export const PERMISSION_CATALOG: Array<{ code: PermissionCode; description: string; highRisk: boolean }> = [
  { code: 'overview.view', description: 'View overview dashboard and telemetry stats', highRisk: false },
  { code: 'devices.view', description: 'View device inventory and non-secret parameters', highRisk: false },
  { code: 'devices.summon', description: 'Trigger Summon and parameter refresh tasks', highRisk: false },
  { code: 'devices.parameters.write', description: 'Modify writable parameters, WAN & WiFi settings', highRisk: false },
  { code: 'devices.secrets.view', description: 'Reveal masked modem, WiFi & Connection Request passwords', highRisk: true },
  { code: 'devices.credentials.edit', description: 'Rotate device & Connection Request credentials', highRisk: true },
  { code: 'devices.reboot', description: 'Reboot CPE/ONT devices remotely', highRisk: true },
  { code: 'devices.factory_reset', description: 'Execute Factory Reset on CPE/ONT devices', highRisk: true },
  { code: 'devices.delete', description: 'Archive / soft delete devices from platform', highRisk: true },
  { code: 'faults.view', description: 'View device and operation faults', highRisk: false },
  { code: 'faults.manage', description: 'Acknowledge, resolve, and safely retry faults', highRisk: false },
  { code: 'firmware.view', description: 'View firmware images and deployment jobs', highRisk: false },
  { code: 'firmware.deploy', description: 'Upload firmware and trigger rollouts', highRisk: true },
  { code: 'security.users.manage', description: 'Manage users, roles, and RBAC permission matrix', highRisk: true },
  { code: 'security.trust.manage', description: 'Manage certificates, enrollment allowlist & USP trust', highRisk: true },
  { code: 'security.audit.view', description: 'View platform audit logs', highRisk: false },
  { code: 'settings.view', description: 'View system settings and thresholds', highRisk: false },
  { code: 'settings.manage', description: 'Modify system thresholds and manufacturer aliases', highRisk: true },
];

const ROLES: RoleName[] = ['Super Admin', 'NOC Engineer', 'Technician', 'Viewer'];

function formatRoleLabel(role: string): string {
  const slug = role.trim().toLowerCase().replace(/\s+/g, '');
  return slug === 'superadmin' ? 'admin' : slug;
}

interface Props {
  onToast: (severity: 'success' | 'error' | 'info', text: string) => void;
}

export function UsersRolesPanel({ onToast }: Props) {
  const users = useAcsStore((s) => s.users);
  const currentUser = useAcsStore((s) => s.currentUser);
  const rolePermissions = useAcsStore((s) => s.rolePermissions);
  const hasPermission = useAcsStore((s) => s.hasPermission);
  const createUser = useAcsStore((s) => s.createUser);
  const updateUser = useAcsStore((s) => s.updateUser);
  const deleteUser = useAcsStore((s) => s.deleteUser);
  const updateRolePermissions = useAcsStore((s) => s.updateRolePermissions);

  const canManageUsers = hasPermission('security.users.manage');

  const [roleMatrixOpen, setRoleMatrixOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    role: 'NOC Engineer' as RoleName,
    status: 'active' as 'active' | 'disabled',
  });
  const [userFormError, setUserFormError] = useState('');
  const [userFieldErrors, setUserFieldErrors] = useState<Record<string, string>>({});
  const [savingUser, setSavingUser] = useState(false);

  const [draftPerms, setDraftPerms] = useState<Record<RoleName, PermissionCode[]>>(rolePermissions);
  const [savingRole, setSavingRole] = useState<RoleName | null>(null);

  useEffect(() => {
    setDraftPerms(rolePermissions);
  }, [rolePermissions]);

  const openAddModal = () => {
    setEditingUser(null);
    setUserForm({ username: '', password: '', role: 'NOC Engineer', status: 'active' });
    setUserFormError('');
    setUserFieldErrors({});
    setUserModalOpen(true);
  };

  const openEditModal = (u: PlatformUser) => {
    setEditingUser(u);
    setUserForm({
      username: u.username,
      password: '',
      role: u.role,
      status: u.status,
    });
    setUserFormError('');
    setUserFieldErrors({});
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    if (savingUser) return;
    setUserFormError('');
    setUserFieldErrors({});

    if (editingUser) {
      const parsed = updateUserSchema.safeParse(userForm);
      if (!parsed.success) {
        setUserFieldErrors(extractZodFieldErrors(parsed.error));
        setUserFormError(formatZodError(parsed.error));
        return;
      }
      setSavingUser(true);
      const res = await updateUser(editingUser.id, {
        role: parsed.data.role,
        status: parsed.data.status,
        password: parsed.data.password || undefined,
      });
      setSavingUser(false);
      if (!res.ok) {
        setUserFormError(res.error ?? 'Failed to save user');
        return;
      }
    } else {
      const parsed = createUserSchema.safeParse(userForm);
      if (!parsed.success) {
        setUserFieldErrors(extractZodFieldErrors(parsed.error));
        setUserFormError(formatZodError(parsed.error));
        return;
      }
      setSavingUser(true);
      const res = await createUser({
        username: parsed.data.username,
        fullName: parsed.data.username,
        password: parsed.data.password,
        role: parsed.data.role,
        status: parsed.data.status,
      });
      setSavingUser(false);
      if (!res.ok) {
        setUserFormError(res.error ?? 'Failed to save user');
        return;
      }
    }

    setUserModalOpen(false);
    onToast('success', editingUser ? `User ${editingUser.username} updated.` : `User ${userForm.username.trim()} added.`);
  };

  const handleDeleteUser = async (u: PlatformUser) => {
    const res = await deleteUser(u.id);
    if (!res.ok) {
      onToast('error', res.error ?? 'Failed to delete user');
      return;
    }
    onToast('info', `User ${u.username} removed.`);
  };

  const toggleRolePermission = (role: RoleName, code: PermissionCode) => {
    if (!canManageUsers) return;
    if (role === 'Super Admin' && code === 'security.users.manage') return;
    setDraftPerms((prev) => {
      const current = prev[role] ?? [];
      const has = current.includes(code);
      return {
        ...prev,
        [role]: has ? current.filter((c) => c !== code) : [...current, code],
      };
    });
  };

  const handleSaveRole = async (role: RoleName) => {
    setSavingRole(role);
    const res = await updateRolePermissions(role, draftPerms[role] ?? []);
    setSavingRole(null);
    if (!res.ok) {
      onToast('error', res.error ?? `Failed to save ${role} permissions`);
      return;
    }
    onToast('success', `Access permissions for role "${role}" saved (${(draftPerms[role] ?? []).length} permissions).`);
  };

  return (
    <Stack spacing={2.5}>
      {!canManageUsers && (
        <Alert severity="warning">
          Read-only mode: <code>security.users.manage</code> permission is required to add/edit users or customize role permissions.
        </Alert>
      )}

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Operator Accounts ({users.length})
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" startIcon={<TuneIcon />} onClick={() => setRoleMatrixOpen(true)}>
                Role Permissions
              </Button>
              <Button variant="contained" size="small" startIcon={<AddIcon />} disabled={!canManageUsers} onClick={openAddModal}>
                Add User
              </Button>
            </Stack>
          </Stack>

          <TableContainer>
            <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '24%' }}>Username</TableCell>
                  <TableCell sx={{ width: '20%' }}>Role</TableCell>
                  <TableCell sx={{ width: '14%' }}>Status</TableCell>
                  <TableCell sx={{ width: '26%' }}>Last Login</TableCell>
                  <TableCell align="right" sx={{ width: '16%' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => {
                  const isSelf = u.username.toLowerCase() === currentUser.username.toLowerCase();
                  return (
                    <TableRow key={u.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.84rem' }}>
                        {u.username} {isSelf && <Chip size="small" label="You" color="primary" sx={{ ml: 0.75, height: 19 }} />}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={formatRoleLabel(u.role)} variant="outlined" color={u.role === 'Super Admin' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={u.status === 'active' ? 'Active' : 'Disabled'}
                          color={u.status === 'active' ? 'success' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                        {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit User & Role">
                          <span>
                            <IconButton size="small" disabled={!canManageUsers} onClick={() => openEditModal(u)}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={isSelf ? 'Cannot delete active session user' : 'Delete User'}>
                          <span>
                            <IconButton size="small" disabled={!canManageUsers || isSelf} onClick={() => void handleDeleteUser(u)}>
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <NocDialog
        open={roleMatrixOpen}
        onClose={() => setRoleMatrixOpen(false)}
        title="Role Access Matrix"
        icon={<TuneIcon sx={{ fontSize: 18 }} />}
        maxWidth="lg"
        cancelLabel="Close"
      >
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '20%' }}>Permission Code</TableCell>
                <TableCell sx={{ width: '26%' }}>Description</TableCell>
                <TableCell sx={{ width: '10%' }}>Risk</TableCell>
                {ROLES.map((r) => (
                  <TableCell key={r} align="center" sx={{ width: '11%' }}>
                    <Stack spacing={0.5} alignItems="center">
                      <span>{formatRoleLabel(r)}</span>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SaveIcon sx={{ fontSize: '14px !important' }} />}
                        disabled={!canManageUsers || savingRole === r}
                        onClick={() => void handleSaveRole(r)}
                        sx={{ py: 0.15, px: 1, fontSize: '0.7rem', textTransform: 'none' }}
                      >
                        {savingRole === r ? 'Saving...' : 'Save'}
                      </Button>
                    </Stack>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {PERMISSION_CATALOG.map((p) => (
                <TableRow key={p.code} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.76rem' }}><TruncatedText text={p.code} /></TableCell>
                  <TableCell sx={{ fontSize: '0.78rem' }}><TruncatedText text={p.description} /></TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={p.highRisk ? 'High Risk' : 'Standard'}
                      color={p.highRisk ? 'error' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  {ROLES.map((r) => {
                    const checked = (draftPerms[r] ?? []).includes(p.code);
                    const locked = r === 'Super Admin' && p.code === 'security.users.manage';
                    return (
                      <TableCell key={r} align="center">
                        <Checkbox
                          size="small"
                          checked={checked}
                          disabled={!canManageUsers || locked}
                          onChange={() => toggleRolePermission(r, p.code)}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </NocDialog>

      <NocDialog
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? `Edit Operator: ${editingUser.username}` : 'Add New Operator User'}
        subtitle="Configure operator username, password (bcrypt), status, and RBAC role."
        maxWidth="sm"
        confirmLabel={savingUser ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
        confirmDisabled={savingUser}
        onConfirm={() => void handleSaveUser()}
      >
        {userFormError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {userFormError}
          </Alert>
        )}
        <Grid container spacing={2} sx={{ pt: 0.5 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              label="Username"
              required
              disabled={Boolean(editingUser)}
              value={userForm.username}
              error={Boolean(userFieldErrors.username)}
              helperText={userFieldErrors.username}
              onChange={(e) => setUserForm((f) => ({ ...f, username: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              type="password"
              label={editingUser ? 'New Password (optional, min 4 chars)' : 'Password (min 4 chars)'}
              required={!editingUser}
              value={userForm.password}
              error={Boolean(userFieldErrors.password)}
              helperText={userFieldErrors.password}
              onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              select
              label="Role"
              value={userForm.role}
              onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value as RoleName }))}
            >
              {ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {formatRoleLabel(r)}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              size="small"
              select
              label="Account Status"
              value={userForm.status}
              onChange={(e) => setUserForm((f) => ({ ...f, status: e.target.value as 'active' | 'disabled' }))}
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="disabled">Disabled</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </NocDialog>
    </Stack>
  );
}
