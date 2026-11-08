"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function MonthlyChart({
  data,
  currency,
}: {
  data: { month: string; invoiceValueMinor: string; paidValueMinor: string; invoiceCount: number }[];
  currency: string;
}) {
  const series = data.map((row) => ({
    month: new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),
    invoiced: Number(BigInt(row.invoiceValueMinor)) / 100,
    paid: Number(BigInt(row.paidValueMinor)) / 100,
    count: row.invoiceCount,
  }));

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#667085" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 10, fill: "#667085" }}
            tickFormatter={(value: number) =>
              new Intl.NumberFormat("en-IN", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(value)
            }
          />
          <Tooltip
            formatter={(value, name) => [
              new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency,
                maximumFractionDigits: 2,
              }).format(Number(value)),
              name === "invoiced" ? "Invoiced" : "Confirmed paid",
            ]}
            contentStyle={{
              fontSize: 11,
              borderRadius: 8,
              border: "1px solid #e4e7ec",
              boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{ fontSize: 11, color: "#667085" }}
            formatter={(value) => (value === "invoiced" ? "Invoiced" : "Confirmed paid")}
          />
          <Bar dataKey="invoiced" fill="#4338ca" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey="paid" fill="#a5b4fc" radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
