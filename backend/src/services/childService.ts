import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateChildData {
  name: string;
  date_of_birth?: Date;
  photo_url?: string;
}

export interface UpdateChildData {
  name?: string;
  date_of_birth?: Date;
  photo_url?: string;
}

// Get all children accessible to user (via shared event calendars)
export const getUserChildren = async (userId: string) => {
  // Get all event calendars the user has access to
  const calendars = await prisma.eventCalendar.findMany({
    where: {
      members: {
        some: {
          user_id: userId,
          status: 'accepted',
        },
      },
    },
    select: {
      child_id: true,
    },
  });

  const childIds = [...new Set(calendars.map(c => c.child_id))];

  return prisma.child.findMany({
    where: {
      id: {
        in: childIds,
      },
    },
    include: {
      event_calendars: {
        where: {
          members: {
            some: {
              user_id: userId,
              status: 'accepted',
            },
          },
        },
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};

// Get single child
export const getChildById = async (childId: string, userId: string) => {
  // Verify user has access to this child via event calendars
  const calendar = await prisma.eventCalendar.findFirst({
    where: {
      child_id: childId,
      members: {
        some: {
          user_id: userId,
          status: 'accepted',
        },
      },
    },
  });

  if (!calendar) {
    return null;
  }

  return prisma.child.findUnique({
    where: { id: childId },
    include: {
      event_calendars: {
        where: {
          members: {
            some: {
              user_id: userId,
              status: 'accepted',
            },
          },
        },
      },
    },
  });
};

// Create child
export const createChild = async (data: CreateChildData) => {
  return prisma.child.create({
    data: {
      name: data.name,
      date_of_birth: data.date_of_birth,
      photo_url: data.photo_url,
    },
  });
};

// Update child
export const updateChild = async (
  childId: string,
  userId: string,
  data: UpdateChildData,
) => {
  // Verify user has access to this child
  const hasAccess = await getChildById(childId, userId);

  if (!hasAccess) {
    throw new Error('Child not found or access denied');
  }

  return prisma.child.update({
    where: { id: childId },
    data,
  });
};

// Delete child (only if no event calendars exist)
export const deleteChild = async (childId: string, userId: string) => {
  // Verify user has access
  const child = await getChildById(childId, userId);

  if (!child) {
    throw new Error('Child not found or access denied');
  }

  // Check if child has any event calendars
  const calendarCount = await prisma.eventCalendar.count({
    where: { child_id: childId },
  });

  if (calendarCount > 0) {
    throw new Error('Cannot delete child with existing event calendars');
  }

  return prisma.child.delete({
    where: { id: childId },
  });
};
