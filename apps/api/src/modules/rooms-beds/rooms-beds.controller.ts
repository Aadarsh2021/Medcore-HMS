import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RoomsBedsService } from './rooms-beds.service';
import {
  CreateRoomDto,
  CreateBedDto,
  AssignBedDto,
  ReleaseBedDto,
  TransferBedDto,
} from './dto/create-room.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentHospital } from '../auth/decorators/current-hospital.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@medcore/types';

@ApiTags('Inpatient Wards, Rooms & Beds')
@Controller('rooms-beds')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@ApiBearerAuth('bearer-token')
export class RoomsBedsController {
  constructor(private readonly roomsBedsService: RoomsBedsService) {}

  @Post('rooms')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new room/ward' })
  async createRoom(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Body() dto: CreateRoomDto,
  ) {
    const data = await this.roomsBedsService.createRoom(hospitalId, actor, dto);
    return {
      success: true,
      data,
      message: 'Room created successfully',
    };
  }

  @Get('rooms')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @ApiOperation({ summary: 'List all rooms with census' })
  async getRooms(
    @CurrentHospital() hospitalId: string,
    @Query('type') type?: string,
    @Query('departmentId') departmentId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const activeBool = isActive !== undefined ? isActive === 'true' : undefined;
    const data = await this.roomsBedsService.getRooms(hospitalId, {
      type,
      departmentId,
      isActive: activeBool,
    });
    return {
      success: true,
      data,
    };
  }

  @Get('rooms/:id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @ApiOperation({ summary: 'Get room details and beds' })
  async getRoomById(
    @CurrentHospital() hospitalId: string,
    @Param('id') roomId: string,
  ) {
    const data = await this.roomsBedsService.getRoomById(hospitalId, roomId);
    return {
      success: true,
      data,
    };
  }

  @Post('beds')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new bed inside a room' })
  async createBed(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Body() dto: CreateBedDto,
  ) {
    const data = await this.roomsBedsService.createBed(hospitalId, actor, dto);
    return {
      success: true,
      data,
      message: 'Bed created successfully',
    };
  }

  @Get('beds')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @ApiOperation({ summary: 'List beds with status and patient assignments' })
  async getBeds(
    @CurrentHospital() hospitalId: string,
    @Query('roomId') roomId?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.roomsBedsService.getBeds(hospitalId, { roomId, status });
    return {
      success: true,
      data,
    };
  }

  @Post('beds/:id/assign')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Admit patient into bed (Concurrency-safe with row locking)' })
  async assignBed(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Param('id') bedId: string,
    @Body() dto: AssignBedDto,
  ) {
    const data = await this.roomsBedsService.assignBed(hospitalId, actor, bedId, dto);
    return {
      success: true,
      data,
      message: 'Patient admitted and bed assigned successfully',
    };
  }

  @Post('beds/:id/release')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Discharge patient and release bed (Concurrency-safe)' })
  async releaseBed(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Param('id') bedId: string,
    @Body() dto: ReleaseBedDto,
  ) {
    const data = await this.roomsBedsService.releaseBed(hospitalId, actor, bedId, dto);
    return {
      success: true,
      data,
      message: 'Patient discharged and bed released successfully',
    };
  }

  @Post('beds/:id/transfer')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN, UserRole.DOCTOR, UserRole.NURSE)
  @ApiOperation({ summary: 'Transfer patient to another bed' })
  async transferBed(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Param('id') currentBedId: string,
    @Body() dto: TransferBedDto,
  ) {
    const data = await this.roomsBedsService.transferBed(hospitalId, actor, currentBedId, dto);
    return {
      success: true,
      data,
      message: 'Patient transferred successfully',
    };
  }
}
