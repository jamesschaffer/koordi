import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface OperationBlockingModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  showElapsedTime?: boolean;
  elapsedTimeThreshold?: number; // seconds before showing elapsed time
}

export function OperationBlockingModal({
  isOpen,
  title,
  message,
  showElapsedTime = true,
  elapsedTimeThreshold = 10,
}: OperationBlockingModalProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Start timer when modal opens
  useEffect(() => {
    if (isOpen) {
      setStartTime(Date.now());
      setElapsedSeconds(0);
    } else {
      setStartTime(null);
      setElapsedSeconds(0);
    }
  }, [isOpen]);

  // Update elapsed time every second
  useEffect(() => {
    if (!isOpen || !startTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, startTime]);

  const showTimer = showElapsedTime && elapsedSeconds >= elapsedTimeThreshold;

  return (
    <Dialog open={isOpen} onOpenChange={() => {/* Prevent closing */}}>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />

          <div className="text-center space-y-3">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {message}
            </p>

            {showTimer && (
              <p className="text-xs text-muted-foreground pt-2">
                ({elapsedSeconds} seconds elapsed - large calendars can take up to 90 seconds)
              </p>
            )}
          </div>

          <div className="text-xs text-muted-foreground text-center max-w-sm">
            Please do not close this window or navigate away.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
