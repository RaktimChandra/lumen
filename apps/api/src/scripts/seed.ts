/**
 * Creates (or resets) a demo account with realistic projects and tasks.
 *   npm run db:seed            → demo@lumen.dev / LumenDemo2026
 * Only the demo account is touched; other users are never modified.
 */
import type { TaskPriority, TaskStatus } from '@lumen/shared';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config/env';
import { createDatabase } from '../db/client';
import { users } from '../db/schema';
import { createPasswordHasher } from '../lib/password';
import { createProjectsService } from '../modules/projects/projects.service';
import { createTasksService } from '../modules/tasks/tasks.service';

export const DEMO_EMAIL = process.env.SEED_EMAIL ?? 'demo@lumen.dev';
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'LumenDemo2026';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

type SeedTask = [
  name: string,
  status: TaskStatus,
  priority: TaskPriority,
  due: number | null,
  description?: string,
];

const PLAN: {
  name: string;
  description: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  start: number | null;
  end: number | null;
  tasks: SeedTask[];
}[] = [
  {
    name: 'Raman spectroscopy rig',
    description:
      'Bench prototype for label-free tissue classification using a 785 nm excitation laser.',
    status: 'IN_PROGRESS',
    start: -21,
    end: 40,
    tasks: [
      ['Align 785 nm laser to the objective', 'COMPLETED', 'HIGH', -10],
      ['Characterise CCD dark current at -60 °C', 'COMPLETED', 'MEDIUM', -6],
      [
        'Write baseline-correction routine',
        'IN_PROGRESS',
        'HIGH',
        2,
        'Asymmetric least squares; compare with polynomial fit.',
      ],
      ['Collect reference spectra for polystyrene', 'PENDING', 'MEDIUM', 5],
      [
        'Order replacement notch filter',
        'PENDING',
        'HIGH',
        -2,
        'Current filter shows leakage around 785 nm.',
      ],
      ['Draft safety SOP for Class 3B laser', 'PENDING', 'LOW', 12],
    ],
  },
  {
    name: 'OCT imaging firmware',
    description: 'Firmware for the swept-source optical coherence tomography scanner.',
    status: 'IN_PROGRESS',
    start: -45,
    end: 20,
    tasks: [
      ['Port galvo driver to the new MCU', 'COMPLETED', 'HIGH', -20],
      ['Add k-clock resampling on FPGA', 'IN_PROGRESS', 'HIGH', 1],
      ['Fix frame drop at 200 kHz A-scan rate', 'IN_PROGRESS', 'MEDIUM', 4],
      ['Expose scan presets over USB', 'PENDING', 'LOW', 15],
    ],
  },
  {
    name: 'Clinical study data portal',
    description: 'Secure web portal for uploading and reviewing imaging study data.',
    status: 'NOT_STARTED',
    start: 7,
    end: 90,
    tasks: [
      ['Define de-identification rules', 'PENDING', 'HIGH', 9],
      ['Choose object storage and retention policy', 'PENDING', 'MEDIUM', 14],
      ['Sketch reviewer workflow', 'PENDING', 'LOW', null],
    ],
  },
  {
    name: 'Fluorescence microscope calibration',
    description: 'Quarterly calibration of the widefield fluorescence microscope.',
    status: 'COMPLETED',
    start: -60,
    end: -30,
    tasks: [
      ['Measure flat-field with uniform slide', 'COMPLETED', 'MEDIUM', -40],
      ['Verify filter cube transmission', 'COMPLETED', 'MEDIUM', -38],
      ['Publish calibration report', 'COMPLETED', 'LOW', -31],
    ],
  },
];

async function main() {
  const config = loadConfig();
  const handle = createDatabase(config.database);
  const { db } = handle;
  try {
    await db.delete(users).where(eq(users.email, DEMO_EMAIL));
    const passwordHash = await createPasswordHasher(config.auth.bcryptRounds).hash(DEMO_PASSWORD);
    const [user] = await db
      .insert(users)
      .values({ fullName: 'Demo Researcher', email: DEMO_EMAIL, passwordHash })
      .returning({ id: users.id });
    if (!user) throw new Error('could not create demo user');

    const ctx = { userId: user.id, platform: 'web' as const, ip: null };
    const projectsService = createProjectsService(db);
    const tasksService = createTasksService(db);
    let taskCount = 0;

    for (const plan of PLAN) {
      const project = await projectsService.create(ctx, {
        name: plan.name,
        description: plan.description,
        status: plan.status,
        startDate: plan.start === null ? null : day(plan.start),
        endDate: plan.end === null ? null : day(plan.end),
      });
      for (const [name, status, priority, due, description = ''] of plan.tasks) {
        await tasksService.create(ctx, {
          projectId: project.id,
          name,
          description,
          status,
          priority,
          dueDate: due === null ? null : day(due),
        });
        taskCount += 1;
      }
    }
    console.log(
      `Seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD} with ${PLAN.length} projects and ${taskCount} tasks.`,
    );
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
