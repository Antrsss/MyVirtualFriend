window.AppChat = (() => {
  const { ROLE_LABELS } = window.AppConfig;
  const { formatTime, escapeHtml } = window.AppUtils;
  const dom = window.AppDom;
  const state = window.AppState;

  function generateChatTitleFromText(text, role) {
    const roleLabel = ROLE_LABELS[role] || "Диалог";
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return `Диалог (${roleLabel})`;
    const firstChunk = cleaned.split(/[.!?]/)[0].trim() || cleaned;
    return firstChunk.length > 36 ? `${firstChunk.slice(0, 36)}...` : firstChunk;
  }

  function renderChats(chats) {
    dom.chatsListEl.innerHTML = "";
    chats.forEach((chat) => {
      const li = document.createElement("li");
      li.className = "chat-item" + (chat.id === state.currentChatId ? " active" : "");
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

      li.querySelector(".chat-rename-btn")?.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await renameChat(chat.id, title);
      });
      li.querySelector(".chat-delete-btn")?.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await deleteChat(chat.id, title);
      });

      dom.chatsListEl.appendChild(li);
    });
  }

  function subscribeToChats() {
    if (!state.currentUser) return;
    if (state.chatsUnsubscribe) state.chatsUnsubscribe();

    state.chatsUnsubscribe = db
      .collection("chats")
      .where("userId", "==", state.currentUser.uid)
      .onSnapshot(
        (snapshot) => {
          const chats = [];
          snapshot.forEach((doc) => chats.push({ id: doc.id, ...doc.data() }));
          chats.sort((a, b) => {
            const at = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
            const bt = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
            return bt - at;
          });
          renderChats(chats);
          if (!state.currentChatId && chats.length > 0) openChat(chats[0].id, chats[0]);
        },
        (error) => {
          console.error("Failed to subscribe to chats:", error);
          alert("Не удалось загрузить чаты.");
        }
      );
  }

  async function createNewChat() {
    if (!state.currentUser) return null;
    const role = dom.roleSelect.value || "friend";
    const now = new Date();
    const chatDoc = await db.collection("chats").add({
      userId: state.currentUser.uid,
      role,
      topic: "",
      title: "Новый чат",
      createdAt: now,
      updatedAt: now,
    });
    openChat(chatDoc.id, { id: chatDoc.id, role, topic: "", title: "Новый чат" });
    return chatDoc.id;
  }

  function openChat(chatId, chatData) {
    state.currentChatId = chatId;
    dom.chatTitleEl.textContent = chatData.title || "Мой разговор";
    dom.chatRoleLabelEl.textContent = ROLE_LABELS[chatData.role] || "Друг";
    state.currentTopic = (chatData.topic || "").trim();
    dom.topicInput.value = state.currentTopic;
    dom.roleSelect.value = chatData.role || "friend";

    if (state.messagesUnsubscribe) state.messagesUnsubscribe();
    state.messagesUnsubscribe = db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .orderBy("createdAt", "asc")
      .onSnapshot((snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => messages.push({ id: doc.id, ...doc.data() }));
        renderMessages(messages);
      });
  }

  function renderMessages(messages) {
    dom.messagesContainerEl.innerHTML = "";
    if (!messages.length) {
      dom.messagesContainerEl.classList.add("empty");
      return;
    }
    dom.messagesContainerEl.classList.remove("empty");

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
      dom.messagesContainerEl.appendChild(row);
    });

    dom.messagesContainerEl.scrollTop = dom.messagesContainerEl.scrollHeight;
  }

  async function renameChat(chatId, currentTitle) {
    const raw = prompt("Введите новое название чата:", currentTitle || "");
    if (raw === null) return;
    const title = raw.trim();
    if (!title) return alert("Название не может быть пустым.");
    await db.collection("chats").doc(chatId).update({ title, updatedAt: new Date() });
    if (chatId === state.currentChatId) dom.chatTitleEl.textContent = title;
  }

  async function deleteChat(chatId, title) {
    const ok = confirm(`Удалить чат "${title || "Без названия"}"?`);
    if (!ok) return;
    const messagesRef = db.collection("chats").doc(chatId).collection("messages");
    const snap = await messagesRef.get();
    const docs = [];
    snap.forEach((d) => docs.push(d));
    for (let i = 0; i < docs.length; i += 450) {
      const batch = db.batch();
      docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await db.collection("chats").doc(chatId).delete();
    if (chatId === state.currentChatId) {
      state.currentChatId = null;
      dom.messagesContainerEl.innerHTML = "";
      dom.messagesContainerEl.classList.add("empty");
    }
  }

  async function fetchRecentMessagesForAi(chatId, limitCount = 60) {
    const snap = await db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();
    const rows = [];
    snap.forEach((doc) => rows.push(doc.data()));
    rows.reverse();
    return rows
      .filter((m) => m && typeof m.text === "string")
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));
  }

  function buildConversationForAi(messages) {
    if (!Array.isArray(messages) || !messages.length) return [];
    const history = messages.slice(0, -18);
    const recent = messages.slice(-18);
    if (!history.length) return recent;
    const memoryLines = [];
    for (const m of history) {
      const text = String(m.content || "").trim();
      if (!text) continue;
      memoryLines.push(m.role === "user" ? `Пользователь: ${text}` : `Собеседник: ${text}`);
    }
    const memoryText = memoryLines.slice(-14).join("\n");
    if (!memoryText) return recent;
    return [
      {
        role: "system",
        content:
          "Память диалога (сжатая, из более ранних сообщений):\n" +
          memoryText +
          "\nИспользуй это как контекст, чтобы сохранить связанность разговора.",
      },
      ...recent,
    ];
  }

  async function callAiApi({ role, topic, messages }) {
    const { BACKEND_URL } = window.AppConfig;
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, topic, messages }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.text ? String(data.text).trim() : null;
  }

  function setTyping(isLoading) {
    const roleLabel = ROLE_LABELS[dom.roleSelect.value || "friend"] || "Собеседник";
    dom.typingStatusTextEl.textContent = `${roleLabel} печатает`;
    dom.typingStatusEl.classList.toggle("hidden", !isLoading);
  }

  async function handleSendMessage() {
    if (!state.currentUser || state.isSending) return;
    if (!state.currentChatId) {
      const id = await createNewChat();
      if (!id) return;
    }
    const text = dom.messageInput.value.trim();
    if (!text) return;
    dom.messageInput.value = "";

    state.isSending = true;
    setTyping(true);
    const now = new Date();
    const role = dom.roleSelect.value || "friend";
    const messagesRef = db.collection("chats").doc(state.currentChatId).collection("messages");

    try {
      await messagesRef.add({ sender: "user", text, createdAt: now });
      await window.AppStress?.analyzeAndSaveStress(text, { signalType: "chat" });

      // update chat header/title
      try {
        const chatRef = db.collection("chats").doc(state.currentChatId);
        const snap = await chatRef.get();
        const existingTitle = snap.exists ? snap.data()?.title : "";
        const patch = { role, updatedAt: now };
        if (!existingTitle || existingTitle === "Новый чат") {
          patch.title = generateChatTitleFromText(text, role);
        }
        await chatRef.update(patch);
      } catch (_) {}

      const recent = await fetchRecentMessagesForAi(state.currentChatId, 60);
      const payload = buildConversationForAi(recent);
      const reply = await callAiApi({ role, topic: state.currentTopic, messages: payload });
      const replyText =
        reply ||
        "Я сейчас не могу обратиться к ИИ, но я с вами. Попробуйте сформулировать, что вы чувствуете, и давайте подумаем вместе.";
      await messagesRef.add({ sender: "ai", text: replyText, createdAt: new Date() });
    } finally {
      state.isSending = false;
      setTyping(false);
    }
  }

  function initChatUi() {
    dom.btnNewChat?.addEventListener("click", () => createNewChat());
    dom.messageForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSendMessage();
    });
  }

  return { initChatUi, subscribeToChats, createNewChat, openChat };
})();

