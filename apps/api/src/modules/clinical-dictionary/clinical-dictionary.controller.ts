import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ClinicalDictionaryService } from './clinical-dictionary.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller('clinical-dictionary')
export class ClinicalDictionaryController {
  constructor(private readonly dictionaryService: ClinicalDictionaryService) {}

  @Get('icd10')
  @Public() // Allow fast autocomplete for clinical lookup
  searchIcd10(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const results = this.dictionaryService.search(query, parsedLimit);
    return {
      success: true,
      data: results,
      count: results.length,
    };
  }

  @Get('icd10/:code')
  @Public()
  getIcd10ByCode(@Param('code') code: string) {
    const entry = this.dictionaryService.findByCode(code);
    if (!entry) {
      throw new NotFoundException(`ICD-10 code '${code}' not found in dictionary`);
    }
    return {
      success: true,
      data: entry,
    };
  }
}
