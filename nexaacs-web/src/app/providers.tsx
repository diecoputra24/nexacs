import { useMemo, type ReactNode } from 'react';
import { CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { createNexaTheme } from './theme/theme';
import { useAcsStore } from '../stores/acsStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  const themeMode = useAcsStore((s) => s.themeMode);
  const theme = useMemo(() => createNexaTheme(themeMode), [themeMode]);
  const isDark = themeMode === 'dark';

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            ':root': {
              colorScheme: themeMode,
              '--noc-bg': isDark ? '#0B1120' : '#F4F6F9',
              '--noc-surface': isDark ? '#111827' : '#FFFFFF',
              '--noc-subtle': isDark ? '#0F172A' : '#F8FAFC',
              '--noc-hover': isDark ? '#1E293B' : '#F1F5F9',
              '--noc-border': isDark ? '#1E293B' : '#E2E8F0',
              '--noc-border-strong': isDark ? '#334155' : '#CBD5E1',
              '--noc-text': isDark ? '#F1F5F9' : '#0F172A',
              '--noc-text-muted': isDark ? '#CBD5E1' : '#334155',
              '--noc-text-secondary': isDark ? '#94A3B8' : '#475569',
              '--noc-text-soft': isDark ? '#64748B' : '#64748B',
              '--noc-accent': isDark ? '#38BDF8' : '#0284C7',
              '--noc-accent-bg': isDark ? 'rgba(56, 189, 248, 0.14)' : '#EFF6FF',
              '--noc-accent-hover-bg': isDark ? 'rgba(56, 189, 248, 0.2)' : '#F0F9FF',
            },
            'body, .MuiPaper-root, .MuiAppBar-root, .MuiDrawer-paper, .MuiCard-root, .MuiTableCell-root, .MuiOutlinedInput-root': {
              transition:
                'background-color 320ms cubic-bezier(0.22, 1, 0.36, 1), border-color 320ms cubic-bezier(0.22, 1, 0.36, 1), color 260ms cubic-bezier(0.22, 1, 0.36, 1)',
            },
            'html.theme-switching, html.theme-switching *, html.theme-switching *::before, html.theme-switching *::after': {
              transitionProperty: 'background-color, color, border-color, box-shadow, fill, stroke, filter !important',
              transitionDuration: '340ms !important',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1) !important',
            },
            '@media (prefers-reduced-motion: reduce)': {
              'html.theme-switching, html.theme-switching *, html.theme-switching *::before, html.theme-switching *::after': {
                transition: 'none !important',
              },
            },
          }}
        />
        <BrowserRouter>{children}</BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
