/**
 * Turn one spoken or typed line into a crew assignment.
 *
 * A crew agrees to things in sentences, not in forms: "gym 5 times a week,
 * once a day", "no smoking, 2 max this week", "8 hours of work every day".
 * Asking someone to express that through eight numbered fields — goal,
 * period, daily quota, unit, penalty, allowance — is how a good idea becomes
 * something nobody sets up.
 *
 * So the crew reuses the SAME parser the voice flow already runs on the daily
 * update. One sentence in, a real habit or task out, and the person confirms
 * what it understood before anyone is committed to it.
 */

/** What the parser gives back, in the shape the crew endpoint takes. */
export function toCrewItem(parsed) {
  if (!parsed) return null;

  // Anything that is progress on an existing thing is meaningless here: a
  // crew is agreeing to DO something, not reporting that it was done.
  if (['habit', 'progress', 'skipped', 'new-reward'].includes(parsed.kind)) return null;

  if (parsed.kind === 'task') {
    return {
      kind: 'task',
      title: parsed.text,
      type: 'occasional',
      baseReward: 10,
      targetCount: Math.max(1, parsed.count || 1),
      repCadence: parsed.cadence === 'daily' ? 'daily' : 'anytime',
    };
  }

  const bad = parsed.polarity === 'bad';
  return {
    kind: 'habit',
    title: parsed.name || parsed.text,
    polarity: bad ? 'bad' : 'good',
    starsPerRep: 10,
    dailyTarget: bad ? 0 : (parsed.dailyTarget || 0),
    targetReps: bad ? 0 : (parsed.targetReps || 0),
    targetPeriodWeeks: parsed.targetPeriodWeeks || 1,
    unit: parsed.unit || '',
    dailyAllowance: bad ? (parsed.dailyAllowance ?? 0) : 0,
    overagePenalty: bad ? 5 : 0,
    // A crew goal with no cost for missing it is a wish, and the whole point
    // of agreeing together is that falling short is felt.
    shortfallPenalty: bad ? 0 : 10,
  };
}

/** A plain-English readback, so nobody agrees to something they did not say. */
export function describeCrewItem(item) {
  if (!item) return '';

  if (item.kind === 'task') {
    const reps = item.targetCount > 1
      ? ` · ${item.targetCount}×${item.repCadence === 'daily' ? ' one a day' : ''}`
      : '';
    return `Task · +${item.baseReward}★${reps}`;
  }

  if (item.polarity === 'bad') {
    return item.dailyAllowance > 0
      ? `Bad habit · ${item.dailyAllowance} a day allowed, then it costs`
      : 'Bad habit · every slip costs';
  }

  const unit = item.unit || (item.targetReps === 1 ? 'time' : 'times');
  const period = { 1: 'week', 2: 'fortnight', 4: 'month', 12: 'quarter' }[item.targetPeriodWeeks] || 'week';

  const parts = [];
  if (item.targetReps > 0) parts.push(`${item.targetReps} ${unit} a ${period}`);
  if (item.dailyTarget > 0) parts.push(`${item.dailyTarget} a day`);
  if (parts.length === 0) parts.push('one tap a day');
  parts.push(`+${item.starsPerRep}★ each`);

  return `Habit · ${parts.join(' · ')}`;
}
