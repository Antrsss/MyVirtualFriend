window.AppUtils = (() => {
  function formatTime(date) {
    const d =
      date instanceof Date ? date : date?.toDate ? date.toDate() : new Date();
    return d.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
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

  function toTimestamp(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate().getTime();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }

  function dateKeyFromDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function tokenizeWords(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  return {
    formatTime,
    escapeHtml,
    toTimestamp,
    dateKeyFromDate,
    tokenizeWords,
  };
})();

