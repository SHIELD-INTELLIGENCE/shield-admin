"use client";

import React, { useState, useEffect } from "react";
import FeedsTab from "../FeedsTab.jsx";
import EmployeesTab from "../EmployeesTab.jsx";
import WantedsTab from "../WantedTab.jsx";
import UsersTab from "../UsersTab.jsx";
import "./global.css";

import { auth, db, usersCollection } from "../firebase.js";

import { doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function isAnyAdminConfigured() {
  const q = query(usersCollection, where("role", "==", "admin"), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

async function isAuthUserAdmin(user) {
  if (!user) return false;
  const email = normalizeEmail(user.email);
  if (!email) return false;

  const byId = await getDoc(doc(db, "users", email));
  if (byId.exists()) {
    const role = byId.data()?.role || "user";
    return role === "admin";
  }

  // Legacy fallback: query users where email field matches.
  const q = query(usersCollection, where("email", "==", email), limit(10));
  const snap = await getDocs(q);
  if (snap.empty) return false;
  let admin = false;
  snap.forEach((d) => {
    const role = d.data()?.role || "user";
    if (role === "admin") admin = true;
  });
  return admin;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  function toggleTab(tabKey) {
    setActiveTab((prev) => (prev === tabKey ? "" : tabKey));
  }

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (cancelled) return;

        if (!user) {
          setLoggedIn(false);
          setCheckingSession(false);
          return;
        }

        const normalized = normalizeEmail(user.email);
        setEmail(normalized);

        const adminsExist = await isAnyAdminConfigured();
        if (!adminsExist) {
          await signOut(auth);
          setLoggedIn(false);
          setError(
            "No admins are configured yet. Create an admin, then try again."
          );
          setCheckingSession(false);
          return;
        }

        const ok = await isAuthUserAdmin(user);
        if (ok) {
          setLoggedIn(true);
          setActiveTab("feeds");
        } else {
          await signOut(auth);
          setLoggedIn(false);
          setError("This account is not in the admin group.");
        }
      } catch (e) {
        console.error("Auth/session check failed:", e);
        setLoggedIn(false);
        setError("Session check failed. Try again.");
      } finally {
        setCheckingSession(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function handleLogin() {
    if (isLoggingIn) return;

    setError("");
    setNotice("");

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError("Enter your email.");
      return;
    }

    try {
      setIsLoggingIn(true);
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      // onAuthStateChanged will finish gating + redirecting.
    } catch (e) {
      console.error("Login failed:", e);
      setError("Login failed. Check email/password and try again.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout failed:", e);
    }
    setLoggedIn(false);
    setPassword("");
    setEmail("");
    setNotice("");
    setActiveTab("feeds");
  }

  if (checkingSession) {
    return (
      <div style={{ maxWidth: 400, margin: "auto", marginTop: 50 }}>
        <p>Checking session...</p>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div
        id="login-screen"
        style={{ maxWidth: 400, margin: "auto", marginTop: 50 }}
      >
        <h2>Admin Login</h2>
        <input
          type="email"
          placeholder="Enter email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
            setNotice("");
          }}
          disabled={isLoggingIn}
        />
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(""); // clear error on input change
            setNotice("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLogin();
          }}
          autoFocus
          disabled={isLoggingIn}
        />
        <button onClick={handleLogin} disabled={isLoggingIn || !email.trim() || !password.trim()}>
          {isLoggingIn ? "Logging in..." : "Login"}
        </button>

        {notice && <p style={{ color: "#4ade80", marginTop: 8 }}>{notice}</p>}
        {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div
      id="dashboard-screen"
      style={{
        maxWidth: 900,
        margin: "auto",
        minHeight: "calc(100vh - 48px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h1>SHIELD Admin Panel</h1>
      <nav style={{ marginBottom: 20 }} className="tabs" role="tablist" aria-label="Main tabs">
        <button
          className={`tab-button ${activeTab === "feeds" ? "active" : ""}`}
          aria-pressed={activeTab === "feeds"}
          onClick={() => toggleTab("feeds")}
        >
          Feeds
        </button>
        <button
          className={`tab-button ${activeTab === "wanteds" ? "active" : ""}`}
          aria-pressed={activeTab === "wanteds"}
          onClick={() => toggleTab("wanteds")}
        >
          Wanteds
        </button>
        <button
          className={`tab-button ${activeTab === "employees" ? "active" : ""}`}
          aria-pressed={activeTab === "employees"}
          onClick={() => toggleTab("employees")}
        >
          Employees
        </button>
        <button
          className={`tab-button ${activeTab === "users" ? "active" : ""}`}
          aria-pressed={activeTab === "users"}
          onClick={() => toggleTab("users")}
        >
          Users
        </button>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button  onClick={handleLogout}>Logout</button>
      </div>

      <div style={{ flex: 1 }}>
        {activeTab === "feeds" && <FeedsTab />}
        {activeTab === "wanteds" && <WantedsTab />}
        {activeTab === "employees" && <EmployeesTab />}
        {activeTab === "users" && <UsersTab />}
      </div>
    </div>
  );
}
