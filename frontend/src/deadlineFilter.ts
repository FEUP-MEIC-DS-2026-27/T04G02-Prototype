/** An inclusive range of 'YYYY-MM-DD' dates. An empty string leaves that end open. */
export interface DeadlineRange {
    from: string;
    to: string;
}

export const isRangeActive = ({ from, to }: DeadlineRange): boolean => from !== '' || to !== '';

/** True when both ends are set but the range ends before it starts, so nothing can match. */
export const isRangeReversed = ({ from, to }: DeadlineRange): boolean => from !== '' && to !== '' && from > to;

/**
 * Whether a project's deadline falls in the range, both ends included.
 *
 * Projects without a deadline only match when the range is empty. ISO dates sort
 * alphabetically, so comparing the strings avoids any timezone shift.
 */
export function isDeadlineInRange(deadline: string | null | undefined, range: DeadlineRange): boolean {
    if (!isRangeActive(range)) return true;
    if (!deadline) return false;
    const day = deadline.slice(0, 10); // drop the time, if any
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}
