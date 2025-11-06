import { useParams, useNavigate } from "react-router-dom";
import { useOrders } from "@/hooks/useOrders";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EventTimeline } from "@/components/EventTimeline";
import { StageProgress } from "@/components/StageProgress";
import { ArrowLeft, RefreshCw, AlertTriangle, Package, Loader2, AlertCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { orders, loading, refetch } = useOrders();
  const [retrying, setRetrying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [checkingDiagnostic, setCheckingDiagnostic] = useState(false);
  
  const order = orders.find(o => o.id === orderId);

  // Check if order appears stuck (processing for > 30 seconds)
  const isPotentiallyStuck = order && order.status === 'processing' && 
    order.events.length > 0 && 
    (Date.now() - order.events[order.events.length - 1].timestamp.getTime()) > 30000;

  // Refetch order data when it changes or when retrying
  useEffect(() => {
    if (orderId && !loading) {
      // Small delay to ensure database updates are reflected
      const timeoutId = setTimeout(() => {
        refetch(false);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [orderId, loading, refetch]);

  // Polling effect for order updates
  useEffect(() => {
    if (!isRefreshing || !orderId) return;

    let pollCount = 0;
    const maxPolls = 60; // 60 seconds max (orders can take time to process)
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      await refetch(false);
      
      // Get fresh order status
      const { order: freshOrder } = await apiClient.getOrder(orderId);
      
      // Stop polling if order is completed or failed again, or max polls reached
      if (
        freshOrder?.status === 'completed' || 
        freshOrder?.status === 'failed' ||
        pollCount >= maxPolls
      ) {
        clearInterval(pollInterval);
        setIsRefreshing(false);
        await refetch(false); // Final refresh
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [isRefreshing, orderId, refetch]);

  const handleDiagnostic = async () => {
    if (!orderId) return;
    
    setCheckingDiagnostic(true);
    try {
      const data = await apiClient.diagnoseOrder(orderId);
      setDiagnostic(data);
      
      if (data.isStuck) {
        toast.warning('Order appears to be stuck', {
          description: data.likelyIssue || 'Order has been processing for an extended period'
        });
      } else {
        toast.info('Order diagnostic', {
          description: data.recommendation || 'Order appears to be processing normally'
        });
      }
    } catch (error) {
      console.error('Error diagnosing order:', error);
      toast.error('Failed to diagnose order', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setCheckingDiagnostic(false);
    }
  };

  const handleRetry = async () => {
    if (!order || order.status !== 'failed') return;
    
    setRetrying(true);
    setIsRefreshing(true);
    
    try {
      await apiClient.retryOrder(order.id);

      toast.success('Order retry initiated', {
        description: 'The order is being reprocessed through the pipeline. Page will update automatically.'
      });

      // Immediately refetch to get updated order status
      await refetch(true);
    } catch (error) {
      console.error('Error retrying order:', error);
      toast.error('Failed to retry order', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
      setIsRefreshing(false);
    } finally {
      setRetrying(false);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading order...</p>
        </div>
      </div>
    );
  }

  if (!order && !loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Order Not Found</h1>
          <p className="text-muted-foreground mb-4">The order you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Show loading state while order is being fetched/updated
  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Refreshing order data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-foreground">{order.id}</h1>
                {isRefreshing && (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                )}
              </div>
              <p className="text-muted-foreground">Customer: {order.customerName}</p>
            </div>
            <div className="flex gap-2">
              {order.status === 'failed' && (
                <Button 
                  variant="outline" 
                  className="border-warning text-warning hover:bg-warning/10"
                  onClick={handleRetry}
                  disabled={retrying || isRefreshing}
                >
                  {retrying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry Order
                    </>
                  )}
                </Button>
              )}
              {order.status === 'processing' && (
                <>
                  {isPotentiallyStuck && (
                    <Button 
                      variant="outline" 
                      className="border-warning text-warning hover:bg-warning/10"
                      onClick={handleDiagnostic}
                      disabled={checkingDiagnostic}
                    >
                      {checkingDiagnostic ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 mr-2" />
                          Diagnose
                        </>
                      )}
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    disabled
                    className="border-primary text-primary"
                  >
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </Button>
                </>
              )}
              <Button 
                variant="outline"
                onClick={async () => {
                  setIsRefreshing(true);
                  await refetch(true);
                  setIsRefreshing(false);
                }}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Status</h3>
            <Badge 
              variant={order.status === 'completed' ? 'success' : order.status === 'failed' ? 'destructive' : 'default'}
              className="text-sm"
            >
              {order.status.toUpperCase()}
            </Badge>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Amount</h3>
            <p className="text-2xl font-bold text-foreground">${order.totalAmount.toFixed(2)}</p>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Created At</h3>
            <p className="text-lg font-semibold text-foreground">
              {format(order.createdAt, 'MMM dd, yyyy HH:mm')}
            </p>
          </Card>
        </div>

        <Card className="p-6 mb-8">
          <h2 className="text-xl font-semibold text-foreground mb-6">Pipeline Progress</h2>
          <StageProgress order={order} />
        </Card>

        {order.status === 'failed' && (
          <Card className="p-6 mb-8 border-destructive/50 bg-destructive/5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive mb-1">Order Failed</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  This order encountered an error during processing. Review the event timeline below for details and take corrective action.
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-warning text-warning hover:bg-warning/10"
                  onClick={handleRetry}
                  disabled={retrying || isRefreshing}
                >
                  {retrying ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3 mr-2" />
                      Retry Order
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {order.status === 'processing' && isRefreshing && (
          <Card className="p-6 mb-8 border-primary/50 bg-primary/5">
            <div className="flex items-start gap-3">
              <Loader2 className="w-5 h-5 text-primary mt-0.5 animate-spin" />
              <div>
                <h3 className="font-semibold text-primary mb-1">Order Processing</h3>
                <p className="text-sm text-muted-foreground">
                  The order is being reprocessed. This page will update automatically as the order progresses through the pipeline.
                </p>
              </div>
            </div>
          </Card>
        )}

        {order.status === 'processing' && isPotentiallyStuck && !isRefreshing && (
          <Card className="p-6 mb-8 border-warning/50 bg-warning/5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-warning mb-1">Order May Be Stuck</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  This order has been processing for more than 30 seconds. The next service call may have failed or timed out.
                </p>
                <div className="space-y-2 text-sm mb-3">
                  <div>
                    <span className="text-muted-foreground">Current Stage:</span>
                    <span className="ml-2 font-medium capitalize">{order.currentStage}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Event:</span>
                    <span className="ml-2 font-medium">
                      {order.events[order.events.length - 1]?.eventType} 
                      {' '}({formatDistanceToNow(order.events[order.events.length - 1]?.timestamp || new Date(), { addSuffix: true })})
                    </span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-warning text-warning hover:bg-warning/10"
                  onClick={handleDiagnostic}
                  disabled={checkingDiagnostic}
                >
                  {checkingDiagnostic ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 mr-2" />
                      Diagnose Issue
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {diagnostic && (
          <Card className="p-6 mb-8 border-info/50 bg-info/5">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-semibold text-foreground">Diagnostic Results</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setDiagnostic(null)}
              >
                ×
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span className={`ml-2 font-medium ${diagnostic.isStuck ? 'text-warning' : 'text-success'}`}>
                  {diagnostic.isStuck ? '⚠️ Stuck' : '✓ Processing Normally'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Time Since Last Event:</span>
                <span className="ml-2 font-medium">{diagnostic.timeSinceLastEvent}</span>
              </div>
              {diagnostic.expectedNextStep && (
                <div>
                  <span className="text-muted-foreground">Expected Next:</span>
                  <span className="ml-2 font-medium">{diagnostic.expectedNextStep}</span>
                </div>
              )}
              {diagnostic.likelyIssue && (
                <div className="p-3 bg-warning/10 border border-warning/20 rounded">
                  <span className="text-warning font-medium">Likely Issue:</span>
                  <p className="text-sm text-muted-foreground mt-1">{diagnostic.likelyIssue}</p>
                </div>
              )}
              {diagnostic.recommendation && (
                <div className="p-3 bg-primary/10 border border-primary/20 rounded">
                  <span className="text-primary font-medium">Recommendation:</span>
                  <p className="text-sm text-muted-foreground mt-1">{diagnostic.recommendation}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card className="p-6 mb-8">
          <h2 className="text-xl font-semibold text-foreground mb-2">Order Items</h2>
          <div className="mt-4 space-y-3">
            {order.items.map((item, index) => (
              <div key={index} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div>
                  <p className="font-medium text-foreground">{item.productName}</p>
                  <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                </div>
                <p className="font-semibold text-foreground">${(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold text-foreground mb-6">Event Timeline</h2>
          <EventTimeline events={order.events} />
        </Card>
      </div>
    </div>
  );
}
