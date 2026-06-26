(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let theme = stored || (prefersDark ? "dark" : "light");

  function applyTheme(value) {
    theme = value;
    localStorage.setItem("theme", value);
    if (value === "dark") {
      root.classList.add("theme-dark");
    } else {
      root.classList.remove("theme-dark");
    }
    document.querySelectorAll(".theme-toggle label").forEach((label) => {
      const input = label.querySelector("input");
      const checked = input && input.value === value;
      label.classList.toggle("checked", Boolean(checked));
      if (input) input.checked = Boolean(checked);
    });
  }

  applyTheme(theme);

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "theme-toggle") return;
    applyTheme(target.value);
  });
})();
