import { OrderEvent } from "@/types/order";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface EventTimelineProps {
  events: OrderEvent[];
}

interface EventSection {
  attemptNumber: number;
  attemptLabel: string;
  events: OrderEvent[];
}

const eventConfig: Record<OrderEvent['eventType'], { color: string; icon: any; label: string }> = {
  OrderCreated: { color: 'primary', icon: Clock, label: 'Order Created' },
  InventoryReserved: { color: 'success', icon: CheckCircle2, label: 'Inventory Reserved' },
  InventoryFailed: { color: 'destructive', icon: XCircle, label: 'Inventory Failed' },
  PaymentAuthorized: { color: 'success', icon: CheckCircle2, label: 'Payment Authorized' },
  PaymentFailed: { color: 'destructive', icon: XCircle, label: 'Payment Failed' },
  OrderShipped: { color: 'success', icon: CheckCircle2, label: 'Order Shipped' },
  OrderFailed: { color: 'destructive', icon: XCircle, label: 'Order Failed' },
  CompensationStarted: { color: 'warning', icon: AlertCircle, label: 'Compensation Started' },
  OrderRetried: { color: 'primary', icon: RefreshCw, label: 'Order Retried' },
};

function groupEventsByRetry(events: OrderEvent[]): EventSection[] {
  if (events.length === 0) return [];

  const sections: EventSection[] = [];
  let currentSection: OrderEvent[] = [];
  let attemptNumber = 1;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // If we encounter OrderRetried, finalize current section and start new one
    if (event.eventType === 'OrderRetried') {
      // Save current section if it has events
      if (currentSection.length > 0) {
        sections.push({
          attemptNumber: attemptNumber,
          attemptLabel: attemptNumber === 1 ? 'Initial Attempt' : `Retry Attempt #${attemptNumber}`,
          events: [...currentSection],
        });
      }
      
      // Start new section with this OrderRetried event
      currentSection = [event];
      attemptNumber++;
    } else {
      // Add event to current section
      currentSection.push(event);
    }
  }

  // Add the final section if it has events
  if (currentSection.length > 0) {
    sections.push({
      attemptNumber: attemptNumber,
      attemptLabel: attemptNumber === 1 ? 'Initial Attempt' : `Retry Attempt #${attemptNumber}`,
      events: currentSection,
    });
  }

  return sections;
}

export const EventTimeline = ({ events }: EventTimelineProps) => {
  const sections = groupEventsByRetry(events);

  if (sections.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No events found
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((section, sectionIndex) => {
        const isLastSection = sectionIndex === sections.length - 1;

        return (
          <div key={section.attemptNumber} className="relative">
            {/* Section Header */}
            <div className="mb-4">
              <Card className="p-4 bg-muted/50 border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    {section.attemptNumber}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{section.attemptLabel}</h3>
                    <p className="text-xs text-muted-foreground">
                      {section.events.length} event{section.events.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Section Events */}
            <div className="space-y-6 ml-6 pl-6 border-l-2 border-primary/20">
              {section.events.map((event, eventIndex) => {
                const config = eventConfig[event.eventType] || {
                  color: 'primary',
                  icon: Clock,
                  label: event.eventType,
                };
                const Icon = config.icon;
                const isLastEvent = eventIndex === section.events.length - 1;

                return (
                  <div key={event.id} className="relative">
                    {!isLastEvent && (
                      <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-border" />
                    )}
                    
                    <div className="flex gap-4">
                      <div className={cn(
                        "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center",
                        config.color === 'success' && "bg-success/10 text-success",
                        config.color === 'destructive' && "bg-destructive/10 text-destructive",
                        config.color === 'warning' && "bg-warning/10 text-warning",
                        config.color === 'primary' && "bg-primary/10 text-primary"
                      )}>
                        <Icon className="w-6 h-6" />
                      </div>

                      <div className="flex-1 bg-card border border-border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-foreground">{config.label}</h4>
                          <span className="text-xs text-muted-foreground">
                            {format(event.timestamp, 'MMM dd, HH:mm:ss')}
                          </span>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Service:</span>
                            <code className="px-2 py-0.5 bg-secondary rounded text-xs font-mono text-foreground">
                              {event.metadata.service}
                            </code>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Event ID:</span>
                            <code className="text-xs font-mono text-muted-foreground">{event.id}</code>
                          </div>

                          {event.metadata.error && (
                            <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded">
                              <p className="text-xs text-destructive font-medium">Error: {event.metadata.error}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Section Separator (except for last section) */}
            {!isLastSection && (
              <div className="my-8 flex items-center gap-4">
                <div className="flex-1 h-px bg-border"></div>
                <div className="px-4 py-2 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                  Next Attempt
                </div>
                <div className="flex-1 h-px bg-border"></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
