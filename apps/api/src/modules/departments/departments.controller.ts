import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/create-department.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentHospital } from '../auth/decorators/current-hospital.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@medcore/types';

@ApiTags('Departments')
@Controller('departments')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@ApiBearerAuth('bearer-token')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new department in the hospital' })
  @ApiResponse({ status: 201, description: 'Department created successfully' })
  async create(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Body() dto: CreateDepartmentDto,
  ) {
    const data = await this.departmentsService.createDepartment(hospitalId, actor, dto);
    return {
      success: true,
      data,
      message: 'Department created successfully',
    };
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    UserRole.PHARMACIST,
    UserRole.LAB_TECHNICIAN,
    UserRole.ACCOUNTANT,
    UserRole.PATIENT,
  )
  @ApiOperation({ summary: 'List departments with active doctor counts and census' })
  async list(
    @CurrentHospital() hospitalId: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const activeBool = isActive !== undefined ? isActive === 'true' : undefined;
    const data = await this.departmentsService.getDepartments(hospitalId, {
      isActive: activeBool,
      search,
    });
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.HOSPITAL_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    UserRole.PHARMACIST,
    UserRole.LAB_TECHNICIAN,
    UserRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Get department details by ID' })
  async getById(
    @CurrentHospital() hospitalId: string,
    @Param('id') departmentId: string,
  ) {
    const data = await this.departmentsService.getDepartmentById(hospitalId, departmentId);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Update department details or head of department' })
  async update(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Param('id') departmentId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    const data = await this.departmentsService.updateDepartment(hospitalId, actor, departmentId, dto);
    return {
      success: true,
      data,
      message: 'Department updated successfully',
    };
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.HOSPITAL_ADMIN)
  @ApiOperation({ summary: 'Delete or deactivate department safely' })
  async delete(
    @CurrentHospital() hospitalId: string,
    @CurrentUser() actor: { id: string; role: string },
    @Param('id') departmentId: string,
  ) {
    const result = await this.departmentsService.deleteDepartment(hospitalId, actor, departmentId);
    return {
      success: true,
      ...result,
    };
  }
}
