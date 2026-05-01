window.AppAuth = (() => {
  const { btnShowLogin, btnShowRegister, loginForm, registerForm, authErrorEl, btnLogout } =
    window.AppDom;
  const { showChatView, showAuthView } = window.AppViews;
  const state = window.AppState;

  function initAuthUi() {
    btnShowLogin?.addEventListener("click", () => {
      btnShowLogin.classList.add("active");
      btnShowRegister.classList.remove("active");
      loginForm.classList.remove("hidden");
      registerForm.classList.add("hidden");
      authErrorEl.textContent = "";
    });

    btnShowRegister?.addEventListener("click", () => {
      btnShowLogin.classList.remove("active");
      btnShowRegister.classList.add("active");
      loginForm.classList.add("hidden");
      registerForm.classList.remove("hidden");
      authErrorEl.textContent = "";
    });

    loginForm?.addEventListener("submit", async (e) => {
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

    registerForm?.addEventListener("submit", async (e) => {
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

    btnLogout?.addEventListener("click", () => auth.signOut());
  }

  function cleanupSubscriptions() {
    const keys = ["messagesUnsubscribe", "chatsUnsubscribe", "stressLogsUnsubscribe", "stressNotesUnsubscribe"];
    for (const k of keys) {
      if (state[k]) {
        try { state[k](); } catch (_) {}
        state[k] = null;
      }
    }
  }

  function initAuthState(onSignedIn) {
    auth.onAuthStateChanged((user) => {
      state.currentUser = user;
      if (user) {
        showChatView();
        onSignedIn?.(user);
      } else {
        cleanupSubscriptions();
        showAuthView();
        state.currentChatId = null;
      }
    });
  }

  return { initAuthUi, initAuthState, cleanupSubscriptions };
})();

