window.AppStress = (() => {
  const { BACKEND_URL, ROLE_LABELS } = window.AppConfig;
  const { dateKeyFromDate, formatTime, toTimestamp, tokenizeWords } = window.AppUtils;
  const dom = window.AppDom;
  const state = window.AppState;

  function monthRange(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start, end };
  }

  function isDateInCurrentMonth(key) {
    const [y, m] = key.split("-").map(Number);
    return y === state.currentMonth.getFullYear() && m === state.currentMonth.getMonth() + 1;
  }

  function getStressForDay(key) {
    return state.stressLogs.find((x) => x.date === key) || null;
  }

  function renderCalendar() {
    if (!dom.calendarGridEl || !dom.stressMonthTitleEl) return;
    const { start, end } = monthRange(state.currentMonth);
    dom.stressMonthTitleEl.textContent = state.currentMonth.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    });
    dom.calendarGridEl.innerHTML = "";

    const offset = (start.getDay() + 6) % 7;
    for (let i = 0; i < offset; i += 1) dom.calendarGridEl.appendChild(document.createElement("div"));

    for (let d = 1; d <= end.getDate(); d += 1) {
      const date = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), d);
      const key = dateKeyFromDate(date);
      const log = getStressForDay(key);
      const btn = document.createElement("button");
      btn.className = "day-cell";
      if (log?.level) btn.classList.add(log.level);
      if (state.selectedDateKey === key) btn.classList.add("selected");
      const levelClass = log?.level ? ` ${log.level}` : "";
      btn.innerHTML = `<span class="day-number">${d}</span><span class="day-indicator${levelClass}"></span>`;
      btn.addEventListener("click", () => selectDay(key));
      dom.calendarGridEl.appendChild(btn);
    }

    if (!state.selectedDateKey || !isDateInCurrentMonth(state.selectedDateKey)) {
      state.selectedDateKey = dateKeyFromDate(start);
    }
    updateSelectedDayPanel();
  }

  function updateSelectedDayPanel() {
    if (!state.selectedDateKey) return;
    const log = getStressForDay(state.selectedDateKey);
    dom.selectedDayTitleEl.textContent = `День: ${state.selectedDateKey}`;
    dom.selectedDayLevelEl.textContent = `Уровень: ${
      log?.level === "high" ? "Высокий" : log?.level === "medium" ? "Средний" : log?.level === "low" ? "Низкий" : "—"
    }`;
    renderSelectedDayNotes();
  }

  function selectDay(key) {
    state.selectedDateKey = key;
    subscribeToSelectedDayNotes();
    renderCalendar();
  }

  function subscribeToStressLogs() {
    if (!state.currentUser) return;
    if (state.stressLogsUnsubscribe) state.stressLogsUnsubscribe();
    state.stressLogsUnsubscribe = db
      .collection("stress_logs")
      .where("userId", "==", state.currentUser.uid)
      .onSnapshot((snapshot) => {
        const rows = [];
        snapshot.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
        state.stressLogs = rows;
        renderCalendar();
      });
  }

  function subscribeToSelectedDayNotes() {
    if (!state.currentUser || !state.selectedDateKey) return;
    if (state.stressNotesUnsubscribe) state.stressNotesUnsubscribe();
    state.stressNotesUnsubscribe = db
      .collection("stress_notes")
      .where("userId", "==", state.currentUser.uid)
      .where("date", "==", state.selectedDateKey)
      .onSnapshot((snapshot) => {
        const rows = [];
        snapshot.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
        rows.sort((a, b) => (toTimestamp(b.createdAt) || 0) - (toTimestamp(a.createdAt) || 0));
        state.stressNotes = rows;
        renderSelectedDayNotes();
      });
  }

  function renderSelectedDayNotes() {
    if (!dom.dayNotesListEl) return;
    dom.dayNotesListEl.innerHTML = "";
    if (!state.stressNotes.length) {
      const li = document.createElement("li");
      li.className = "day-note-item";
      li.textContent = "Пока нет заметок за этот день.";
      dom.dayNotesListEl.appendChild(li);
      return;
    }
    state.stressNotes.forEach((n) => {
      const li = document.createElement("li");
      li.className = "day-note-item";
      const t = document.createElement("div");
      t.textContent = n.text || "";
      const time = document.createElement("div");
      time.className = "day-note-time";
      time.textContent = n.createdAt?.toDate ? formatTime(n.createdAt) : "";
      li.appendChild(t);
      li.appendChild(time);
      dom.dayNotesListEl.appendChild(li);
    });
  }

  function getCriticalStressOverride(text) {
    const t = String(text || "").toLowerCase();
    const criticalPhrases = ["хочу умереть", "не хочу жить", "покончить с собой", "суицид", "самоубий", "лучше бы меня не было", "не вижу смысла жить"];
    if (criticalPhrases.some((p) => t.includes(p))) return { score: 0.98, level: "high" };
    return null;
  }

  function getHeuristicAdjustment(text) {
    const t = String(text || "").toLowerCase();
    const intense = ["паника", "ужас", "срыв", "невыносимо", "давит", "тревога", "тяжело"];
    const positive = ["все хорошо", "всё хорошо", "мне спокойно", "я в порядке", "я рада", "я рад", "мир прекрасен", "у меня хорошая мама", "люблю", "прекрасно", "замечательно", "радост", "благодар"];
    if (intense.some((w) => t.includes(w))) return 0.15;
    if (positive.some((w) => t.includes(w))) return -0.3;
    return 0;
  }

  async function analyzeAndSaveStress(text, options = {}) {
    const { targetDateKey = null, signalType = "chat" } = options;
    if (!state.currentUser) return;

    const response = await fetch(`${BACKEND_URL}/api/stress/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return;
    const data = await response.json();

    const dateKey = targetDateKey || dateKeyFromDate(new Date());
    const docId = `${state.currentUser.uid}_${dateKey}`;
    const existingSnap = await db.collection("stress_logs").doc(docId).get();
    const existing = existingSnap.exists ? existingSnap.data() : getStressForDay(dateKey);

    const score = Number(data.score || 0);
    const previousScore = Number(existing?.score || 0);
    const critical = getCriticalStressOverride(text);

    let mergedScore = 0;
    if (critical) {
      mergedScore = Math.max(previousScore, critical.score);
    } else {
      const baseAlpha = signalType === "note" ? 0.9 : 0.45;
      const adjustedScore = Math.min(1, Math.max(0, score + getHeuristicAdjustment(text)));
      mergedScore = existing
        ? Math.min(1, Math.max(0, previousScore * (1 - baseAlpha) + adjustedScore * baseAlpha))
        : adjustedScore;
      if (signalType === "note" && getHeuristicAdjustment(text) <= -0.3) {
        mergedScore = Math.min(mergedScore, Math.max(0.08, previousScore - 0.22));
      }
    }

    const level = mergedScore >= 0.65 ? "high" : mergedScore >= 0.35 ? "medium" : "low";
    await db.collection("stress_logs").doc(docId).set(
      { userId: state.currentUser.uid, date: dateKey, score: mergedScore, level, updatedAt: new Date() },
      { merge: true }
    );
  }

  function initStressUi() {
    dom.btnMonthPrev?.addEventListener("click", () => {
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    dom.btnMonthNext?.addEventListener("click", () => {
      state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
      renderCalendar();
    });

    dom.btnSaveDayNote?.addEventListener("click", async () => {
      if (!state.currentUser || !state.selectedDateKey) return;
      const text = (dom.dayNoteInput.value || "").trim();
      if (!text) return alert("Введите текст заметки.");
      await db.collection("stress_notes").add({ userId: state.currentUser.uid, date: state.selectedDateKey, text, createdAt: new Date() });
      await analyzeAndSaveStress(text, { targetDateKey: state.selectedDateKey, signalType: "note" });
      dom.dayNoteInput.value = "";
    });
  }

  return {
    initStressUi,
    subscribeToStressLogs,
    subscribeToSelectedDayNotes,
    renderCalendar,
    analyzeAndSaveStress,
  };
})();

