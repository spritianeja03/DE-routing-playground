import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface OverallSuccessRateDisplayProps {
  rate: number;
}

export function OverallSuccessRateDisplay({ rate }: OverallSuccessRateDisplayProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Overall Success Rate</CardTitle>
        <TrendingUp className="h-5 w-5 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold text-primary">{rate.toFixed(1)}%</div>
        <p className="text-xs text-muted-foreground">
          Based on current simulation parameters
        </p>
      </CardContent>
    </Card>
  );
}
