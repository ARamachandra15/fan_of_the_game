import { fetchLeagueSchedule, normalizeLeagueKey, SUPPORTED_LEAGUES } from '../server/scheduleService.js';

const targetLeague = process.argv[2];
const leagueTargets = targetLeague ? [normalizeLeagueKey(targetLeague)] : Object.keys(SUPPORTED_LEAGUES);

const run = async () => {
  for (const leagueKey of leagueTargets) {
    if (!(leagueKey in SUPPORTED_LEAGUES) && leagueKey !== 'f1') {
      console.warn(`Skipping unsupported league: ${leagueKey}`);
      continue;
    }

    console.log(`Refreshing ${leagueKey} schedule...`);
    try {
      const result = await fetchLeagueSchedule(leagueKey, { forceRefresh: true });
      console.log(`  -> ${result.data.length} events fetched (${result.meta?.source ?? 'unknown'})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  -> ${leagueKey} refresh failed: ${message}`);
    }
  }
};

run().catch((error) => {
  console.error('Schedule refresh failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
