import { forwardRef } from 'react';
import { Alert, Slide, Snackbar, useTheme, type AlertColor, type SlideProps } from '@mui/material';

interface NocToastProps {
  open: boolean;
  severity: AlertColor;
  text: string;
  onClose: () => void;
  autoHideDuration?: number;
}

const LIGHT_TOAST_STYLES: Record<
  AlertColor,
  { bgcolor: string; color: string; borderColor: string; iconColor: string }
> = {
  success: {
    bgcolor: '#ECFDF5',
    color: '#065F46',
    borderColor: '#A7F3D0',
    iconColor: '#059669',
  },
  info: {
    bgcolor: '#F0F9FF',
    color: '#0C4A6E',
    borderColor: '#BAE6FD',
    iconColor: '#0284C7',
  },
  warning: {
    bgcolor: '#FFFBEB',
    color: '#92400E',
    borderColor: '#FDE68A',
    iconColor: '#D97706',
  },
  error: {
    bgcolor: '#FEF2F2',
    color: '#991B1B',
    borderColor: '#FECACA',
    iconColor: '#DC2626',
  },
};

const DARK_TOAST_STYLES: Record<
  AlertColor,
  { bgcolor: string; color: string; borderColor: string; iconColor: string }
> = {
  success: {
    bgcolor: '#052E16',
    color: '#A7F3D0',
    borderColor: '#166534',
    iconColor: '#4ADE80',
  },
  info: {
    bgcolor: '#082F49',
    color: '#BAE6FD',
    borderColor: '#0369A1',
    iconColor: '#38BDF8',
  },
  warning: {
    bgcolor: '#451A03',
    color: '#FDE68A',
    borderColor: '#92400E',
    iconColor: '#FBBF24',
  },
  error: {
    bgcolor: '#450A0A',
    color: '#FECACA',
    borderColor: '#991B1B',
    iconColor: '#F87171',
  },
};

const SlideDownTransition = forwardRef<unknown, SlideProps>(function SlideDownTransition(props, ref) {
  return <Slide direction="down" ref={ref} {...props} />;
});

/** Top-centered soft-tinted NOC toast notification. */
export function NocToast({
  open,
  severity,
  text,
  onClose,
  autoHideDuration = 3500,
}: NocToastProps) {
  const theme = useTheme();
  const palette = (theme.palette.mode === 'dark' ? DARK_TOAST_STYLES : LIGHT_TOAST_STYLES)[severity];

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      onClose={onClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      TransitionComponent={SlideDownTransition}
      transitionDuration={{ enter: 260, exit: 200 }}
      sx={{ top: { xs: 16, sm: 20 } }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        variant="standard"
        sx={{
          bgcolor: palette.bgcolor,
          color: palette.color,
          border: '1px solid',
          borderColor: palette.borderColor,
          borderRadius: 1.5,
          fontSize: '0.82rem',
          fontWeight: 500,
          boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
          '& .MuiAlert-icon': { color: palette.iconColor },
          '& .MuiAlert-action': { color: palette.color },
        }}
      >
        {text}
      </Alert>
    </Snackbar>
  );
}
