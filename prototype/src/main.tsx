import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root");

window.addEventListener("error", (event) => {
  if (!root) return;
  root.innerHTML = `<pre style="padding:24px;white-space:pre-wrap">${event.message}</pre>`;
});

createRoot(root!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
