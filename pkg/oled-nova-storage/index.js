import cockpit from "cockpit";
import { FileStudio } from "./lib/filestudio.js";

cockpit.translate();

function init() {
    const root = document.getElementById("oled-root");
    const app = new FileStudio();
    root.appendChild(app.element);
    cockpit.user()
            .then(u => app.start(u.home || "/"))
            .catch(() => app.start("/"));
}

if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
else
    init();
