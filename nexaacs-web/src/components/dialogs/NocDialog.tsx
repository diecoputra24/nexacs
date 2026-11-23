import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export type NocDialogTone = 'primary' | 'warning' | 'danger' | 'neutral';

interface NocDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: NocDialogTone;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg';
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  hideCancel?: boolean;
}

const LIGHT_TONE_MAP: Record<
  NocDialogTone,
  { iconBg: string; iconColor: string; iconBorder: string; btnBg: string; btnHover: string }
> = {
  primary: {
    iconBg: '#EFF6FF',
    iconColor: '#0284C7',
    iconBorder: '#BAE6FD',
    btnBg: '#0284C7',
    btnHover: '#0369A1',
  },
  warning: {
    iconBg: '#FEF3C7',
    iconColor: '#B45309',
    iconBorder: '#FDE68A',
    btnBg: '#D97706',
    btnHover: '#B45309',
  },
  danger: {
    iconBg: '#FEF2F2',
    iconColor: '#DC2626',
    iconBorder: '#FECACA',
    btnBg: '#DC2626',
    btnHover: '#B91C1C',
  },
  neutral: {
    iconBg: '#F1F5F9',
    iconColor: '#475569',
    iconBorder: '#E2E8F0',
    btnBg: '#334155',
    btnHover: '#1E293B',
  },
};

const DARK_TONE_MAP: Record<
  NocDialogTone,
  { iconBg: string; iconColor: string; iconBorder: string; btnBg: string; btnHover: string }
> = {
  primary: {
    iconBg: 'rgba(56, 189, 248, 0.14)',
    iconColor: '#38BDF8',
    iconBorder: 'rgba(56, 189, 248, 0.32)',
    btnBg: '#0284C7',
    btnHover: '#0369A1',
  },
  warning: {
    iconBg: 'rgba(251, 191, 36, 0.14)',
    iconColor: '#FBBF24',
    iconBorder: 'rgba(251, 191, 36, 0.32)',
    btnBg: '#D97706',
    btnHover: '#B45309',
  },
  danger: {
    iconBg: 'rgba(248, 113, 113, 0.14)',
    iconColor: '#F87171',
    iconBorder: 'rgba(248, 113, 113, 0.32)',
    btnBg: '#DC2626',
    btnHover: '#B91C1C',
  },
  neutral: {
    iconBg: 'rgba(148, 163, 184, 0.14)',
    iconColor: '#CBD5E1',
    iconBorder: 'rgba(148, 163, 184, 0.28)',
    btnBg: '#334155',
    btnHover: '#475569',
  },
};

export function NocDialog({
  open,
  onClose,
  title,
  subtitle,
  icon,
  tone = 'primary',
  maxWidth = 'xs',
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirmDisabled = false,
  hideCancel = false,
}: NocDialogProps) {
  const theme = useTheme();
  const palette = (theme.palette.mode === 'dark' ? DARK_TONE_MAP : LIGHT_TONE_MAP)[tone];

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
        onClose();
      }}
      disableEscapeKeyDown
      maxWidth={maxWidth}
      fullWidth
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        spacing={1.5}
        sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          {icon && (
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: palette.iconBg,
                color: palette.iconColor,
                border: `1px solid ${palette.iconBorder}`,
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>
          )}
          <Box>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  mt: 0.25,
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>

        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            color: 'text.secondary',
            borderRadius: '6px',
            p: 0.5,
            '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
          }}
        >
          <CloseIcon sx={{ fontSize: 17 }} />
        </IconButton>
      </Stack>

      {/* Body */}
      <DialogContent sx={{ px: 2.5, py: 2.25, bgcolor: 'background.paper' }}>{children}</DialogContent>

      {/* Footer */}
      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={1}
        sx={{ px: 2.5, py: 1.5, bgcolor: 'var(--noc-subtle)', borderTop: '1px solid', borderColor: 'divider' }}
      >
        {!hideCancel && (
          <Button
            variant="outlined"
            size="small"
            onClick={onClose}
            sx={{
              height: 34,
              px: 1.75,
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--noc-text-muted)',
              borderColor: 'var(--noc-border-strong)',
              bgcolor: 'background.paper',
              borderRadius: '6px',
              '&:hover': { borderColor: 'text.secondary', bgcolor: 'action.hover' },
            }}
          >
            {cancelLabel}
          </Button>
        )}
        {confirmLabel && onConfirm && (
          <Button
            variant="contained"
            size="small"
            disabled={confirmDisabled}
            onClick={onConfirm}
            sx={{
              height: 34,
              px: 2,
              fontSize: '0.8rem',
              fontWeight: 600,
              bgcolor: palette.btnBg,
              color: '#FFFFFF',
              borderRadius: '6px',
              '&:hover': { bgcolor: palette.btnHover },
            }}
          >
            {confirmLabel}
          </Button>
        )}
      </Stack>
    </Dialog>
  );
}
