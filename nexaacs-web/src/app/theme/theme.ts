import { createElement, forwardRef, type ReactElement } from 'react';
import { Grow, type PaletteMode } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import type { TransitionProps } from '@mui/material/transitions';

const DialogTransition = forwardRef<unknown, TransitionProps & { children: ReactElement }>(
  function DialogTransition(props, ref) {
    return createElement(Grow, {
      ref,
      easing: {
        enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
        exit: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      ...props,
    });
  },
);

export function createNexaTheme(mode: PaletteMode) {
  const isDark = mode === 'dark';
  const border = isDark ? '#1E293B' : '#E2E8F0';
  const inputBg = isDark ? '#0F172A' : '#FFFFFF';
  const inputBorder = isDark ? '#334155' : '#CBD5E1';
  const inputBorderHover = isDark ? '#475569' : '#94A3B8';
  const focusBorder = isDark ? '#38BDF8' : '#0284C7';
  const tableHeadBg = isDark ? '#0F172A' : '#F8FAFC';
  const tableHeadText = isDark ? '#CBD5E1' : '#334155';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: isDark ? '#38BDF8' : '#0F4C81',
        dark: isDark ? '#0284C7' : '#0A355C',
        light: isDark ? '#7DD3FC' : '#3B75A8',
        contrastText: isDark ? '#082F49' : '#FFFFFF',
      },
      secondary: {
        main: isDark ? '#94A3B8' : '#334155',
      },
      success: {
        main: isDark ? '#4ADE80' : '#15803D',
        light: isDark ? '#14532D' : '#DCFCE7',
        dark: isDark ? '#86EFAC' : '#14532D',
      },
      warning: {
        main: isDark ? '#FBBF24' : '#B45309',
        light: isDark ? '#78350F' : '#FEF3C7',
        dark: isDark ? '#FDE68A' : '#78350F',
      },
      error: {
        main: isDark ? '#F87171' : '#B91C1C',
        light: isDark ? '#7F1D1D' : '#FEE2E2',
        dark: isDark ? '#FCA5A5' : '#7F1D1D',
      },
      info: {
        main: isDark ? '#38BDF8' : '#0369A1',
        light: isDark ? '#0C4A6E' : '#E0F2FE',
      },
      background: {
        default: isDark ? '#0B1120' : '#F4F6F9',
        paper: isDark ? '#111827' : '#FFFFFF',
      },
      divider: border,
      text: {
        primary: isDark ? '#F1F5F9' : '#0F172A',
        secondary: isDark ? '#94A3B8' : '#475569',
      },
    },
    shape: {
      borderRadius: 6,
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600, letterSpacing: '-0.01em' },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiDrawer: {
        defaultProps: {
          transitionDuration: { enter: 260, exit: 240 },
          BackdropProps: {
            transitionDuration: { enter: 260, exit: 240 },
          },
        },
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
          },
        },
      },
      MuiCard: {
        defaultProps: {
          variant: 'outlined',
        },
        styleOverrides: {
          root: {
            borderColor: border,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          outlined: {
            borderColor: border,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            border: `1px solid ${border}`,
            boxShadow: isDark
              ? '0 14px 32px rgba(2, 6, 23, 0.65)'
              : '0 10px 25px rgba(15, 23, 42, 0.1)',
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            border: `1px solid ${border}`,
            boxShadow: isDark
              ? '0 14px 32px rgba(2, 6, 23, 0.65)'
              : '0 10px 25px rgba(15, 23, 42, 0.1)',
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
          },
          sizeSmall: {
            height: 34,
            minHeight: 34,
            padding: '4px 12px',
            fontSize: '0.8rem',
            borderRadius: 6,
          },
          containedPrimary: isDark
            ? {
                backgroundColor: '#0284C7',
                color: '#FFFFFF',
                '&:hover': {
                  backgroundColor: '#0369A1',
                },
              }
            : {},
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
          },
        },
      },
      MuiDialog: {
        defaultProps: {
          TransitionComponent: DialogTransition,
          transitionDuration: { enter: 250, exit: 220 },
          disableEscapeKeyDown: true,
          BackdropProps: {
            transitionDuration: { enter: 250, exit: 220 },
          },
        },
        styleOverrides: {
          paper: {
            borderRadius: 8,
            border: `1px solid ${border}`,
            backgroundImage: 'none',
            boxShadow: isDark
              ? '0 16px 36px -6px rgba(2, 6, 23, 0.72), 0 6px 14px -4px rgba(2, 6, 23, 0.5)'
              : '0 12px 28px -6px rgba(15, 23, 42, 0.12), 0 4px 10px -4px rgba(15, 23, 42, 0.06)',
            overflow: 'hidden',
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            '&:not(.MuiBackdrop-invisible)': {
              backgroundColor: isDark ? 'rgba(2, 6, 23, 0.65)' : 'rgba(15, 23, 42, 0.35)',
            },
          },
          invisible: {
            backgroundColor: 'transparent',
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          size: 'small',
        },
      },
      MuiFormControl: {
        defaultProps: {
          size: 'small',
        },
      },
      MuiSelect: {
        defaultProps: {
          size: 'small',
          MenuProps: {
            variant: 'menu',
            anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
            transformOrigin: { vertical: 'top', horizontal: 'left' },
            PaperProps: {
              sx: {
                mt: 0.5,
                maxHeight: 220,
                overflowY: 'auto',
              },
            },
          },
        },
        styleOverrides: {
          select: {
            display: 'flex',
            alignItems: 'center',
            minHeight: 'unset',
            paddingTop: '6.5px',
            paddingBottom: '6.5px',
            fontSize: '0.8rem',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            minHeight: 32,
            fontSize: '0.8rem',
            paddingTop: 5,
            paddingBottom: 5,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            backgroundColor: inputBg,
            fontSize: '0.8rem',
            '&:not(.MuiInputBase-multiline)': {
              minHeight: 34,
              height: 34,
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: inputBorder,
            },
            '&:hover:not(.Mui-focused):not(.Mui-error) .MuiOutlinedInput-notchedOutline': {
              borderColor: inputBorderHover,
            },
            '&.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline': {
              borderColor: focusBorder,
              borderWidth: '1.5px',
            },
          },
          input: {
            padding: '6.5px 12px',
            fontSize: '0.8rem',
            lineHeight: 1.4,
            '&.MuiInputBase-inputMultiline': {
              padding: 0,
            },
          },
          inputSizeSmall: {
            padding: '6.5px 12px',
            '&.MuiInputBase-inputMultiline': {
              padding: 0,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontSize: '0.8rem',
            '&:not(.MuiInputLabel-shrink)': {
              transform: 'translate(14px, 7px) scale(1)',
            },
            '&.MuiInputLabel-shrink': {
              transform: 'translate(14px, -7px) scale(0.75)',
            },
            '&.Mui-focused:not(.Mui-error)': {
              color: focusBorder,
            },
          },
        },
      },
      MuiTable: {
        defaultProps: {
          size: 'small',
        },
        styleOverrides: {
          root: {
            tableLayout: 'fixed',
            width: '100%',
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            overflowX: 'hidden',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomColor: isDark ? '#1E293B' : '#F1F5F9',
          },
          head: {
            backgroundColor: tableHeadBg,
            fontWeight: 600,
            fontSize: '0.72rem',
            lineHeight: 1.25,
            padding: '6px 8px',
            color: tableHeadText,
            borderBottom: `1px solid ${border}`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
          sizeSmall: {
            padding: '5px 8px',
            fontSize: '0.77rem',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            backgroundColor: focusBorder,
          },
        },
      },
    },
  });
}

export const nexaTheme = createNexaTheme('dark');
