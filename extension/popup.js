const u = document.getElementById("u");
const t = document.getElementById("t");

chrome.storage.sync.get(["token", "appUrl"]).then(({ token, appUrl }) => {
  u.value = appUrl || "http://localhost:3000";
  t.value = token || "";
});

document.getElementById("b").onclick = async () => {
  await chrome.storage.sync.set({ token: t.value.trim(), appUrl: u.value.trim() || "http://localhost:3000" });
  document.getElementById("s").textContent = "Zapisano ✓";
  setTimeout(() => (document.getElementById("s").textContent = ""), 1800);
};
