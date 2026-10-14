import { useMemo } from 'react';
import { LineChart } from 'react-native-gifted-charts';

import { Box } from '@/components/ui/box';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryError } from '@/components/ui/query-error';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import type { DailySeriesResult } from '@/types';
import {
  CHART_AXIS_COLOR,
  CHART_LABEL_COLOR,
  CHART_PRIMARY_COLOR,
} from '@/utils/chartPalette';
import { formatDateBucketLabel as formatBucketLabel } from '@/utils/dates';
import { formatCurrency } from '@/utils/formatters';

type DailyChartCardProps = {
  series: DailySeriesResult | undefined;
  title?: string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
  lineColor?: string;
  axisColor?: string;
  labelColor?: string;
};

export function DailyChartCard({
  series,
  title = 'Günlük Ciro',
  isLoading = false,
  isError = false,
  onRetry,
  className,
  lineColor = CHART_PRIMARY_COLOR,
  axisColor = CHART_AXIS_COLOR,
  labelColor = CHART_LABEL_COLOR,
}: DailyChartCardProps) {
  const { points, total, lineData } = useMemo(() => {
    const pts = series?.points ?? [];
    const gran = series?.granularity ?? 'day';
    const tot = pts.reduce((sum, p) => sum + p.sales, 0);
    const data = pts.map((p) => ({
      value: p.sales,
      label: formatBucketLabel(p.bucket, gran),
      dataPointText: p.sales > 0 ? formatCurrency(p.sales) : undefined,
    }));
    return { points: pts, total: tot, lineData: data };
  }, [series]);

  return (
    <Box
      className={`rounded-2xl border border-border bg-card p-4 ${
        className ?? ''
      }`}
    >
      <VStack space="md">
        <Text size="md" bold className="text-foreground">
          {title}
        </Text>

        {isError ? (
          <QueryError onRetry={onRetry} />
        ) : isLoading ? (
          <Spinner label="Yükleniyor…" />
        ) : points.length === 0 || total === 0 ? (
          <EmptyState title="Bu aralıkta veri yok" />
        ) : (
          <Box className="items-center">
            <LineChart
              data={lineData}
              thickness={2}
              color={lineColor}
              hideRules
              yAxisLabelPrefix="₺"
              yAxisTextStyle={{ color: labelColor, fontSize: 11 }}
              xAxisLabelTextStyle={{ color: labelColor, fontSize: 11 }}
              xAxisColor={axisColor}
              yAxisColor={axisColor}
              noOfSections={4}
              spacing={Math.max(28, Math.min(80, 600 / lineData.length))}
              initialSpacing={12}
              isAnimated
              animationDuration={400}
            />
          </Box>
        )}
      </VStack>
    </Box>
  );
}
