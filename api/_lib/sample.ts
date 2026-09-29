// A win rate over fewer resolved outcomes than this is not a performance signal: public surfaces show the
// raw count with "insufficient sample" and leave the rate (and any score built on it) out. Same threshold as
// the /protocol page.
export const WIN_RATE_MIN_SAMPLE = 20;

export const hasSample = (n: unknown) => Number.isFinite(Number(n)) && Number(n) >= WIN_RATE_MIN_SAMPLE;
