window.AppConfig = (() => {
  const ROLE_LABELS = {
    friend: "Друг",
    sister: "Сестра",
    brother: "Брат",
    mom: "Мама",
    dad: "Папа",
    partner: "Любимый человек",
  };

  const BACKEND_URL = "http://localhost:8788";

  return { ROLE_LABELS, BACKEND_URL };
})();

