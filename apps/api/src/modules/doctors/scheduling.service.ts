import { Injectable, BadRequestException } from '@nestjs/common';
import {
  DoctorAvailabilityWindowDto,
  DoctorSlotDto,
} from '@medcore/types';

export interface LeaveInterval {
  startDate: Date;
  endDate: Date;
}

@Injectable()
export class SchedulingService {
  /**
   * Converts a "HH:mm" 24-hour time string to minutes from midnight (0..1439).
   */
  timeToMinutes(timeStr: string): number {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr);
    if (!match) {
      throw new BadRequestException(`Invalid time format '${timeStr}'. Expected HH:mm (24-hour format).`);
    }
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  /**
   * Converts minutes from midnight back to "HH:mm" string.
   */
  minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Validates that availability windows on the same weekday do NOT overlap.
   * Adjacent windows (e.g. 09:00-13:00 and 13:00-17:00) are explicitly permitted.
   */
  validateNoOverlappingWindows(windows: DoctorAvailabilityWindowDto[]): void {
    // Group windows by dayOfWeek (0..6)
    const dayGroups = new Map<number, DoctorAvailabilityWindowDto[]>();

    for (const w of windows) {
      if (w.dayOfWeek < 0 || w.dayOfWeek > 6) {
        throw new BadRequestException(`Invalid dayOfWeek '${w.dayOfWeek}'. Must be between 0 (Sunday) and 6 (Saturday).`);
      }

      const startMin = this.timeToMinutes(w.startTime);
      const endMin = this.timeToMinutes(w.endTime);

      if (startMin >= endMin) {
        throw new BadRequestException(
          `Invalid window on day ${w.dayOfWeek}: startTime (${w.startTime}) must be strictly earlier than endTime (${w.endTime}).`
        );
      }

      if (w.slotDurationMinutes !== undefined && w.slotDurationMinutes <= 0) {
        throw new BadRequestException(`slotDurationMinutes must be greater than 0.`);
      }

      const list = dayGroups.get(w.dayOfWeek) || [];
      list.push(w);
      dayGroups.set(w.dayOfWeek, list);
    }

    // Check pairwise overlap within each weekday
    for (const [day, dayWindows] of dayGroups.entries()) {
      // Sort windows by start minutes ascending
      const sorted = [...dayWindows].sort((a, b) => {
        return this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime);
      });

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        const currentEnd = this.timeToMinutes(current.endTime);
        const nextStart = this.timeToMinutes(next.startTime);

        // Strict inequality: overlap occurs if currentEnd > nextStart
        // If currentEnd === nextStart, they are adjacent and allowed.
        if (currentEnd > nextStart) {
          throw new BadRequestException(
            `Overlapping availability windows detected on day ${day}: [${current.startTime}-${current.endTime}] overlaps with [${next.startTime}-${next.endTime}].`
          );
        }
      }
    }
  }

  /**
   * Resolves the authoritative timezone from hospital settings.
   * Defaults to 'Asia/Kolkata' if absent or invalid.
   */
  resolveHospitalTimezone(settings: any): string {
    const candidate = settings?.timezone;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: candidate.trim() });
        return candidate.trim();
      } catch {
        // Invalid IANA timezone, fall back to safe default
      }
    }
    return 'Asia/Kolkata';
  }

  /**
   * Given a calendar date string "YYYY-MM-DD", returns the day of the week (0=Sunday..6=Saturday).
   */
  getDayOfWeekForDate(dateStr: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) {
      throw new BadRequestException(`Invalid date format '${dateStr}'. Expected YYYY-MM-DD.`);
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    // Using noon UTC guarantees standard calendar day of week calculation
    const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return utcDate.getUTCDay();
  }

  /**
   * Converts a local date string "YYYY-MM-DD" and local time "HH:mm" in a specific IANA timezone
   * to an exact UTC Date object.
   */
  parseLocalTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);

    const utcApprox = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(utcApprox);
    const getPart = (type: string) => Number(parts.find((p) => p.type === type)?.value);

    let targetHour = getPart('hour');
    if (targetHour === 24) targetHour = 0;

    const targetAsUtc = Date.UTC(
      getPart('year'),
      getPart('month') - 1,
      getPart('day'),
      targetHour,
      getPart('minute'),
      getPart('second') || 0
    );

    const offsetMs = targetAsUtc - utcApprox.getTime();
    return new Date(utcApprox.getTime() - offsetMs);
  }

  /**
   * Pure schedule-derived slot generation:
   * 1. Filters active availability windows for the day of the week.
   * 2. Partitions each window into slot intervals of length `slotDurationMinutes`.
   * 3. Blocks any slot that mathematically intersects any leave interval:
   *    slotStart < leave.endDate && slotEnd > leave.startDate
   * 4. Returns deterministic non-overlapping slot list.
   */
  generateSlots(
    windows: DoctorAvailabilityWindowDto[],
    leaves: LeaveInterval[],
    dateStr: string,
    timezone: string,
  ): DoctorSlotDto[] {
    const dayOfWeek = this.getDayOfWeekForDate(dateStr);
    const activeWindows = windows.filter(
      (w) => w.dayOfWeek === dayOfWeek && (w.isActive !== false)
    );

    if (activeWindows.length === 0) {
      return [];
    }

    // Sort active windows by start time
    const sortedWindows = [...activeWindows].sort(
      (a, b) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime)
    );

    const availableSlots: DoctorSlotDto[] = [];

    for (const window of sortedWindows) {
      // Slot duration is authoritative from the persisted window configuration
      const duration =
        window.slotDurationMinutes && window.slotDurationMinutes > 0
          ? window.slotDurationMinutes
          : 30;

      const windowStartMin = this.timeToMinutes(window.startTime);
      const windowEndMin = this.timeToMinutes(window.endTime);

      for (let cur = windowStartMin; cur + duration <= windowEndMin; cur += duration) {
        const slotStartStr = this.minutesToTime(cur);
        const slotEndStr = this.minutesToTime(cur + duration);

        const slotStartUtc = this.parseLocalTimeToUtc(dateStr, slotStartStr, timezone);
        const slotEndUtc = this.parseLocalTimeToUtc(dateStr, slotEndStr, timezone);

        // Mathematical interval overlap test:
        // [A, B] intersects [C, D] iff A < D && B > C
        const isBlocked = leaves.some(
          (leave) => slotStartUtc < leave.endDate && slotEndUtc > leave.startDate
        );

        if (!isBlocked) {
          availableSlots.push({
            startTime: slotStartStr,
            endTime: slotEndStr,
          });
        }
      }
    }

    return availableSlots;
  }
}
