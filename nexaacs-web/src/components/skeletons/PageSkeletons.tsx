import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';

export function usePageSkeleton(resetKey?: string, delayMs = 0) {
  const [loading, setLoading] = useState(delayMs > 0);
  const timerRef = useRef<number | null>(null);

  const trigger = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (delayMs <= 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(() => {
      setLoading(false);
      timerRef.current = null;
    }, delayMs);
  }, [delayMs]);

  useEffect(() => {
    trigger();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [resetKey, trigger]);

  return { loading, trigger };
}

export const pageEnterSx = {} as const;

const cardSx = {
  borderRadius: '6px',
  borderColor: 'divider',
  bgcolor: 'background.paper',
} as const;

const waveSx = { bgcolor: 'var(--noc-hover)' } as const;

function SkeletonTableCard({
  columns,
  rows,
  titleWidth,
}: {
  columns: number[];
  rows: number;
  titleWidth?: number;
}) {
  return (
    <Card sx={cardSx}>
      {titleWidth && (
        <Box sx={{ px: 2.25, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Skeleton animation="wave" variant="text" width={titleWidth} height={22} sx={waveSx} />
        </Box>
      )}
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'var(--noc-subtle)' }}>
              {columns.map((w, i) => (
                <TableCell key={i} sx={{ py: 1.25 }}>
                  <Skeleton animation="wave" variant="text" width={Math.max(36, w - 12)} height={16} sx={waveSx} />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: rows }).map((_, r) => (
              <TableRow key={r}>
                {columns.map((w, c) => (
                  <TableCell key={c} sx={{ py: 1.4 }}>
                    <Skeleton
                      animation="wave"
                      variant="text"
                      width={c === columns.length - 1 ? Math.min(w, 48) : w}
                      height={18}
                      sx={waveSx}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export function OverviewSkeleton() {
  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <Box>
          <Skeleton animation="wave" variant="text" width={210} height={32} sx={waveSx} />
          <Skeleton animation="wave" variant="text" width={360} height={18} sx={waveSx} />
        </Box>
        <Skeleton animation="wave" variant="rounded" width={150} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
      </Stack>

      <Card sx={{ ...cardSx, mb: 2.5 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={1.5}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Grid key={i} item xs={6} sm={4} md={2}>
                <Skeleton animation="wave" variant="rounded" height={38} sx={{ ...waveSx, borderRadius: '6px' }} />
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Grid key={i} item xs={12} sm={6} md={3}>
            <Card sx={cardSx}>
              <CardContent>
                <Skeleton animation="wave" variant="text" width="55%" height={16} sx={waveSx} />
                <Skeleton animation="wave" variant="text" width="42%" height={40} sx={{ ...waveSx, my: 0.5 }} />
                <Skeleton animation="wave" variant="text" width="75%" height={16} sx={waveSx} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        {[6, 6, 4, 4, 4, 4, 4, 4].map((lgCols, i) => (
          <Grid key={i} item xs={12} md={i >= 5 ? 4 : 6} lg={lgCols}>
            <Card sx={cardSx}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Skeleton animation="wave" variant="text" width="55%" height={24} sx={waveSx} />
                  {i < 2 && <Skeleton animation="wave" variant="rounded" width={88} height={22} sx={{ ...waveSx, borderRadius: '12px' }} />}
                </Stack>
                <Skeleton animation="wave" variant="rounded" height={i >= 5 ? 280 : 230} sx={{ ...waveSx, borderRadius: '6px' }} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export function DevicesSkeleton() {
  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={1.5}
        sx={{ pb: 2, mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Skeleton animation="wave" variant="text" width={160} height={30} sx={waveSx} />
        <Stack direction="row" spacing={1} alignItems="center">
          <Skeleton animation="wave" variant="rounded" width={220} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
          <Skeleton animation="wave" variant="rounded" width={96} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
          <Skeleton animation="wave" variant="rounded" width={118} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
          <Skeleton animation="wave" variant="rounded" width={92} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
        </Stack>
      </Stack>

      <SkeletonTableCard columns={[130, 110, 110, 110, 90, 90, 80, 95, 75]} rows={8} />
    </Box>
  );
}

export function DeviceDetailSkeleton() {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Skeleton animation="wave" variant="rounded" width={30} height={30} sx={{ ...waveSx, borderRadius: '6px' }} />
          <Skeleton animation="wave" variant="text" width={180} height={32} sx={waveSx} />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Skeleton animation="wave" variant="rounded" width={112} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
          <Skeleton animation="wave" variant="rounded" width={96} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Grid key={i} item xs={12} sm={6} lg={3}>
            <Card sx={cardSx}>
              <CardContent sx={{ px: 2, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                  <Skeleton animation="wave" variant="text" width="48%" height={16} sx={waveSx} />
                  <Skeleton animation="wave" variant="rounded" width={54} height={20} sx={{ ...waveSx, borderRadius: '10px' }} />
                </Stack>
                <Skeleton animation="wave" variant="text" width="60%" height={28} sx={waveSx} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ ...cardSx, mb: 2 }}>
        <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
          <Skeleton animation="wave" variant="text" width={140} height={22} sx={{ ...waveSx, mb: 1.75 }} />
          <Grid container spacing={2}>
            {Array.from({ length: 14 }).map((_, i) => (
              <Grid key={i} item xs={6} sm={4} md={3}>
                <Skeleton animation="wave" variant="text" width="42%" height={14} sx={waveSx} />
                <Skeleton animation="wave" variant="text" width="70%" height={20} sx={waveSx} />
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <Box sx={{ mb: 2 }}>
        <SkeletonTableCard columns={[70, 80, 80, 70, 60, 140, 110, 100, 90, 44]} rows={2} titleWidth={145} />
      </Box>

      <Box sx={{ mb: 2 }}>
        <SkeletonTableCard columns={[70, 44, 65, 140, 95, 75, 55, 80, 110, 44]} rows={2} titleWidth={145} />
      </Box>

      <Grid container spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
        <Grid item xs={12} lg={4}>
          <Stack spacing={2}>
            <Card sx={cardSx}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                <Skeleton animation="wave" variant="text" width={150} height={22} sx={{ ...waveSx, mb: 1.75 }} />
                <Grid container spacing={1.5}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Grid key={i} item xs={6}>
                      <Skeleton animation="wave" variant="text" width="60%" height={14} sx={waveSx} />
                      <Skeleton animation="wave" variant="text" width="80%" height={20} sx={waveSx} />
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
            <Card sx={cardSx}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                <Skeleton animation="wave" variant="text" width={80} height={22} sx={{ ...waveSx, mb: 1.75 }} />
                <Stack direction="row" spacing={1}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} animation="wave" variant="rounded" height={36} sx={{ ...waveSx, flex: 1, borderRadius: '6px' }} />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid item xs={12} lg={8}>
          <SkeletonTableCard columns={[140, 140, 110, 130]} rows={3} titleWidth={155} />
        </Grid>
      </Grid>

      <Box sx={{ mb: 2 }}>
        <SkeletonTableCard columns={[90, 130, 90, 75, 280]} rows={4} titleWidth={135} />
      </Box>

      <SkeletonTableCard columns={[260, 145, 170, 60]} rows={5} titleWidth={155} />
    </Box>
  );
}

export function FaultsSkeleton() {
  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={1.5}
        sx={{ pb: 2, mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box>
          <Skeleton animation="wave" variant="text" width={150} height={32} sx={waveSx} />
          <Skeleton animation="wave" variant="text" width={310} height={18} sx={waveSx} />
        </Box>
        <Skeleton animation="wave" variant="rounded" width={92} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
      </Stack>

      <Card sx={{ ...cardSx, mb: 2.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                p: 2.25,
                borderRight: { md: i < 2 ? '1px solid var(--noc-border)' : 'none' },
                borderBottom: { xs: i < 2 ? '1px solid var(--noc-border)' : 'none', md: 'none' },
              }}
            >
              <Skeleton animation="wave" variant="text" width={85} height={18} sx={waveSx} />
              <Skeleton animation="wave" variant="text" width={70} height={40} sx={{ ...waveSx, my: 0.5 }} />
              <Skeleton animation="wave" variant="text" width={140} height={16} sx={waveSx} />
            </Box>
          ))}
        </Box>
      </Card>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1}>
          {[76, 88, 56].map((w, i) => (
            <Skeleton key={i} animation="wave" variant="rounded" width={w} height={32} sx={{ ...waveSx, borderRadius: '6px' }} />
          ))}
        </Stack>
        <Skeleton animation="wave" variant="rounded" width={220} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
      </Stack>

      <SkeletonTableCard columns={[110, 170, 240, 140, 130, 80, 70]} rows={6} />
    </Box>
  );
}

export function FirmwareSkeleton() {
  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Box>
          <Skeleton animation="wave" variant="text" width={260} height={32} sx={waveSx} />
          <Skeleton animation="wave" variant="text" width={430} height={20} sx={waveSx} />
        </Box>
        <Skeleton animation="wave" variant="rounded" width={195} height={36} sx={{ ...waveSx, borderRadius: '6px' }} />
      </Stack>

      <Stack spacing={2}>
        <SkeletonTableCard columns={[105, 95, 150, 70, 80, 110, 85, 85]} rows={4} titleWidth={140} />
        <SkeletonTableCard columns={[110, 130, 90, 180, 90, 95]} rows={3} titleWidth={165} />
      </Stack>
    </Box>
  );
}

export function SecuritySkeleton() {
  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Skeleton animation="wave" variant="text" width={250} height={32} sx={waveSx} />
        <Skeleton animation="wave" variant="text" width={390} height={20} sx={waveSx} />
      </Box>

      <Stack direction="row" spacing={2} sx={{ mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Skeleton animation="wave" variant="rounded" width={160} height={28} sx={{ ...waveSx, borderRadius: '6px' }} />
        <Skeleton animation="wave" variant="rounded" width={120} height={28} sx={{ ...waveSx, borderRadius: '6px' }} />
        <Skeleton animation="wave" variant="rounded" width={165} height={28} sx={{ ...waveSx, borderRadius: '6px' }} />
      </Stack>

      <SkeletonTableCard columns={[170, 260, 95, 90, 90, 90, 80]} rows={8} titleWidth={260} />
    </Box>
  );
}

export function SummonLogsSkeleton() {
  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={1.5}
        sx={{ pb: 2, mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box>
          <Skeleton animation="wave" variant="text" width={190} height={32} sx={waveSx} />
          <Skeleton animation="wave" variant="text" width={320} height={18} sx={waveSx} />
        </Box>
        <Stack direction="row" spacing={1}>
          <Skeleton animation="wave" variant="rounded" width={210} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
          <Skeleton animation="wave" variant="rounded" width={92} height={34} sx={{ ...waveSx, borderRadius: '6px' }} />
        </Stack>
      </Stack>

      <SkeletonTableCard columns={[120, 110, 95, 95, 110, 220, 80]} rows={8} />
    </Box>
  );
}

export function SettingsSkeleton({ section = 'general' }: { section?: string }) {
  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Box>
          <Skeleton animation="wave" variant="text" width={260} height={32} sx={waveSx} />
          <Skeleton animation="wave" variant="text" width={400} height={20} sx={waveSx} />
        </Box>
        {section !== 'aliases' && (
          <Skeleton animation="wave" variant="rounded" width={135} height={36} sx={{ ...waveSx, borderRadius: '6px' }} />
        )}
      </Stack>

      {section === 'aliases' ? (
        <SkeletonTableCard columns={[170, 110, 80, 220, 80, 80, 75]} rows={7} titleWidth={280} />
      ) : (
        <Grid container spacing={2}>
          {[0, 1].map((col) => (
            <Grid key={col} item xs={12} md={6}>
              <Card sx={cardSx}>
                <CardContent>
                  <Skeleton animation="wave" variant="text" width={180} height={24} sx={{ ...waveSx, mb: 2 }} />
                  <Stack spacing={2}>
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <Skeleton key={idx} animation="wave" variant="rounded" height={40} sx={{ ...waveSx, borderRadius: '6px' }} />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
