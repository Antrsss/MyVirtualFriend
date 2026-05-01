window.AppDom = (() => {
  const $ = (id) => document.getElementById(id);

  return {
    authViewEl: $("auth-view"),
    chatViewEl: $("chat-view"),
    stressViewEl: $("stress-view"),
    correlationViewEl: $("correlation-view"),

    btnShowLogin: $("btn-show-login"),
    btnShowRegister: $("btn-show-register"),
    loginForm: $("login-form"),
    registerForm: $("register-form"),
    authErrorEl: $("auth-error"),

    btnLogout: $("btn-logout"),
    roleSelect: $("role"),
    topicInput: $("topic-input"),
    btnTabChat: $("btn-tab-chat"),
    btnTabStress: $("btn-tab-stress"),
    btnTabCorrelation: $("btn-tab-correlation"),

    btnNewChat: $("btn-new-chat"),
    chatsListEl: $("chats-list"),
    chatTitleEl: $("chat-title"),
    chatRoleLabelEl: $("chat-role-label"),
    messagesContainerEl: $("messages-container"),
    typingStatusEl: $("typing-status"),
    typingStatusTextEl: $("typing-status-text"),
    messageForm: $("message-form"),
    messageInput: $("message-input"),

    btnStressToChat: $("btn-stress-to-chat"),
    btnStressToCorrelation: $("btn-stress-to-correlation"),
    calendarGridEl: $("calendar-grid"),
    stressMonthTitleEl: $("stress-month-title"),
    btnMonthPrev: $("btn-month-prev"),
    btnMonthNext: $("btn-month-next"),
    selectedDayTitleEl: $("selected-day-title"),
    selectedDayLevelEl: $("selected-day-level"),
    dayNoteInput: $("day-note-input"),
    btnSaveDayNote: $("btn-save-day-note"),
    dayNotesListEl: $("day-notes-list"),

    btnCorrelationToChat: $("btn-correlation-to-chat"),
    btnCorrelationToStress: $("btn-correlation-to-stress"),
    btnRecomputeCorrelation: $("btn-recompute-correlation"),
    correlationTableBodyEl: $("correlation-table-body"),
    correlationSampleInfoEl: $("correlation-sample-info"),
    correlationWarningEl: $("correlation-warning"),
  };
})();

