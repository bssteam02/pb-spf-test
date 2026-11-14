(() => {
  const TIME_ZONE = 'America/New_York';
  const CUTOFF_HOUR = 14;
  const MIN_WORKING_DAYS = 3;
  const MAX_WORKING_DAYS = 5;
  const CHRISTMAS_NOTICE_LAST_DAY = 18;
  const CHRISTMAS_NOTICE_FIRST_MONTH = 11;
  const REFRESH_MS = 30000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });

  // Calendar days are handled as UTC midnights so day arithmetic never meets a DST shift.
  const calendarDay = (year, month, day) => Date.UTC(year, month - 1, day);

  const easternParts = (ms) => {
    const parts = {};
    formatter.formatToParts(new Date(Math.floor(ms / 1000) * 1000)).forEach((part) => {
      if (part.type !== 'literal') parts[part.type] = Number(part.value);
    });
    return parts;
  };

  const easternOffset = (ms) => {
    const p = easternParts(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };

  const easternWallTimeToInstant = (year, month, day, hour) => {
    const wallAsUtc = Date.UTC(year, month - 1, day, hour);
    let instant = wallAsUtc;
    for (let i = 0; i < 2; i += 1) instant = wallAsUtc - easternOffset(instant);
    return instant;
  };

  const nthWeekday = (year, month, weekday, n) => {
    const first = new Date(calendarDay(year, month, 1)).getUTCDay();
    return calendarDay(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  };

  const lastWeekday = (year, month, weekday) => {
    const lastDay = new Date(calendarDay(year, month + 1, 0));
    return lastDay.getTime() - ((lastDay.getUTCDay() - weekday + 7) % 7) * DAY_MS;
  };

  const isNonWorkingDay = (dayMs) => {
    const date = new Date(dayMs);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const weekday = date.getUTCDay();

    if (weekday === 0 || weekday === 6) return true;
    if ((month === 12 && day >= 24) || (month === 1 && day === 1)) return true;
    if (month === 7 && day === 4) return true;
    return (
      dayMs === lastWeekday(year, 5, 1) ||
      dayMs === nthWeekday(year, 9, 1, 1) ||
      dayMs === nthWeekday(year, 11, 4, 4)
    );
  };

  const nextWorkingDay = (dayMs) => {
    let next = dayMs + DAY_MS;
    while (isNonWorkingDay(next)) next += DAY_MS;
    return next;
  };

  const addWorkingDays = (dayMs, count) => {
    let result = dayMs;
    for (let i = 0; i < count; i += 1) result = nextWorkingDay(result);
    return result;
  };

  const estimate = (nowMs) => {
    const p = easternParts(nowMs);
    const today = calendarDay(p.year, p.month, p.day);
    const cutoff = easternWallTimeToInstant(p.year, p.month, p.day, CUTOFF_HOUR);
    const secondsLeft = (cutoff - nowMs) / 1000;
    // Under a minute before the cut-off counts as missed: checkout takes longer than that.
    const beforeCutoff = !isNonWorkingDay(today) && secondsLeft >= 60;
    const dispatch = beforeCutoff ? today : nextWorkingDay(today);
    const earliest = addWorkingDays(dispatch, MIN_WORKING_DAYS);
    const latest = addWorkingDays(dispatch, MAX_WORKING_DAYS);
    const inChristmasWindow =
      p.month >= CHRISTMAS_NOTICE_FIRST_MONTH && (p.month < 12 || p.day <= CHRISTMAS_NOTICE_LAST_DAY);

    return {
      earliest,
      latest,
      minutesLeft: beforeCutoff ? Math.floor(secondsLeft / 60) : null,
      // Never promised once even the earliest date misses Christmas (e.g. after the cut-off on 18 Dec).
      beforeChristmas: inChristmasWindow && earliest < calendarDay(p.year, 12, 24),
    };
  };

  const formatDay = (dayMs) => {
    const date = new Date(dayMs);
    return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  };

  const formatCountdown = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
  };

  const init = (root) => {
    const message = root.querySelector('[data-delivery-estimate-message]');
    const christmas = root.querySelector('[data-delivery-estimate-christmas]');
    const variantData = root.querySelector('[data-delivery-estimate-variants]');
    const variantSelect = document.querySelector('.product-form [name="id"]');
    let availability = {};

    try {
      availability = JSON.parse(variantData.textContent);
    } catch (error) {
      return;
    }

    const render = () => {
      const variantId = variantSelect ? variantSelect.value : root.dataset.variantId;
      if (availability[variantId] !== true) {
        root.hidden = true;
        return;
      }

      const result = estimate(Date.now());
      const template =
        result.minutesLeft === null ? root.dataset.messageAfterCutoff : root.dataset.messageBeforeCutoff;

      message.textContent = template
        .split('{countdown}').join(result.minutesLeft === null ? '' : formatCountdown(result.minutesLeft))
        .split('{start}').join(formatDay(result.earliest))
        .split('{end}').join(formatDay(result.latest));
      christmas.textContent = root.dataset.messageChristmas;
      christmas.hidden = !result.beforeChristmas;
      root.hidden = false;
    };

    if (variantSelect) variantSelect.addEventListener('change', render);
    window.addEventListener('pageshow', render);
    window.setInterval(render, REFRESH_MS);
    render();
  };

  document.querySelectorAll('[data-delivery-estimate]').forEach(init);
})();
