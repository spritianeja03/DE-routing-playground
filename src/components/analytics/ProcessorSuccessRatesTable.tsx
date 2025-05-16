import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProcessorSuccessRate } from '@/lib/types';
import { BarChart3 } from "lucide-react";

interface ProcessorSuccessRatesTableProps {
  data: ProcessorSuccessRate[];
}

export function ProcessorSuccessRatesTable({ data }: ProcessorSuccessRatesTableProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center"><BarChart3 className="mr-2 h-6 w-6 text-primary" /> Processor-wise SRs</CardTitle>
        <CardDescription>Success rate, failure rate, and volume share per processor.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Processor</TableHead>
              <TableHead className="text-right">SR (%)</TableHead>
              <TableHead className="text-right">Failure (%)</TableHead>
              <TableHead className="text-right">Volume Share (%)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.processor}>
                <TableCell className="font-medium">{item.processor}</TableCell>
                <TableCell className="text-right text-green-400">{item.sr.toFixed(1)}</TableCell>
                <TableCell className="text-right text-red-400">{item.failureRate.toFixed(1)}</TableCell>
                <TableCell className="text-right">{item.volumeShare.toFixed(1)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
