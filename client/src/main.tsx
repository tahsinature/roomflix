import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "@/auth/AuthContext";
import { SessionPresenceProvider } from "@/auth/SessionPresence";
import { StorageConfigSync } from "@/lib/buckets/sync";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SessionPresenceProvider>
          <StorageConfigSync />
          <App />
        </SessionPresenceProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
