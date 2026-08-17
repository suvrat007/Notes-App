/**
 * Crew scoring. Pure — rows in, standings and awards out.
 *
 * Kept away from the database for the same reason the rank curve is: what a
 * scoreboard pays has to be checkable without a Mongo instance, and a payout
 * rule buried inside a route handler is a rule nobody can test.
 */

/**
 * What the winner earns, per member of the crew.
 *
 * Scaled by size on purpose. Coming first in a pair is a coin toss; coming
 * first in a twelve is worth something, and a flat prize would make tiny
 * crews the efficient way to farm stars.
 */
const PER_MEMBER = 20;

/** First takes the whole prize, second most of it, third a share. */
const PODIUM_SHARE = [1, 0.6, 0.3];

/** Below this there is no contest to win, so nothing is paid. */
const MIN_MEMBERS = 2;

/**
 * Rank members by stars earned on shared tasks.
 *
 * Ties share the better position and consume the ones below it — two firsts
 * are followed by a third, never a second. Anything else tells one of two
 * equal performers they came second.
 */
function standings(scores) {
  const sorted = [...scores].sort((x, y) => y.stars - x.stars);
  let lastStars = null;
  let lastPlace = 0;

  return sorted.map((row, i) => {
    const place = row.stars === lastStars ? lastPlace : i + 1;
    lastStars = row.stars;
    lastPlace = place;
    return { ...row, place };
  });
}

/**
 * What each member is owed when the week closes.
 *
 * A member who scored nothing is never paid, whatever their place: in a crew
 * of three where two did not turn up, second and third are not achievements.
 * Shared places each take the full share for that place — the prize is for
 * where you finished, and splitting it would punish the tie.
 */
function podiumAwards(ranked, memberCount) {
  if (memberCount < MIN_MEMBERS) return [];
  const pot = PER_MEMBER * memberCount;

  return ranked
    .filter((r) => r.stars > 0 && r.place <= PODIUM_SHARE.length)
    .map((r) => ({
      userId: r.userId,
      place: r.place,
      stars: r.stars,
      award: Math.round(pot * PODIUM_SHARE[r.place - 1]),
    }))
    .filter((r) => r.award > 0);
}

/** What first place would pay right now, for the crew to see what is at stake. */
function topPrize(memberCount) {
  if (memberCount < MIN_MEMBERS) return 0;
  return Math.round(PER_MEMBER * memberCount * PODIUM_SHARE[0]);
}

module.exports = { standings, podiumAwards, topPrize, PER_MEMBER, PODIUM_SHARE, MIN_MEMBERS };
