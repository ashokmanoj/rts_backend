'use strict';

/**
 * Holiday seed script.
 * Run: node src/db/seed-holidays.js
 *
 * UPDATE the HOLIDAYS array below with your company's official holiday list.
 * Dates must be in YYYY-MM-DD format (IST).
 * Note: 2nd and 4th Saturdays are automatically handled in code — do NOT add them here.
 */

require('dotenv').config();
const prisma = require('./prisma');

const HOLIDAYS = [
  // ── 2025 ──────────────────────────────────────────────────────────────────
  { date: '2025-11-09', name: 'Balipadyami' },
  { date: '2025-11-10', name: 'Deepavali' },
  { date: '2025-12-25', name: 'Christmas' },

  // ── 2026 ──────────────────────────────────────────────────────────────────
  { date: '2026-01-15', name: 'Makara Sankramana' },
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-02-16', name: 'Maha Shivaratri' },
  { date: '2026-03-19', name: 'Ugadi' },
  { date: '2026-05-01', name: 'May Day' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-09-14', name: 'Varasiddhi Vinayaka Vrata' },
  { date: '2026-10-02', name: 'Gandhi Jayanthi' },
  { date: '2026-10-20', name: 'Mahanavami (Dassara)' },
];

async function main() {
  console.log('🌱  Seeding holidays...');

  await prisma.holiday.deleteMany();
  console.log('🗑   Cleared existing holidays');

  for (const h of HOLIDAYS) {
    const date = new Date(`${h.date}T00:00:00+05:30`);
    await prisma.holiday.create({ data: { date, name: h.name } });
  }

  console.log(`✅  Done — ${HOLIDAYS.length} holidays seeded.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
