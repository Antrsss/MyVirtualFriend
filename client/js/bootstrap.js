(function bootstrap() {
  const dom = window.AppDom;
  const views = window.AppViews;
  const state = window.AppState;

  window.AppAuth.initAuthUi();
  window.AppChat.initChatUi();
  window.AppStress.initStressUi();

  dom.btnTabStress?.addEventListener("click", () => {
    if (!state.selectedDateKey) state.selectedDateKey = window.AppUtils.dateKeyFromDate(new Date());
    window.AppStress.subscribeToSelectedDayNotes();
    window.AppStress.renderCalendar();
    views.showStressView();
  });

  dom.btnTabCorrelation?.addEventListener("click", async () => {
    views.showCorrelationView();
    await window.AppCorrelation.recompute();
  });

  dom.btnStressToChat?.addEventListener("click", () => views.showChatView());
  dom.btnStressToCorrelation?.addEventListener("click", async () => {
    views.showCorrelationView();
    await window.AppCorrelation.recompute();
  });
  dom.btnCorrelationToChat?.addEventListener("click", () => views.showChatView());
  dom.btnCorrelationToStress?.addEventListener("click", () => {
    if (!state.selectedDateKey) state.selectedDateKey = window.AppUtils.dateKeyFromDate(new Date());
    window.AppStress.subscribeToSelectedDayNotes();
    window.AppStress.renderCalendar();
    views.showStressView();
  });

  dom.btnRecomputeCorrelation?.addEventListener("click", () => window.AppCorrelation.recompute());

  window.AppAuth.initAuthState(() => {
    window.AppChat.subscribeToChats();
    window.AppStress.subscribeToStressLogs();
  });
})();

