import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "@/auth/AuthContext";
import { SessionPresenceProvider } from "@/auth/SessionPresence";
import { ToastProvider } from "@/components/Toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <ToastProvider>
          <AuthProvider>
            <SessionPresenceProvider>
              <App />
            </SessionPresenceProvider>
          </AuthProvider>
        </ToastProvider>
      </TooltipProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
