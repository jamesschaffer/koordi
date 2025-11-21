import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getChildren, createChild, updateChild, deleteChild, getCalendars, type Child, type CreateChildData, type EventCalendar } from '@/lib/api-calendars';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Calendar, User } from 'lucide-react';
import { toast } from 'sonner';

type DialogMode = 'add' | 'edit' | null;

function Children() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  // State
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Fetch children
  const { data: children = [], isLoading: isLoadingChildren } = useQuery({
    queryKey: ['children'],
    queryFn: () => getChildren(token),
  });

  // Fetch calendars to show child associations
  const { data: calendars = [] } = useQuery({
    queryKey: ['calendars'],
    queryFn: () => getCalendars(token),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateChildData) => createChild(data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
      toast.success('Child added successfully!');
      closeDialog();
    },
    onError: (error: any) => {
      toast.error('Failed to add child', {
        description: error.response?.data?.message || 'Please try again',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateChildData> }) =>
      updateChild(id, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
      toast.success('Child updated successfully!');
      closeDialog();
    },
    onError: (error: any) => {
      toast.error('Failed to update child', {
        description: error.response?.data?.message || 'Please try again',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteChild(id, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['children'] });
      queryClient.invalidateQueries({ queryKey: ['calendars'] });
      toast.success('Child deleted successfully!');
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast.error('Failed to delete child', {
        description: error.response?.data?.message || 'Please try again',
      });
    },
  });

  // Dialog handlers
  const openAddDialog = () => {
    setDialogMode('add');
    setName('');
    setDateOfBirth('');
    setPhotoUrl('');
    setPhotoFile(null);
    setSelectedChild(null);
  };

  const openEditDialog = (child: Child) => {
    setDialogMode('edit');
    setSelectedChild(child);
    setName(child.name);
    setDateOfBirth(child.date_of_birth || '');
    setPhotoUrl(child.photo_url || '');
    setPhotoFile(null);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setSelectedChild(null);
    setName('');
    setDateOfBirth('');
    setPhotoUrl('');
    setPhotoFile(null);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }

    const data: CreateChildData = {
      name: name.trim(),
      date_of_birth: dateOfBirth || undefined,
      photo_url: photoUrl || undefined,
    };

    if (dialogMode === 'add') {
      createMutation.mutate(data);
    } else if (dialogMode === 'edit' && selectedChild) {
      updateMutation.mutate({ id: selectedChild.id, data });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Photo must be less than 5MB');
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getChildCalendars = (childId: string): EventCalendar[] => {
    return calendars.filter((cal) => cal.child.id === childId);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const calculateAge = (dateString?: string) => {
    if (!dateString) return null;
    const birthDate = new Date(dateString);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (isLoadingChildren) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading children...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Children</h1>
          <p className="text-gray-600 mt-1">Manage your children and their information</p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Child
        </Button>
      </div>

      {/* Children Grid */}
      {children.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No children yet</h3>
            <p className="text-gray-600 text-center mb-6">
              Add your first child to start managing their calendars and schedules.
            </p>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Child
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {children.map((child) => {
            const childCalendars = getChildCalendars(child.id);
            const age = calculateAge(child.date_of_birth);

            return (
              <Card key={child.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {child.photo_url ? (
                        <img
                          src={child.photo_url}
                          alt={child.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="h-6 w-6 text-blue-600" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-lg">{child.name}</CardTitle>
                        {child.date_of_birth && (
                          <CardDescription>
                            {age !== null && `Age ${age}`}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(child)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDeleteConfirmId(child.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {child.date_of_birth && (
                    <div>
                      <p className="text-sm text-gray-600">Date of Birth</p>
                      <p className="text-sm font-medium">{formatDate(child.date_of_birth)}</p>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Calendars
                      </p>
                      <Badge variant="secondary">{childCalendars.length}</Badge>
                    </div>
                    {childCalendars.length > 0 ? (
                      <div className="space-y-2">
                        {childCalendars.map((cal) => (
                          <div
                            key={cal.id}
                            className="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded"
                          >
                            <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: cal.color }}
                            />
                            <span className="truncate">{cal.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No calendars yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === 'add' ? 'Add Child' : 'Edit Child'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'add'
                ? 'Add a new child to your family.'
                : 'Update child information.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Photo Upload */}
            <div className="space-y-2">
              <Label>Photo (optional)</Label>
              <div className="flex items-center gap-4">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Preview"
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                    <User className="h-10 w-10 text-gray-400" />
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-gray-500 mt-1">Max 5MB. JPG, PNG, or GIF.</p>
                </div>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter child's name"
              />
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth (optional)</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              )}
              {dialogMode === 'add' ? 'Add Child' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Child</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this child? This will also remove all associated
              calendars. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default Children;
