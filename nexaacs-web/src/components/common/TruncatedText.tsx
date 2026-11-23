import { memo } from 'react';
import { Box, Tooltip } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

interface TruncatedTextProps {
  text?: string | null;
  tooltip?: string;
  fallback?: string;
  sx?: SxProps<Theme>;
}

/**
 * Renders single-line truncated text with ellipsis (...) and a full-text Tooltip
 * so data tables remain compact without horizontal scrolling.
 */
export const TruncatedText = memo(function TruncatedText({
  text,
  tooltip,
  fallback = '-',
  sx,
}: TruncatedTextProps) {
  const clean = text === undefined || text === null ? '' : String(text);
  const display = clean.length > 0 ? clean : fallback;
  const tipText = tooltip ?? clean;
  return (
    <Tooltip
      title={tipText}
      placement="top"
      enterDelay={350}
      disableInteractive
      disableFocusListener
      disableTouchListener
      disableHoverListener={!tipText}
    >
      <Box
        component="span"
        sx={{
          display: 'block',
          width: '100%',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          ...sx,
        }}
      >
        {display}
      </Box>
    </Tooltip>
  );
});
