"use client";

import React, { useState, useEffect } from "react";
import FeedsTab from "../FeedsTab.jsx";
import EmployeesTab from "../EmployeesTab.jsx";
import WantedsTab from "../WantedTab.jsx";
import "./global.css";

const PASSWORD = process.env.NEXT_PUBLIC_PASSWORD;

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (localStorage.getItem("loggedIn") === "true") {
        setLoggedIn(true);
      }
    }
  }, []);

  function handleLogin() {
    if (password === PASSWORD) {
      if (typeof window !== "undefined") {
        localStorage.setItem("loggedIn", "true");
      }
      setLoggedIn(true);
      setError(""); // clear error on success
    } else {
      setError("Incorrect password. Contact HQ if you forgot.");
    }
  }

  function handleLogout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("loggedIn");
    }
    setLoggedIn(false);
    setPassword("");
    setActiveTab("feeds");
  }

  if (!loggedIn) {
    return (
      <div
        id="login-screen"
        style={{ maxWidth: 400, margin: "auto", marginTop: 50 }}
      >
        <h2>Admin Login</h2>
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(""); // clear error on input change
          }}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          autoFocus
        />
        <button onClick={handleLogin} disabled={!password.trim()}>
          Login
        </button>
        {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div id="dashboard-screen" style={{ maxWidth: 900, margin: "auto", marginTop: 50 }}>
      <h1>SHIELD Admin Panel</h1>
      <nav style={{ marginBottom: 20 }} className="tabs" role="tablist" aria-label="Main tabs">
        <button
          className={`tab-button ${activeTab === "feeds" ? "active" : ""}`}
          aria-pressed={activeTab === "feeds"}
          onClick={() => setActiveTab("feeds")}
        >
          Feeds
        </button>
        <button
          className={`tab-button ${activeTab === "wanteds" ? "active" : ""}`}
          aria-pressed={activeTab === "wanteds"}
          onClick={() => setActiveTab("wanteds")}
        >
          Wanteds
        </button>
        <button
          className={`tab-button ${activeTab === "employees" ? "active" : ""}`}
          aria-pressed={activeTab === "employees"}
          onClick={() => setActiveTab("employees")}
        >
          Employees
        </button>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button  onClick={handleLogout}>Logout</button>
      </div>

      <div>
        {activeTab === "feeds" && <FeedsTab />}
        {activeTab === "wanteds" && <WantedsTab />}
        {activeTab === "employees" && <EmployeesTab />}
      </div>
    </div>
  );
}
