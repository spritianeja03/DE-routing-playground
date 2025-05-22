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
        <CardTitle className="flex items-center"><BarChart3 className="mr-2 h-6 w-6 text-primary" /> Processor-wise Stats</CardTitle>
        <CardDescription>Success rate, successful payments, and total payments per processor.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Processor</TableHead>
              <TableHead className="text-right">SR (%)</TableHead>
              <TableHead className="text-right">Successful Payments</TableHead>
              <TableHead className="text-right">Total Payments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.processor}>
                <TableCell className="font-medium">{item.processor}</TableCell>
                <TableCell className="text-right text-green-400">{item.sr.toFixed(1)}</TableCell>
                <TableCell className="text-right">{item.successfulPaymentCount.toLocaleString()}</TableCell>
                <TableCell className="text-right">{item.totalPaymentCount.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
