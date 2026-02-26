/* ── Parser & Storage ─────────────────────────────────────── */

function parseScheduleString(str) {
  const regex = /(\w+)\((\d{2}\/\d{2}\/\d{4})\)\s+(\d{2}:\d{2}:\d{2})\s+-\s+(\d{2}:\d{2}:\d{2})\s+([\w-]+\s+\w+)/g;
  const results = [];
  let match;

  while ((match = regex.exec(str)) !== null) {
    results.push({
      day: `${match[1]}(${match[2]})`,
      time: `${match[3]} - ${match[4]}`,
      room: match[5].trim()
    });
  }

  return results;
}

function saveCourse(name, lecturer, timings) {
  const course = {
    name: name,
    lecturer: lecturer,
    classes: parseScheduleString(timings)
  };

  const courses = JSON.parse(localStorage.getItem("courses") || "[]");
  courses.push(course);
  localStorage.setItem("courses", JSON.stringify(courses));

  return course;
}

function getCourses() {
  return JSON.parse(localStorage.getItem("courses") || "[]");
}

function deleteCourse(index) {
  const courses = getCourses();
  courses.splice(index, 1);
  localStorage.setItem("courses", JSON.stringify(courses));
}

/* ── Ramadan setting ─────────────────────────────────────── */

function isRamadanMode() {
  return localStorage.getItem("is_ramadan_timing") === "true";
}

function setRamadanMode(on) {
  localStorage.setItem("is_ramadan_timing", on ? "true" : "false");
}

/**
 * Ramadan timing map: normal slot → compressed slot.
 * Key = "HH:MM-HH:MM" (start-end in 24h), value = { startH, startM, endH, endM }
 */
const RAMADAN_MAP = [
  { fromStart: [8, 0],  fromEnd: [10, 0], toStart: [8, 0],   toEnd: [9, 15] },
  { fromStart: [10, 0], fromEnd: [12, 0], toStart: [9, 15],  toEnd: [10, 30] },
  { fromStart: [12, 0], fromEnd: [14, 0], toStart: [10, 30], toEnd: [11, 45] },
  { fromStart: [14, 0], fromEnd: [16, 0], toStart: [11, 45], toEnd: [13, 0] },
  { fromStart: [16, 0], fromEnd: [18, 0], toStart: [13, 0],  toEnd: [14, 15] },
];

function applyRamadanTiming(startH, startM, endH, endM) {
  for (const r of RAMADAN_MAP) {
    if (startH === r.fromStart[0] && startM === r.fromStart[1] &&
        endH === r.fromEnd[0] && endM === r.fromEnd[1]) {
      return {
        startH: r.toStart[0], startM: r.toStart[1],
        endH: r.toEnd[0], endM: r.toEnd[1],
      };
    }
  }
  // No matching slot — return original
  return { startH, startM, endH, endM };
}

/* ── Helpers ──────────────────────────────────────────────── */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu"];

const COURSE_COLORS = [
  { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a5f" },
  { bg: "#dcfce7", border: "#22c55e", text: "#14532d" },
  { bg: "#fef9c3", border: "#eab308", text: "#713f12" },
  { bg: "#fce7f3", border: "#ec4899", text: "#831843" },
  { bg: "#e0e7ff", border: "#6366f1", text: "#312e81" },
  { bg: "#ffedd5", border: "#f97316", text: "#7c2d12" },
  { bg: "#f3e8ff", border: "#a855f7", text: "#581c87" },
  { bg: "#ccfbf1", border: "#14b8a6", text: "#134e4a" },
];

function extractDayName(dayStr) {
  return dayStr.split("(")[0];
}

function parseTime(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return { h, m };
}

function parseTimeRange(rangeStr) {
  const [s, e] = rangeStr.split(" - ");
  return { start: parseTime(s), end: parseTime(e) };
}

function formatTime12(h, m) {
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getWeekBounds(date) {
  const d = new Date(date);
  const dayIdx = d.getDay(); // 0=Sun
  // Week starts on Sunday for Sun-Thu schedule
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayIdx);
  sunday.setHours(0, 0, 0, 0);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);
  return { weekStart: sunday, weekEnd: saturday };
}

/**
 * Returns flat list of class blocks for the current week.
 */
function getThisWeekClasses() {
  const courses = getCourses();
  const now = new Date();
  const { weekStart, weekEnd } = getWeekBounds(now);
  const ramadan = isRamadanMode();
  const blocks = [];

  courses.forEach((course, ci) => {
    const colorIdx = ci % COURSE_COLORS.length;
    course.classes.forEach((cls) => {
      const dayName = extractDayName(cls.day);
      const dateStr = cls.day.match(/\((\d{2}\/\d{2}\/\d{4})\)/);
      let inThisWeek = false;
      if (dateStr) {
        const [mm, dd, yyyy] = dateStr[1].split("/").map(Number);
        const clsDate = new Date(yyyy, mm - 1, dd);
        inThisWeek = clsDate >= weekStart && clsDate <= weekEnd;
      }
      if (!inThisWeek && WEEKDAYS.includes(dayName)) {
        inThisWeek = true;
      }

      if (inThisWeek) {
        const { start, end } = parseTimeRange(cls.time);
        let timing = { startH: start.h, startM: start.m, endH: end.h, endM: end.m };
        if (ramadan) {
          timing = applyRamadanTiming(timing.startH, timing.startM, timing.endH, timing.endM);
        }
        blocks.push({
          courseName: course.name,
          lecturer: course.lecturer,
          day: dayName,
          ...timing,
          room: cls.room,
          colorIdx,
        });
      }
    });
  });
  return blocks;
}

/**
 * Find the next upcoming class (closest future class from now).
 */
function getUpcomingClass() {
  const blocks = getThisWeekClasses();
  const now = new Date();
  const currentDay = DAY_NAMES[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const dayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let best = null;
  let bestScore = Infinity;

  blocks.forEach((b) => {
    const bDayIdx = dayOrder.indexOf(b.day);
    const curDayIdx = dayOrder.indexOf(currentDay);
    if (bDayIdx === -1 || curDayIdx === -1) return;

    let dayDiff = bDayIdx - curDayIdx;
    if (dayDiff < 0) dayDiff += 7;

    const bMinutes = b.startH * 60 + b.startM;

    if (dayDiff === 0 && bMinutes <= currentMinutes) {
      const bEndMinutes = b.endH * 60 + b.endM;
      if (bEndMinutes > currentMinutes) {
        if (best === null || bestScore > 0) {
          best = { ...b, ongoing: true };
          bestScore = -1;
        }
        return;
      }
      dayDiff = 7;
    }

    const score = dayDiff * 1440 + bMinutes;
    if (score < bestScore) {
      bestScore = score;
      best = { ...b, ongoing: false };
    }
  });

  return best;
}
