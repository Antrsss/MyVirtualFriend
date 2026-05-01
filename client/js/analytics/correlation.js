window.AppCorrelation = (() => {
  const { escapeHtml, toTimestamp, dateKeyFromDate, tokenizeWords } = window.AppUtils;
  const dom = window.AppDom;
  const state = window.AppState;

  function pearsonCorrelation(x, y) {
    if (!x.length || x.length !== y.length) return null;
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    const den = Math.sqrt(denX * denY);
    return den ? num / den : null;
  }

  function rank(values) {
    const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(values.length);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j += 1;
      const avg = (i + j + 2) / 2;
      for (let k = i; k <= j; k += 1) ranks[indexed[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  }

  function spearmanCorrelation(x, y) {
    if (!x.length || x.length !== y.length) return null;
    return pearsonCorrelation(rank(x), rank(y));
  }

  function fmtCorr(v) {
    if (v === null || Number.isNaN(v)) return "—";
    return v.toFixed(3);
  }

  async function recompute() {
    if (!state.currentUser || !dom.correlationTableBodyEl) return;
    dom.correlationTableBodyEl.innerHTML = `<tr><td colspan="3">Считаем...</td></tr>`;

    try {
      const chatsSnap = await db.collection("chats").where("userId", "==", state.currentUser.uid).get();
      const notesSnap = await db.collection("stress_notes").where("userId", "==", state.currentUser.uid).get();

      const chatDocs = [];
      chatsSnap.forEach((d) => chatDocs.push({ id: d.id, ...d.data() }));

      const dayStats = new Map();
      function ensureDay(key) {
        if (!dayStats.has(key)) {
          dayStats.set(key, {
            userMessages: 0,
            charSum: 0,
            tokenCount: 0,
            uniqueWords: new Set(),
            hourSum: 0,
            responseCount: 0,
            responseSecondsSum: 0,
          });
        }
        return dayStats.get(key);
      }

      for (const chat of chatDocs) {
        const msgSnap = await db
          .collection("chats")
          .doc(chat.id)
          .collection("messages")
          .orderBy("createdAt", "asc")
          .get();
        const msgs = [];
        msgSnap.forEach((d) => msgs.push(d.data()));
        let prevAiTs = null;
        for (const msg of msgs) {
          const ts = toTimestamp(msg.createdAt);
          if (!ts) continue;
          const key = dateKeyFromDate(new Date(ts));
          const stat = ensureDay(key);
          if (msg.sender === "user") {
            const text = String(msg.text || "");
            const tokens = tokenizeWords(text);
            stat.userMessages += 1;
            stat.charSum += text.length;
            stat.tokenCount += tokens.length;
            tokens.forEach((t) => stat.uniqueWords.add(t));
            stat.hourSum += new Date(ts).getHours();
            if (prevAiTs) {
              stat.responseCount += 1;
              stat.responseSecondsSum += Math.max(0, (ts - prevAiTs) / 1000);
            }
          } else if (msg.sender === "ai") {
            prevAiTs = ts;
          }
        }
      }

      notesSnap.forEach((doc) => {
        const note = doc.data() || {};
        const ts = toTimestamp(note.createdAt);
        const text = String(note.text || "");
        if (!ts || !text.trim()) return;
        const key = note.date || dateKeyFromDate(new Date(ts));
        const stat = ensureDay(key);
        const tokens = tokenizeWords(text);
        stat.userMessages += 1;
        stat.charSum += text.length;
        stat.tokenCount += tokens.length;
        tokens.forEach((t) => stat.uniqueWords.add(t));
        stat.hourSum += new Date(ts).getHours();
      });

      const rows = [];
      for (const log of state.stressLogs) {
        const stat = dayStats.get(log.date);
        if (!stat || stat.userMessages === 0) continue;
        const avgLen = stat.charSum / stat.userMessages;
        const lexDiv = stat.tokenCount ? stat.uniqueWords.size / stat.tokenCount : 0;
        const avgHour = stat.hourSum / stat.userMessages;
        const avgRespSec = stat.responseCount ? stat.responseSecondsSum / stat.responseCount : 0;
        rows.push({
          stress: Number(log.score || 0),
          avgMessageLength: avgLen,
          lexicalDiversity: lexDiv,
          activeHour: avgHour,
          responseSpeed: avgRespSec > 0 ? 1 / avgRespSec : 0,
        });
      }

      render(rows);
    } catch (e) {
      dom.correlationTableBodyEl.innerHTML = `<tr><td colspan="3">Ошибка: ${escapeHtml(e?.message || "unknown")}</td></tr>`;
    }
  }

  function render(rows) {
    if (!rows.length) {
      dom.correlationTableBodyEl.innerHTML = `<tr><td colspan="3">Недостаточно данных</td></tr>`;
      dom.correlationSampleInfoEl.textContent = "Нужно больше дней с перепиской/заметками и оценкой стресса.";
      dom.correlationWarningEl.classList.remove("hidden");
      dom.correlationWarningEl.textContent = "Недостаточно данных: нужно минимум 5 дней.";
      return;
    }

    dom.correlationSampleInfoEl.textContent = `Дней в анализе: ${rows.length}.`;
    if (rows.length < 5) {
      dom.correlationWarningEl.classList.remove("hidden");
      dom.correlationWarningEl.textContent = "Внимание: выборка слишком маленькая, коэффициенты нестабильны.";
    } else {
      dom.correlationWarningEl.classList.add("hidden");
      dom.correlationWarningEl.textContent = "";
    }

    const stress = rows.map((r) => r.stress);
    const factors = [
      { key: "avgMessageLength", label: "Длина сообщений" },
      { key: "lexicalDiversity", label: "Лексическое разнообразие" },
      { key: "activeHour", label: "Время суток активности" },
      { key: "responseSpeed", label: "Скорость ответа пользователя" },
    ];

    dom.correlationTableBodyEl.innerHTML = "";
    for (const f of factors) {
      const x = rows.map((r) => r[f.key]);
      const p = rows.length >= 5 ? pearsonCorrelation(x, stress) : null;
      const s = rows.length >= 5 ? spearmanCorrelation(x, stress) : null;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${f.label}</td><td>${fmtCorr(p)}</td><td>${fmtCorr(s)}</td>`;
      dom.correlationTableBodyEl.appendChild(tr);
    }
  }

  return { recompute };
})();

