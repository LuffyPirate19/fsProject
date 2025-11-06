import { Order } from "@/types/order";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StageProgressProps {
  order: Order;
}

const stages = [
  { id: 'order', label: 'Order' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'payment', label: 'Payment' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'completed', label: 'Completed' },
];

export const StageProgress = ({ order }: StageProgressProps) => {
  const currentStageIndex = stages.findIndex(s => s.id === order.currentStage);
  const isFailed = order.status === 'failed';

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStageIndex || (index === currentStageIndex && order.status === 'completed');
          const isCurrent = index === currentStageIndex && order.status !== 'completed';
          const isFailedStage = isCurrent && isFailed;

          return (
            <div key={stage.id} className="flex flex-col items-center flex-1">
              <div className="relative flex items-center w-full">
                {index > 0 && (
                  <div className={cn(
                    "absolute right-1/2 top-1/2 -translate-y-1/2 h-0.5 w-full -z-10",
                    isCompleted ? "bg-success" : "bg-border"
                  )} />
                )}
                
                <div className="relative z-10 mx-auto">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                    isCompleted && "bg-success border-success shadow-lg shadow-success/20",
                    isCurrent && !isFailedStage && "bg-primary border-primary shadow-lg shadow-primary/20 animate-pulse",
                    isFailedStage && "bg-destructive border-destructive shadow-lg shadow-destructive/20",
                    !isCompleted && !isCurrent && "bg-secondary border-border"
                  )}>
                    {isCompleted && <CheckCircle2 className="w-5 h-5 text-success-foreground" />}
                    {isFailedStage && <XCircle className="w-5 h-5 text-destructive-foreground" />}
                    {!isCompleted && !isCurrent && <Circle className="w-5 h-5 text-muted-foreground" />}
                    {isCurrent && !isFailedStage && <div className="w-2 h-2 bg-primary-foreground rounded-full" />}
                  </div>
                </div>

                {index < stages.length - 1 && (
                  <div className={cn(
                    "absolute left-1/2 top-1/2 -translate-y-1/2 h-0.5 w-full -z-10",
                    isCompleted ? "bg-success" : "bg-border"
                  )} />
                )}
              </div>

              <span className={cn(
                "mt-2 text-xs font-medium whitespace-nowrap",
                (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
              )}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
