import { Card } from "@/components/ui/card";
import { ArrowUpRight, LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type TrendBarsProps = {
  values: number[];
  color?: string;
};

const TrendBars = ({ values, color = "hsl(var(--foreground))" }: TrendBarsProps) => {
  if (!values.length) return null;
  const lastValues = values.slice(-10); // keep the sparkline compact
  const max = Math.max(...lastValues, 0);
  return (
    <div
      className="flex h-8 w-16 items-end gap-[3px] rounded-md bg-muted/70 px-2 py-1"
      aria-hidden
    >
      {lastValues.map((val, idx) => {
        const height = max > 0 ? Math.max(2, (val / max) * 28) : 2;
        return (
          <div
            key={idx}
            className="w-[6px] rounded-sm"
            style={{ height, background: color }}
          />
        );
      })}
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: ReactNode;
  icon?: LucideIcon;
  trend?: {
    values: number[];
    color?: string;
  };
  onClick?: () => void;
  actionLabel?: string;
}

export const StatCard = ({
  title,
  value,
  icon: Icon,
  trend,
  onClick,
  actionLabel,
}: StatCardProps) => {
  return (
    <Card
      className={`relative p-4 transition-all hover:shadow-lg border-border/50 ${
        onClick ? "cursor-pointer" : ""
      }`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm sm:text-base font-medium text-muted-foreground">
          {title}
        </p>
        <div className="rounded-lg flex items-center justify-center">
          {trend ? (
            <TrendBars values={trend.values} color={trend.color} />
          ) : Icon ? (
            <div className="bg-primary/10 rounded-lg p-1.5 sm:p-2">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-start justify-between">
        <p className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
          {value}
        </p>
      </div>
      {actionLabel && (
        <div className="absolute bottom-2 right-3 inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-primary">
          <span className="lowercase">{actionLabel}</span>
          <ArrowUpRight className="h-3 w-3" />
        </div>
      )}
    </Card>
  );
};
