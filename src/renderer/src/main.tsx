import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

window.addEventListener("error", (e) => window.komensky.log("error", `window error: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => window.komensky.log("error", `unhandled rejection: ${String((e.reason as Error)?.message ?? e.reason)}`));

createRoot(document.getElementById("root")!).render(<App />);
