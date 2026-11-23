import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Box } from '@mui/material';

interface EChartBoxProps {
  option: echarts.EChartsCoreOption;
  height?: number;
  onBarClick?: (name: string) => void;
}

export function EChartBox({ option, height = 260, onBarClick }: EChartBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const instance = echarts.init(el);
    chartRef.current = instance;

    const handleResize = () => instance.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      instance.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(option, true);
    chart.off('click');
    if (onBarClick) {
      chart.on('click', (params: { name?: string }) => {
        if (params.name) onBarClick(params.name);
      });
    }
  }, [option, onBarClick]);

  return <Box ref={containerRef} sx={{ width: '100%', height, cursor: onBarClick ? 'pointer' : 'default' }} />;
}
