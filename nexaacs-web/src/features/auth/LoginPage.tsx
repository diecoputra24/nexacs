import { useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { useNavigate } from 'react-router-dom';
import { useAcsStore } from '../../stores/acsStore';
import { extractZodFieldErrors, formatZodError, loginFormSchema } from '../../validation/schemas';

export function LoginPage() {
  const navigate = useNavigate();
  const loginBackend = useAcsStore((s) => s.loginBackend);
  const idleTimeoutNotice = useAcsStore((s) => s.idleTimeoutNotice);
  const clearIdleNotice = useAcsStore((s) => s.clearIdleNotice);
  const themeMode = useAcsStore((s) => s.themeMode);
  const toggleThemeMode = useAcsStore((s) => s.toggleThemeMode);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setFieldErrors({});
    const parsed = loginFormSchema.safeParse({ username, password });
    if (!parsed.success) {
      setFieldErrors(extractZodFieldErrors(parsed.error));
      setError(formatZodError(parsed.error));
      return;
    }
    clearIdleNotice();
    setSubmitting(true);
    const res = await loginBackend(parsed.data.username, parsed.data.password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? 'Invalid username or password');
      return;
    }
    navigate('/overview', { replace: true });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
        position: 'relative',
      }}
    >
      <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
        <Tooltip title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
          <IconButton
            onClick={() => toggleThemeMode()}
            size="small"
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              color: 'text.primary',
              p: 1,
            }}
          >
            {themeMode === 'dark' ? (
              <LightModeOutlinedIcon fontSize="small" />
            ) : (
              <DarkModeOutlinedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
      </Box>

      <Card
        sx={{
          width: '100%',
          maxWidth: 400,
          borderRadius: 2,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 3.5 } }}>
          <Stack spacing={2.5}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Box
                component="img"
                src="/nexacs-logo.png"
                alt="NexACS"
                sx={{
                  height: 44,
                  width: 'auto',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  mb: 1.5,
                  filter: (t) =>
                    t.palette.mode === 'dark'
                      ? 'drop-shadow(0 0 1px rgba(255,255,255,0.9)) drop-shadow(0 2px 6px rgba(56,189,248,0.22))'
                      : 'none',
                }}
              />
              <Typography variant="h6" fontWeight={700} color="text.primary">
                Sign in to NexACS
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25 }}>
                Enter your operator username and password
              </Typography>
            </Box>

            {idleTimeoutNotice && (
              <Alert severity="warning" onClose={() => clearIdleNotice()}>
                {idleTimeoutNotice}
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}

            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{
                '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline)': {
                  minHeight: 42,
                  height: 42,
                  fontSize: '0.9rem',
                },
                '& .MuiOutlinedInput-input': {
                  padding: '9.5px 12px',
                  fontSize: '0.9rem',
                },
                '& .MuiInputLabel-root': {
                  fontSize: '0.9rem',
                },
                '& .MuiInputLabel-root:not(.MuiInputLabel-shrink)': {
                  transform: 'translate(14px, 10px) scale(1)',
                },
                '& .MuiInputLabel-root.MuiInputLabel-shrink': {
                  transform: 'translate(14px, -9px) scale(0.75)',
                },
              }}
            >
              <Stack spacing={1.75}>
                <TextField
                  label="Username"
                  size="medium"
                  fullWidth
                  autoFocus
                  autoComplete="username"
                  value={username}
                  error={Boolean(fieldErrors.username)}
                  helperText={fieldErrors.username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldErrors.username) setFieldErrors((p) => ({ ...p, username: '' }));
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonOutlineIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  size="medium"
                  fullWidth
                  autoComplete="current-password"
                  value={password}
                  error={Boolean(fieldErrors.password)}
                  helperText={fieldErrors.password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
                  }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((prev) => !prev)}
                        >
                          {showPassword ? (
                            <VisibilityOffOutlinedIcon sx={{ fontSize: 17 }} />
                          ) : (
                            <VisibilityOutlinedIcon sx={{ fontSize: 17 }} />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={submitting}
                  sx={{ py: 1, fontWeight: 600 }}
                >
                  {submitting ? <CircularProgress size={18} color="inherit" /> : 'Sign In'}
                </Button>
              </Stack>
            </Box>

            <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ display: 'block' }}>
              Idle session auto-logout after 1 hour of inactivity
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
