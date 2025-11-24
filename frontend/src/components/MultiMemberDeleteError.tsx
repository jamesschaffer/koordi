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

interface MultiMemberDeleteErrorProps {
  isOpen: boolean;
  memberCount: number;
  onClose: () => void;
  onViewMembers: () => void;
}

export function MultiMemberDeleteError({
  isOpen,
  memberCount,
  onClose,
  onViewMembers,
}: MultiMemberDeleteErrorProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cannot Delete Calendar with Multiple Members</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              This calendar has <span className="font-semibold">{memberCount} members</span>. You must remove all other members
              before deleting the calendar.
            </p>
            <p className="text-sm">
              This ensures their Google Calendars are properly cleaned up and no events are orphaned.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            onClose();
            onViewMembers();
          }}>
            View Members
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
