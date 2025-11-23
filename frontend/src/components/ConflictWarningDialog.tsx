import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Calendar, MapPin, AlertTriangle } from 'lucide-react';

interface ConflictEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  is_all_day: boolean;
  event_calendar: {
    name: string;
    color: string;
    child: {
      name: string;
    };
  };
}

interface ConflictWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictEvent[];
  onConfirm: () => void;
  assigneeName?: string;
}

export function ConflictWarningDialog({
  open,
  onOpenChange,
  conflicts,
  onConfirm,
  assigneeName,
}: ConflictWarningDialogProps) {
  const formatDateTime = (dateString: string, isAllDay: boolean) => {
    const date = new Date(dateString);
    if (isAllDay) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
            <AlertDialogTitle className="text-xl">
              Scheduling Conflict Detected
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base">
            {assigneeName && (
              <>
                This assignment will create <strong>{conflicts.length}</strong>{' '}
                scheduling {conflicts.length === 1 ? 'conflict' : 'conflicts'} for{' '}
                <strong>{assigneeName}</strong>.
              </>
            )}
            {!assigneeName && (
              <>
                This assignment will create <strong>{conflicts.length}</strong>{' '}
                scheduling {conflicts.length === 1 ? 'conflict' : 'conflicts'}.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-4">
          <p className="text-sm font-medium text-muted-foreground">
            Conflicting Events:
          </p>
          {conflicts.map((event) => (
            <div
              key={event.id}
              className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-1 h-16 rounded-full shrink-0"
                  style={{ backgroundColor: event.event_calendar.color }}
                />
                <div className="flex-1 space-y-2">
                  <div>
                    <h4 className="font-semibold text-sm">{event.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      {event.event_calendar.child.name} •{' '}
                      {event.event_calendar.name}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {formatDateTime(event.start_time, event.is_all_day)}
                      {!event.is_all_day && (
                        <> - {formatDateTime(event.end_time, event.is_all_day)}</>
                      )}
                    </span>
                  </div>

                  {event.location && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span>{event.location}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <strong>Note:</strong> Assigning this event may create overlapping time
            commitments. Consider the drive times and event durations before
            proceeding.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel Assignment</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Assign Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
