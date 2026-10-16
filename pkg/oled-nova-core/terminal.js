import cockpit from "cockpit";
import { TerminalPage } from "./lib/termpage.js";
import { load } from "./lib/settings.js";

cockpit.translate();

function init() {
    const root = document.getElementById("oled-root");
    const page = new TerminalPage(load());
    root.appendChild(page.element);
    cockpit.user()
            .then(u => page.start(u.home || "/"))
            .catch(() => page.start("/"));
    window.addEventListener("beforeunload", () => page.stop());
}

if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
else
    init();
