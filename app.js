// Простая утилита для форматирования времени
function formatTime(date) {
  const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date();
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Сопоставление ролей с человекочитаемыми подписями
const ROLE_LABELS = {
  friend: "Друг",
  sister: "Сестра",
  brother: "Брат",
  mom: "Мама",
  dad: "Папа",
  partner: "Любимый человек",
};

// === Элементы DOM ===
const authViewEl = document.getElementById("auth-view");
const chatViewEl = document.getElementById("chat-view");

const btnShowLogin = document.getElementById("btn-show-login");
const btnShowRegister = document.getElementById("btn-show-register");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authErrorEl = document.getElementById("auth-error");

const btnLogout = document.getElementById("btn-logout");
const roleSelect = document.getElementById("role");
const topicInput = document.getElementById("topic-input");

const btnNewChat = document.getElementById("btn-new-chat");
const chatsListEl = document.getElementById("chats-list");

const chatTitleEl = document.getElementById("chat-title");
const chatRoleLabelEl = document.getElementById("chat-role-label");
const messagesContainerEl = document.getElementById("messages-container");
const typingStatusEl = document.getElementById("typing-status");
const typingStatusTextEl = document.getElementById("typing-status-text");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const stressViewEl = document.getElementById("stress-view");
const btnTabChat = document.getElementById("btn-tab-chat");
const btnTabStress = document.getElementById("btn-tab-stress");
const btnStressBack = document.getElementById("btn-stress-back");
const calendarGridEl = document.getElementById("calendar-grid");
const stressMonthTitleEl = document.getElementById("stress-month-title");
const btnMonthPrev = document.getElementById("btn-month-prev");
const btnMonthNext = document.getElementById("btn-month-next");
const selectedDayTitleEl = document.getElementById("selected-day-title");
const selectedDayLevelEl = document.getElementById("selected-day-level");
const dayNoteInput = document.getElementById("day-note-input");
const btnSaveDayNote = document.getElementById("btn-save-day-note");
const dayNotesListEl = document.getElementById("day-notes-list");

// Состояние клиента
let currentUser = null;
let currentChatId = null;
let chatsUnsubscribe = null;
let messagesUnsubscribe = null;
let isSending = false;
const BACKEND_URL = "http://localhost:8788";
let currentTopic = "";
let stressLogsUnsubscribe = null;
let stressNotesUnsubscribe = null;
let stressLogs = [];
let stressNotes = [];
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDateKey = null;

function getTopicForPrompt() {
  const t = (currentTopic || topicInput?.value || "").trim();
  return t;
}

function generateChatTitleFromText(text, role) {
  const roleLabel = ROLE_LABELS[role] || "Диалог";
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return `Диалог (${roleLabel})`;

  // Берем первую смысловую часть до знака препинания и режем по длине
  const firstChunk = cleaned.split(/[.!?]/)[0].trim() || cleaned;
  const short = firstChunk.length > 36 ? `${firstChunk.slice(0, 36)}...` : firstChunk;
  return short;
}

// === Переключение между экранами ===
function showAuthView() {
  authViewEl.classList.add("active");
  chatViewEl.classList.remove("active");
  stressViewEl.classList.remove("active");
}

function showChatView() {
  authViewEl.classList.remove("active");
  stressViewEl.classList.remove("active");
  chatViewEl.classList.add("active");
  btnTabChat?.classList.add("active-tab");
  btnTabStress?.classList.remove("active-tab");
}

function showStressView() {
  authViewEl.classList.remove("active");
  chatViewEl.classList.remove("active");
  stressViewEl.classList.add("active");
  btnTabStress?.classList.add("active-tab");
  btnTabChat?.classList.remove("active-tab");
  if (!selectedDateKey) {
    selectedDateKey = dateKeyFromDate(new Date());
  }
  subscribeToSelectedDayNotes();
  renderCalendar();
}

// === Авторизация ===
btnShowLogin.addEventListener("click", () => {
  btnShowLogin.classList.add("active");
  btnShowRegister.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  authErrorEl.textContent = "";
});

btnShowRegister.addEventListener("click", () => {
  btnShowLogin.classList.remove("active");
  btnShowRegister.classList.add("active");
  loginForm.classList.add("hidden");
  registerForm.classList.remove("hidden");
  authErrorEl.textContent = "";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authErrorEl.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    authErrorEl.textContent = err.message;
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authErrorEl.textContent = "";
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value.trim();

  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (err) {
    authErrorEl.textContent = err.message;
  }
});

btnLogout.addEventListener("click", () => {
  auth.signOut();
});

// Реакция на смену пользователя
auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    showChatView();
    subscribeToChats();
    subscribeToStressLogs();
  } else {
    cleanupSubscriptions();
    showAuthView();
    chatsListEl.innerHTML = "";
    messagesContainerEl.innerHTML = "";
    currentChatId = null;
  }
});

function cleanupSubscriptions() {
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }
  if (chatsUnsubscribe) {
    chatsUnsubscribe();
    chatsUnsubscribe = null;
  }
  if (stressLogsUnsubscribe) {
    stressLogsUnsubscribe();
    stressLogsUnsubscribe = null;
  }
  if (stressNotesUnsubscribe) {
    stressNotesUnsubscribe();
    stressNotesUnsubscribe = null;
  }
}

// === Работа с чатами ===
function subscribeToChats() {
  // ВАЖНО: не трогаем подписку на сообщения тут, чтобы при переключении чата
  // не пересоздавать слушатель списка чатов бесконечно.
  if (chatsUnsubscribe) {
    chatsUnsubscribe();
    chatsUnsubscribe = null;
  }
  if (!currentUser) return;

  chatsUnsubscribe = db
    .collection("chats")
    .where("userId", "==", currentUser.uid)
    .onSnapshot((snapshot) => {
      const chats = [];
      snapshot.forEach((doc) => {
        chats.push({ id: doc.id, ...doc.data() });
      });
      chats.sort((a, b) => {
        const at = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
        const bt = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
        return bt - at;
      });
      renderChats(chats);

      if (!currentChatId && chats.length > 0) {
        openChat(chats[0].id, chats[0]);
      }
    }, (error) => {
      console.error("Failed to subscribe to chats:", error);
      alert(
        "Не удалось загрузить чаты. Проверьте Firestore (индексы/правила) и обновите страницу."
      );
    });
}

// Сохраняем изменения роли/темы в текущем чате (с небольшим debounce)
let saveChatSettingsTimer = null;
function scheduleSaveChatSettings() {
  const role = roleSelect.value || "friend";
  chatRoleLabelEl.textContent = ROLE_LABELS[role] || "Друг";
  currentTopic = (topicInput.value || "").trim();
  if (!currentUser || !currentChatId) return;
  if (saveChatSettingsTimer) clearTimeout(saveChatSettingsTimer);
  saveChatSettingsTimer = setTimeout(async () => {
    try {
      const topic = (topicInput.value || "").trim();
      currentTopic = topic;
      await db.collection("chats").doc(currentChatId).update({
        role,
        topic,
        updatedAt: new Date(),
      });
    } catch (e) {
      console.warn("Failed to save chat settings", e);
    }
  }, 350);
}

roleSelect.addEventListener("change", scheduleSaveChatSettings);
topicInput.addEventListener("input", scheduleSaveChatSettings);
btnTabStress?.addEventListener("click", () => showStressView());
btnStressBack?.addEventListener("click", () => showChatView());
btnTabChat?.addEventListener("click", () => showChatView());

function renderChats(chats) {
  chatsListEl.innerHTML = "";
  chats.forEach((chat) => {
    const li = document.createElement("li");
    li.className = "chat-item" + (chat.id === currentChatId ? " active" : "");
    li.dataset.id = chat.id;
    const roleLabel = ROLE_LABELS[chat.role] || "Друг";
    const lastTime = chat.updatedAt ? formatTime(chat.updatedAt) : "";
    const title = chat.title || "Без названия";

    li.innerHTML = `
      <div class="chat-item-top">
        <div class="chat-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
        <div class="chat-item-actions">
          <button class="chat-rename-btn" title="Переименовать чат" aria-label="Переименовать чат">✎</button>
          <button class="chat-delete-btn" title="Удалить чат" aria-label="Удалить чат">🗑</button>
        </div>
      </div>
      <div class="chat-item-meta">
        <span>${roleLabel}</span>
        <span>${lastTime}</span>
      </div>
    `;

    li.addEventListener("click", () => openChat(chat.id, chat));
    const renameBtn = li.querySelector(".chat-rename-btn");
    renameBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await renameChat(chat.id, title);
    });
    const deleteBtn = li.querySelector(".chat-delete-btn");
    deleteBtn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await deleteChat(chat.id, title);
    });
    chatsListEl.appendChild(li);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function renameChat(chatId, currentTitle) {
  const newTitleRaw = prompt("Введите новое название чата:", currentTitle || "");
  if (newTitleRaw === null) return;
  const newTitle = newTitleRaw.trim();
  if (!newTitle) {
    alert("Название не может быть пустым.");
    return;
  }
  if (newTitle === currentTitle) return;

  try {
    await db.collection("chats").doc(chatId).update({
      title: newTitle,
      updatedAt: new Date(),
    });
    if (chatId === currentChatId) {
      chatTitleEl.textContent = newTitle;
    }
  } catch (e) {
    console.error("renameChat failed", e);
    alert(
      "Не удалось переименовать чат. " +
        (e?.message ? `(${e.message})` : "")
    );
  }
}

async function deleteChat(chatId, title) {
  const ok = confirm(`Удалить чат "${title || "Без названия"}"? Это действие нельзя отменить.`);
  if (!ok) return;

  try {
    const messagesRef = db.collection("chats").doc(chatId).collection("messages");
    const snap = await messagesRef.get();
    const docs = [];
    snap.forEach((doc) => docs.push(doc));

    for (let i = 0; i < docs.length; i += 450) {
      const chunk = docs.slice(i, i + 450);
      const batch = db.batch();
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    await db.collection("chats").doc(chatId).delete();

    if (chatId === currentChatId) {
      currentChatId = null;
      chatTitleEl.textContent = "Новый чат";
      chatRoleLabelEl.textContent = ROLE_LABELS[roleSelect.value || "friend"] || "Друг";
      messagesContainerEl.innerHTML = "";
      messagesContainerEl.classList.add("empty");
    }
  } catch (e) {
    console.error("deleteChat failed", e);
    alert("Не удалось удалить чат. " + (e?.message ? `(${e.message})` : ""));
  }
}

btnNewChat.addEventListener("click", () => {
  createNewChat();
});

async function createNewChat() {
  if (!currentUser) return;
  const role = roleSelect.value || "friend";
  const now = new Date();

  try {
    const chatDoc = await db.collection("chats").add({
      userId: currentUser.uid,
      role,
      topic: "",
      title: "Новый чат",
      createdAt: now,
      updatedAt: now,
    });

    openChat(chatDoc.id, {
      id: chatDoc.id,
      role,
      topic: "",
      title: "Новый чат",
      createdAt: now,
      updatedAt: now,
    });

    // приветственное сообщение не должно ломать создание чата
    try {
      await db
        .collection("chats")
        .doc(chatDoc.id)
        .collection("messages")
        .add({
          sender: "ai",
          text:
            `Привет. Я рядом.\n` +
            `Можешь рассказать, что сейчас происходит и как ты себя чувствуешь?`,
          createdAt: new Date(),
        });
    } catch (e) {
      console.warn("Failed to create greeting message:", e);
    }

    return chatDoc.id;
  } catch (e) {
    console.error("createNewChat failed", e);
    alert(
      "Не удалось создать чат. Проверьте Firestore и попробуйте снова. " +
        (e?.message ? `(${e.message})` : "")
    );
    return null;
  }
}

function openChat(chatId, chatData) {
  currentChatId = chatId;
  const roleLabel = ROLE_LABELS[chatData.role] || "Друг";
  currentTopic = (chatData.topic || "").trim();

  chatTitleEl.textContent = chatData.title || "Мой разговор";
  chatRoleLabelEl.textContent = roleLabel;
  messagesContainerEl.innerHTML = "";
  messagesContainerEl.classList.add("empty");

  // обновим выбор роли под этот чат
  roleSelect.value = chatData.role || "friend";
  topicInput.value = currentTopic;

  if (messagesUnsubscribe) {
    messagesUnsubscribe();
  }

  messagesUnsubscribe = db
    .collection("chats")
    .doc(chatId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .onSnapshot((snapshot) => {
      const messages = [];
      snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() });
      });
      renderMessages(messages);
    });
}

function renderMessages(messages) {
  messagesContainerEl.innerHTML = "";
  if (!messages.length) {
    messagesContainerEl.classList.add("empty");
    return;
  }
  messagesContainerEl.classList.remove("empty");

  messages.forEach((msg) => {
    const row = document.createElement("div");
    row.className = "message-row " + (msg.sender === "user" ? "user" : "ai");

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = msg.text;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = formatTime(msg.createdAt);

    bubble.appendChild(meta);
    row.appendChild(bubble);
    messagesContainerEl.appendChild(row);
  });

  messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
}

// === Отправка сообщений и вызов ИИ ===
messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser || isSending) return;
  if (!currentChatId) {
    const newId = await createNewChat();
    if (!newId) return;
  }

  const text = messageInput.value.trim();
  if (!text) return;

  const now = new Date();
  const role = roleSelect.value || "friend";
  messageInput.value = "";

  isSending = true;
  setLoadingIndicator(true);

  try {
    // 1. Сохраняем сообщение пользователя
    const messagesRef = db
      .collection("chats")
      .doc(currentChatId)
      .collection("messages");

    await messagesRef.add({
      sender: "user",
      text,
      createdAt: now,
    });

    await analyzeAndSaveStress(text);

    try {
      const chatRef = db.collection("chats").doc(currentChatId);
      const chatSnap = await chatRef.get();
      const existingTitle = chatSnap.exists ? chatSnap.data()?.title : "";
      const isDefaultTitle = !existingTitle || existingTitle === "Новый чат";
      const patch = {
        role,
        updatedAt: now,
      };
      if (isDefaultTitle) {
        patch.title = generateChatTitleFromText(text, role);
      }

      await chatRef.update(patch);
    } catch (e) {
      console.warn("Failed to update chat header after user message:", e);
    }

    // 2. Получаем ответ ИИ
    let recent = [{ role: "user", content: text }];
    try {
      recent = await fetchRecentMessagesForAi(currentChatId, 12);
    } catch (e) {
      console.warn("Failed to fetch recent messages for AI context:", e);
    }

    const aiReply = await callAiApi({
      role,
      topic: getTopicForPrompt(),
      messages: recent,
    });

    const replyText =
      aiReply ||
      "Я сейчас не могу обратиться к ИИ, но я с вами. Попробуйте сформулировать, что вы чувствуете, и давайте подумаем вместе.";

    const replyTime = new Date();

    await messagesRef.add({
      sender: "ai",
      text: replyText,
      createdAt: replyTime,
    });

    try {
      await db.collection("chats").doc(currentChatId).update({
        updatedAt: replyTime,
      });
    } catch (e) {
      console.warn("Failed to update chat header after AI message:", e);
    }
  } catch (err) {
    console.error(err);
    alert(
      "Произошла ошибка при отправке сообщения: " +
        (err?.message || "unknown error")
    );
  } finally {
    isSending = false;
    setLoadingIndicator(false);
  }
});

function setLoadingIndicator(isLoading) {
  const selectedRole = roleSelect?.value || "friend";
  const roleLabel = ROLE_LABELS[selectedRole] || "Собеседник";
  if (typingStatusTextEl) {
    typingStatusTextEl.textContent = `${roleLabel} печатает`;
  }
  if (typingStatusEl) {
    typingStatusEl.classList.toggle("hidden", !isLoading);
  }

  if (isLoading) {
    let indicator = messagesContainerEl.querySelector(".loading-indicator");
    messagesContainerEl.classList.remove("empty");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "message-row ai loading-indicator";
      indicator.innerHTML = `
        <div class="message-bubble typing-bubble">
          <span class="typing-text">${escapeHtml(roleLabel)} печатает</span>
          <span class="typing-dots"><span></span><span></span><span></span></span>
        </div>
      `;
      messagesContainerEl.appendChild(indicator);
    } else {
      const textEl = indicator.querySelector(".typing-text");
      if (textEl) {
        textEl.textContent = `${roleLabel} печатает`;
      }
    }
    messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
  } else {
    const indicator = messagesContainerEl.querySelector(".loading-indicator");
    if (indicator) {
      indicator.remove();
    }
    if (!messagesContainerEl.querySelector(".message-row")) {
      messagesContainerEl.classList.add("empty");
    }
  }
}

async function fetchRecentMessagesForAi(chatId, limitCount = 20) {
  const snap = await db
    .collection("chats")
    .doc(chatId)
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(limitCount)
    .get();

  const rows = [];
  snap.forEach((doc) => {
    rows.push(doc.data());
  });

  rows.reverse(); // обратно по времени
  return rows
    .filter((m) => m && typeof m.text === "string")
    .map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text,
    }));
}

function dateKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

function subscribeToStressLogs() {
  if (!currentUser) return;
  if (stressLogsUnsubscribe) stressLogsUnsubscribe();

  stressLogsUnsubscribe = db
    .collection("stress_logs")
    .where("userId", "==", currentUser.uid)
    .onSnapshot((snapshot) => {
      const rows = [];
      snapshot.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
      stressLogs = rows;
      renderCalendar();
    }, (error) => {
      console.error("Failed to subscribe stress logs:", error);
      alert(
        "Не удалось загрузить данные календаря стресса. " +
          (error?.message ? `(${error.message})` : "")
      );
    });
}

function getStressForDay(key) {
  return stressLogs.find((x) => x.date === key) || null;
}

function isDateInCurrentMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return (
    y === currentMonth.getFullYear() &&
    m === currentMonth.getMonth() + 1
  );
}

function renderCalendar() {
  if (!calendarGridEl || !stressMonthTitleEl) return;
  const { start, end } = monthRange(currentMonth);
  stressMonthTitleEl.textContent = currentMonth.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
  calendarGridEl.innerHTML = "";

  const offset = (start.getDay() + 6) % 7; // monday start
  for (let i = 0; i < offset; i += 1) {
    const blank = document.createElement("div");
    calendarGridEl.appendChild(blank);
  }

  for (let d = 1; d <= end.getDate(); d += 1) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d);
    const key = dateKeyFromDate(date);
    const log = getStressForDay(key);
    const btn = document.createElement("button");
    btn.className = "day-cell";
    if (log?.level) btn.classList.add(log.level);
    if (selectedDateKey === key) btn.classList.add("selected");
    const levelClass = log?.level ? ` ${log.level}` : "";
    btn.innerHTML = `
      <span class="day-number">${d}</span>
      <span class="day-indicator${levelClass}"></span>
    `;
    btn.addEventListener("click", () => selectDay(key));
    calendarGridEl.appendChild(btn);
  }

  if (!selectedDateKey || !isDateInCurrentMonth(selectedDateKey)) {
    selectedDateKey = dateKeyFromDate(start);
  }
  updateSelectedDayPanel();
}

function selectDay(key) {
  selectedDateKey = key;
  subscribeToSelectedDayNotes();
  renderCalendar();
}

function updateSelectedDayPanel() {
  if (!selectedDateKey) return;
  const log = getStressForDay(selectedDateKey);
  selectedDayTitleEl.textContent = `День: ${selectedDateKey}`;
  selectedDayLevelEl.textContent = `Уровень: ${
    log?.level === "high" ? "Высокий" : log?.level === "medium" ? "Средний" : log?.level === "low" ? "Низкий" : "—"
  }`;
  renderSelectedDayNotes();
}

btnMonthPrev?.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  subscribeToStressLogs();
});
btnMonthNext?.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  subscribeToStressLogs();
});
btnSaveDayNote?.addEventListener("click", async () => {
  if (!currentUser || !selectedDateKey) return;
  try {
    const text = (dayNoteInput.value || "").trim();
    if (!text) {
      alert("Введите текст заметки.");
      return;
    }
    const payload = {
      userId: currentUser.uid,
      date: selectedDateKey,
      text,
      createdAt: new Date(),
    };
    await db.collection("stress_notes").add(payload);
    dayNoteInput.value = "";
  } catch (e) {
    console.error("save day note failed", e);
    alert("Не удалось сохранить заметку. " + (e?.message ? `(${e.message})` : ""));
  }
});

async function analyzeAndSaveStress(text) {
  if (!currentUser) return;
  try {
    const response = await fetch(`${BACKEND_URL}/api/stress/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) return;
    const data = await response.json();
    const today = dateKeyFromDate(new Date());
    const docId = `${currentUser.uid}_${today}`;
    const existing = getStressForDay(today);
    const score = Number(data.score || 0);
    const level = data.level || "low";
    const previousScore = Number(existing?.score || 0);
    // Сглаживание: хорошие сообщения могут понижать уровень, тревожные — повышать.
    const mergedScore = existing
      ? Math.min(1, Math.max(0, previousScore * 0.7 + score * 0.3))
      : Math.min(1, Math.max(0, score));
    const merged = {
      score: mergedScore,
      level: mergedScore >= 0.65 ? "high" : mergedScore >= 0.35 ? "medium" : "low",
    };
    await db.collection("stress_logs").doc(docId).set(
      {
        userId: currentUser.uid,
        date: today,
        score: merged.score,
        level: merged.level,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("stress analyze failed", e);
  }
}

function subscribeToSelectedDayNotes() {
  if (!currentUser || !selectedDateKey) return;
  if (stressNotesUnsubscribe) stressNotesUnsubscribe();
  stressNotesUnsubscribe = db
    .collection("stress_notes")
    .where("userId", "==", currentUser.uid)
    .where("date", "==", selectedDateKey)
    .onSnapshot((snapshot) => {
      const rows = [];
      snapshot.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
      rows.sort((a, b) => {
        const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bt - at;
      });
      stressNotes = rows;
      renderSelectedDayNotes();
    }, (error) => {
      console.error("notes subscribe failed", error);
    });
}

function renderSelectedDayNotes() {
  if (!dayNotesListEl) return;
  dayNotesListEl.innerHTML = "";
  if (!stressNotes.length) {
    const li = document.createElement("li");
    li.className = "day-note-item";
    li.textContent = "Пока нет заметок за этот день.";
    dayNotesListEl.appendChild(li);
    return;
  }
  stressNotes.forEach((n) => {
    const li = document.createElement("li");
    li.className = "day-note-item";
    const t = document.createElement("div");
    t.textContent = n.text || "";
    const time = document.createElement("div");
    time.className = "day-note-time";
    time.textContent = n.createdAt?.toDate
      ? formatTime(n.createdAt)
      : "";
    li.appendChild(t);
    li.appendChild(time);
    dayNotesListEl.appendChild(li);
  });
}

// === Вызов бэка (OpenRouter) ===
async function callAiApi({ role, topic, messages }) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        topic,
        messages,
      }),
    });

    if (!response.ok) {
      console.warn("Backend error", await response.text());
      return null;
    }

    const data = await response.json();
    return data?.text ? String(data.text).trim() : null;
  } catch (e) {
    console.warn("Backend request failed", e);
    return null;
  }
}

