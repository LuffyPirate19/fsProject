import { Order } from "@/types/order";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Clock, Package } from "lucide-react";

interface OrderCardProps {
  order: Order;
}

const statusConfig = {
  completed: { label: 'Completed', variant: 'success' as const, icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'destructive' as const, icon: XCircle },
  processing: { label: 'Processing', variant: 'default' as const, icon: Clock },
  pending: { label: 'Pending', variant: 'secondary' as const, icon: Package },
};

export const OrderCard = ({ order }: OrderCardProps) => {
  const navigate = useNavigate();
  const config = statusConfig[order.status];
  const Icon = config.icon;

  return (
    <Card 
      className="p-6 hover:shadow-glow cursor-pointer transition-all duration-300 border-border hover:border-primary/50"
      onClick={() => navigate(`/order/${order.id}`)}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">{order.id}</h3>
          <p className="text-sm text-muted-foreground">{order.customerName}</p>
        </div>
        <Badge variant={config.variant} className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          {config.label}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div>
          <span className="text-muted-foreground">Items:</span>
          <span className="ml-2 text-foreground font-medium">{order.items.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total:</span>
          <span className="ml-2 text-foreground font-semibold">${order.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Created {formatDistanceToNow(order.createdAt, { addSuffix: true })}</span>
          <span className="capitalize">{order.currentStage} stage</span>
        </div>
      </div>
    </Card>
  );
};
