import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "@/auth/AuthContext";
import { SessionPresenceProvider } from "@/auth/SessionPresence";
import { ToastProvider } from "@/components/Toast";
import "./index.css";

// Match the basename to Vite's `base` config so the router emits links
// under the right prefix (e.g. /roomflix/* on GH Pages project pages).
// Strip the trailing slash because react-router's basename should not
// end in one.
const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, "");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={ROUTER_BASENAME || undefined}>
      <ToastProvider>
        <AuthProvider>
          <SessionPresenceProvider>
            <App />
          </SessionPresenceProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
