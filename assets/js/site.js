document.querySelectorAll("[data-toggle-password]").forEach(button => {
  button.addEventListener("click", () => {
    const id = button.getAttribute("data-toggle-password");
    const input = document.getElementById(id);
    if (!input) return;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.innerHTML = visible ? '<i data-lucide="eye"></i>' : '<i data-lucide="eye-off"></i>';
    if (window.lucide) lucide.createIcons();
  });
});