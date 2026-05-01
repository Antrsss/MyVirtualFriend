window.AppViews = (() => {
  const { authViewEl, chatViewEl, stressViewEl, correlationViewEl, btnTabChat, btnTabStress, btnTabCorrelation } =
    window.AppDom;

  function showAuthView() {
    authViewEl.classList.add("active");
    chatViewEl.classList.remove("active");
    stressViewEl.classList.remove("active");
    correlationViewEl.classList.remove("active");
  }

  function showChatView() {
    authViewEl.classList.remove("active");
    stressViewEl.classList.remove("active");
    correlationViewEl.classList.remove("active");
    chatViewEl.classList.add("active");
    btnTabChat?.classList.add("active-tab");
    btnTabStress?.classList.remove("active-tab");
    btnTabCorrelation?.classList.remove("active-tab");
  }

  function showStressView() {
    authViewEl.classList.remove("active");
    chatViewEl.classList.remove("active");
    correlationViewEl.classList.remove("active");
    stressViewEl.classList.add("active");
    btnTabStress?.classList.add("active-tab");
    btnTabChat?.classList.remove("active-tab");
    btnTabCorrelation?.classList.remove("active-tab");
  }

  function showCorrelationView() {
    authViewEl.classList.remove("active");
    chatViewEl.classList.remove("active");
    stressViewEl.classList.remove("active");
    correlationViewEl.classList.add("active");
    btnTabCorrelation?.classList.add("active-tab");
    btnTabChat?.classList.remove("active-tab");
    btnTabStress?.classList.remove("active-tab");
  }

  return { showAuthView, showChatView, showStressView, showCorrelationView };
})();

