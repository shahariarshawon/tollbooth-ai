import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService, TeamMemberRole } from '@tollbooth/database';
import { TeamsService } from './teams.service';
import { AuditService } from '../audit/audit.service';

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: {
    team: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    teamMember: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
    user: {
      findFirst: jest.Mock;
    };
    project: {
      findMany: jest.Mock;
    };
    aiRequest: {
      aggregate: jest.Mock;
    };
  };
  let audit: {
    record: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      team: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      teamMember: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      project: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      aiRequest: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { estimatedCost: 0, totalTokens: 0 } }),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  describe('team limits and creation', () => {
    it('creates a team with custom rate, token, and budget limits', async () => {
      prisma.team.findUnique.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({
        id: 'team-eng',
        tenantId: 'tenant-1',
        name: 'Engineering Team',
        description: 'Core dev squad',
        rateLimitRpm: 120,
        rateLimitRpd: 50_000,
        tokenLimitTpm: 300_000,
        tokenLimitTpd: 10_000_000,
        dailyBudget: 50.0,
        monthlyBudget: 1500.0,
        allowedModels: ['models/gemini-1.5-pro', 'models/gemini-1.5-flash'],
      });

      const team = await service.create('tenant-1', {
        name: 'Engineering Team',
        description: 'Core dev squad',
        rateLimitRpm: 120,
        rateLimitRpd: 50_000,
        tokenLimitTpm: 300_000,
        tokenLimitTpd: 10_000_000,
        dailyBudget: 50.0,
        monthlyBudget: 1500.0,
        allowedModels: ['models/gemini-1.5-pro', 'models/gemini-1.5-flash'],
      });

      expect(team.name).toBe('Engineering Team');
      expect(team.rateLimitRpm).toBe(120);
      expect(team.monthlyBudget).toBe(1500.0);
      expect(team.allowedModels).toEqual(['models/gemini-1.5-pro', 'models/gemini-1.5-flash']);
      expect(prisma.team.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          name: 'Engineering Team',
          rateLimitRpm: 120,
        }),
      });
      expect(audit.record).toHaveBeenCalled();
    });

    it('rejects duplicate team names within the same tenant', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'existing-id', name: 'Marketing Team' });

      await expect(
        service.create('tenant-1', {
          name: 'Marketing Team',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('team membership management', () => {
    it('adds a user to a team with a specific role', async () => {
      prisma.team.findFirst.mockResolvedValue({
        id: 'team-1',
        tenantId: 'tenant-1',
        projects: [],
      });
      prisma.user.findFirst.mockResolvedValue({ id: 'usr-1', tenantId: 'tenant-1' });
      prisma.teamMember.upsert.mockResolvedValue({
        id: 'tm-1',
        teamId: 'team-1',
        userId: 'usr-1',
        role: TeamMemberRole.LEAD,
        user: { id: 'usr-1', email: 'lead@example.com', firstName: 'Lead', lastName: 'Dev' },
      });

      const member = await service.addMember('tenant-1', 'team-1', {
        userId: 'usr-1',
        role: TeamMemberRole.LEAD,
      });

      expect(member.role).toBe(TeamMemberRole.LEAD);
      expect(prisma.teamMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId_userId: { teamId: 'team-1', userId: 'usr-1' } },
          create: { teamId: 'team-1', userId: 'usr-1', role: TeamMemberRole.LEAD },
          update: { role: TeamMemberRole.LEAD },
        }),
      );
    });

    it('throws NotFoundException when adding a non-existent tenant user', async () => {
      prisma.team.findFirst.mockResolvedValue({
        id: 'team-1',
        tenantId: 'tenant-1',
        projects: [],
      });
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.addMember('tenant-1', 'team-1', { userId: 'unknown' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('removes a member from a team', async () => {
      prisma.team.findFirst.mockResolvedValue({
        id: 'team-1',
        tenantId: 'tenant-1',
        projects: [],
      });
      prisma.teamMember.findUnique.mockResolvedValue({
        id: 'tm-1',
        teamId: 'team-1',
        userId: 'usr-1',
      });
      prisma.teamMember.delete.mockResolvedValue({ id: 'tm-1' });

      await service.removeMember('tenant-1', 'team-1', 'usr-1');
      expect(prisma.teamMember.delete).toHaveBeenCalledWith({
        where: { teamId_userId: { teamId: 'team-1', userId: 'usr-1' } },
      });
    });
  });
});
