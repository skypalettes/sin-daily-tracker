import { Schedule } from "../types";
import { compareSchedules } from "../models/schedule";
import { SinFileManager } from "./file-manager";

export class ScheduleManager {
  constructor(private fileManager: SinFileManager) {}

  // ---- Today's schedules -----------------------------------

  async getTodaySchedules(today: Date = new Date()): Promise<Schedule[]> {
    const todayStr = dateString(today);
    const schedules = await this.fileManager.readSchedules(todayStr, todayStr);
    return schedules.sort(compareSchedules);
  }

  // ---- Upcoming --------------------------------------------

  async getUpcoming(days: number, from: Date = new Date()): Promise<Schedule[]> {
    const fromStr = dateString(from);
    const to = new Date(from);
    to.setDate(to.getDate() + days);
    const toStr = dateString(to);

    const schedules = await this.fileManager.readSchedules(fromStr, toStr);
    return schedules.filter((s) => !s.done).sort(compareSchedules);
  }

  // ---- Mark done -------------------------------------------

  async markDone(schedule: Schedule): Promise<void> {
    schedule.done = true;
    await this.fileManager.writeSchedule(schedule);
  }

  /** Toggle the done flag and persist. Returns the new done state. */
  async toggleDone(schedule: Schedule): Promise<boolean> {
    schedule.done = !schedule.done;
    await this.fileManager.writeSchedule(schedule);
    return schedule.done;
  }
}

function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
