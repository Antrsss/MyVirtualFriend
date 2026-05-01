window.AppState = {
  currentUser: null,
  currentChatId: null,
  currentTopic: "",

  chatsUnsubscribe: null,
  messagesUnsubscribe: null,
  stressLogsUnsubscribe: null,
  stressNotesUnsubscribe: null,

  stressLogs: [],
  stressNotes: [],
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDateKey: null,

  correlationRowsCache: [],

  isSending: false,
};

