import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MedicineSearchItemData } from '@medcore/types';

@Injectable()
export class MedicinesService {
  constructor(private readonly prisma: PrismaService) {}

  async searchMedicines(
    tenantId: string | null,
    query: string | undefined,
    limit = 20,
  ): Promise<MedicineSearchItemData[]> {
    if (!tenantId) {
      throw new BadRequestException('Tenant hospital context is required');
    }

    const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const searchTerm = (query || '').trim();

    if (!searchTerm) {
      const records = await this.prisma.medicine.findMany({
        where: { hospitalId: tenantId },
        orderBy: { name: 'asc' },
        take: boundedLimit,
      });

      return records.map((m) => this.mapToDto(m));
    }

    // Fetch candidate matches for tenant
    const candidates = await this.prisma.medicine.findMany({
      where: {
        hospitalId: tenantId,
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { genericName: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      take: 100, // Fetch top candidates to rank deterministically
    });

    const lowerSearch = searchTerm.toLowerCase();

    // Deterministic ranking:
    // 1. Exact name match
    // 2. Name starts with query
    // 3. Generic name starts with query
    // 4. Name contains query
    // 5. Generic name contains query
    // Secondary sort: Alphabetical by name
    const ranked = candidates.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aGen = a.genericName.toLowerCase();
      const bGen = b.genericName.toLowerCase();

      const getRank = (name: string, gen: string) => {
        if (name === lowerSearch) return 1;
        if (name.startsWith(lowerSearch)) return 2;
        if (gen.startsWith(lowerSearch)) return 3;
        if (name.includes(lowerSearch)) return 4;
        if (gen.includes(lowerSearch)) return 5;
        return 6;
      };

      const rankA = getRank(aName, aGen);
      const rankB = getRank(bName, bGen);

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      return a.name.localeCompare(b.name);
    });

    return ranked.slice(0, boundedLimit).map((m) => this.mapToDto(m));
  }

  private mapToDto(m: any): MedicineSearchItemData {
    return {
      id: m.id,
      hospitalId: m.hospitalId,
      name: m.name,
      genericName: m.genericName,
      category: m.category,
      form: m.form,
      strength: m.strength,
      manufacturer: m.manufacturer,
    };
  }
}
