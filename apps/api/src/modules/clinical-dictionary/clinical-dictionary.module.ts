import { Module, Global } from '@nestjs/common';
import { ClinicalDictionaryService } from './clinical-dictionary.service';
import { ClinicalDictionaryController } from './clinical-dictionary.controller';

@Global()
@Module({
  controllers: [ClinicalDictionaryController],
  providers: [ClinicalDictionaryService],
  exports: [ClinicalDictionaryService],
})
export class ClinicalDictionaryModule {}
