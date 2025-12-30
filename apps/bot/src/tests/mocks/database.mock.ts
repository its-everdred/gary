import { mock } from 'bun:test';

export const mockPrisma = {
  nominee: {
    findFirst: mock(() => Promise.resolve(null)),
    findMany: mock(() => Promise.resolve([])),
    findUnique: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve()),
    create: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve())
  },
  flag: {
    findFirst: mock(() => Promise.resolve(null)),
    findMany: mock(() => Promise.resolve([])),
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve())
  }
};

export const resetDatabaseMocks = () => {
  mockPrisma.nominee.findFirst.mockReset();
  mockPrisma.nominee.findMany.mockReset();
  mockPrisma.nominee.findUnique.mockReset();
  mockPrisma.nominee.update.mockReset();
  mockPrisma.nominee.create.mockReset();
  mockPrisma.nominee.delete.mockReset();
  mockPrisma.flag.findFirst.mockReset();
  mockPrisma.flag.findMany.mockReset();
  mockPrisma.flag.findUnique.mockReset();
  mockPrisma.flag.create.mockReset();
  mockPrisma.flag.delete.mockReset();
};