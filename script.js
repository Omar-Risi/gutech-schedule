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

/* ── Helpers ──────────────────────────────────────────────── */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

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
  // "Mon(02/26/2026)" → "Mon"
  return dayStr.split("(")[0];
}

function parseTime(timeStr) {
  // "08:30:00" → { h: 8, m: 30 }
  const [h, m] = timeStr.split(":").map(Number);
  return { h, m };
}

function parseTimeRange(rangeStr) {
  // "08:00:00 - 10:00:00" → { start: {h,m}, end: {h,m} }
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
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dayIdx + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

/**
 * Returns flat list of class blocks for the current week.
 * Each item: { courseName, lecturer, day, startH, startM, endH, endM, room, colorIdx }
 */
function getThisWeekClasses() {
  const courses = getCourses();
  const now = new Date();
  const todayDayName = DAY_NAMES[now.getDay()];
  const { monday, sunday } = getWeekBounds(now);
  const blocks = [];

  courses.forEach((course, ci) => {
    const colorIdx = ci % COURSE_COLORS.length;
    course.classes.forEach((cls) => {
      const dayName = extractDayName(cls.day);
      // Check if the specific date falls in this week, OR day name matches a weekday
      const dateStr = cls.day.match(/\((\d{2}\/\d{2}\/\d{4})\)/);
      let inThisWeek = false;
      if (dateStr) {
        const [mm, dd, yyyy] = dateStr[1].split("/").map(Number);
        const clsDate = new Date(yyyy, mm - 1, dd);
        inThisWeek = clsDate >= monday && clsDate <= sunday;
      }
      // Fallback: match by day name for recurring schedules
      if (!inThisWeek && WEEKDAYS.includes(dayName)) {
        inThisWeek = true;
      }

      if (inThisWeek) {
        const { start, end } = parseTimeRange(cls.time);
        blocks.push({
          courseName: course.name,
          lecturer: course.lecturer,
          day: dayName,
          startH: start.h,
          startM: start.m,
          endH: end.h,
          endM: end.m,
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
  const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
      // Class already started or passed today
      // Check if class is currently ongoing
      const bEndMinutes = b.endH * 60 + b.endM;
      if (bEndMinutes > currentMinutes) {
        // Currently ongoing — treat as highest priority
        if (best === null || bestScore > 0) {
          best = { ...b, ongoing: true };
          bestScore = -1;
        }
        return;
      }
      dayDiff = 7; // push to next week
    }

    const score = dayDiff * 1440 + bMinutes;
    if (score < bestScore) {
      bestScore = score;
      best = { ...b, ongoing: false };
    }
  });

  return best;
}
