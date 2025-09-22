#!/usr/bin/env node

/**
 * Monthly Reset Cron Job
 * 
 * This script should be run on the 1st of every month to reset message counters
 * for freemium users. Can be scheduled via cron:
 * 
 * 0 0 1 * * /usr/bin/node /path/to/your/app/server/cron-monthly-reset.js
 * 
 * Or using a scheduler like node-cron within your main application.
 */

import { resetMonthlyMessageCounters } from './subscription-middleware-fixed';

async function runMonthlyReset() {
  console.log('🔄 Starting monthly message counter reset...');
  
  try {
    await resetMonthlyMessageCounters();
    console.log('✅ Monthly reset completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Monthly reset failed:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  runMonthlyReset();
}

export { runMonthlyReset };
