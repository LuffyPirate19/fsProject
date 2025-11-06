import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client";
import { useOrders } from "@/hooks/useOrders";
import { toast } from "sonner";
import { Loader2, Zap } from "lucide-react";

interface LoadGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LoadGeneratorDialog = ({ open, onOpenChange }: LoadGeneratorDialogProps) => {
  const { refetch } = useOrders();
  const [count, setCount] = useState(10);
  const [delayMs, setDelayMs] = useState(500);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    try {
      const data = await apiClient.generateLoad(count, delayMs);

      toast.success("Load test completed", {
        description: data.message || `Generated ${count} synthetic orders`
      });
      
      // Refetch orders to show the new orders
      await refetch(true);
      
      onOpenChange(false);
    } catch (error) {
      console.error("Error generating load:", error);
      toast.error("Failed to generate load", {
        description: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Load Generator</DialogTitle>
          <DialogDescription>
            Generate synthetic orders to test the pipeline under load. This will create random orders with realistic data.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="count">Number of Orders</Label>
            <Input
              id="count"
              type="number"
              min="1"
              max="100"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              className="bg-secondary"
            />
            <p className="text-xs text-muted-foreground">
              Generate between 1-100 orders
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delay">Delay Between Orders (ms)</Label>
            <Input
              id="delay"
              type="number"
              min="0"
              max="5000"
              step="100"
              value={delayMs}
              onChange={(e) => setDelayMs(parseInt(e.target.value) || 0)}
              className="bg-secondary"
            />
            <p className="text-xs text-muted-foreground">
              Delay in milliseconds between creating each order (0-5000ms)
            </p>
          </div>

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h4 className="font-semibold text-sm">Estimated Duration</h4>
            <p className="text-2xl font-bold text-primary">
              ~{((count * delayMs) / 1000).toFixed(1)}s
            </p>
            <p className="text-xs text-muted-foreground">
              Plus processing time for each order through the pipeline
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Start Load Test
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
