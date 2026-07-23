export function checkDailyLimit(applicationsToday: number, limit: number = 5): { allowed: boolean; remaining: number; message: string } {
  if (applicationsToday >= limit) {
    return {
      allowed: false,
      remaining: 0,
      message: `Daily limit of ${limit} applications reached.`
    };
  }
  return {
    allowed: true,
    remaining: limit - applicationsToday,
    message: `${limit - applicationsToday} applications remaining today.`
  };
}

export function checkKillSwitch(isKillSwitchOn: boolean): { allowed: boolean; message: string } {
  if (isKillSwitchOn) {
    return {
      allowed: false,
      message: 'Kill switch is active. All automation is stopped.'
    };
  }
  return {
    allowed: true,
    message: 'System is active.'
  };
}
