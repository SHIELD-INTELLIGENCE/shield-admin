"use client";

import React, { useState, useEffect, useMemo } from "react";
import FeedsTab from "../Tabs/FeedsTab.jsx";
import EmployeesTab from "../Tabs/EmployeesTab.jsx";
import WantedsTab from "../Tabs/WantedTab.jsx";
import UsersTab from "../Tabs//UsersTab.jsx";
import JoinApplicationsTab from "../Tabs/JoinApplicationsTab.jsx";
import ServiceRequestsTab from "../Tabs/ServiceRequestsTab.jsx";
import "../global.css";

import { auth, db, usersCollection } from "../firebase.js";

import { doc, getDoc, getDocs, limit, query, where, collection, onSnapshot, deleteDoc, updateDoc } from "firebase/firestore";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function getAuthErrorMessage(error) {
  const code = error?.code || "";

  if (code === "auth/invalid-credential") {
    return "Invalid credentials or Email/Password sign-in is disabled in Firebase Auth.";
  }
  if (code === "auth/invalid-email") {
    return "Invalid email format.";
  }
  if (code === "auth/user-disabled") {
    return "This account is disabled.";
  }
  if (code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "Incorrect email or password.";
  }
  if (code === "auth/invalid-api-key") {
    return "Invalid Firebase API key. Check NEXT_PUBLIC_API_KEY in .env.local and rebuild.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error. Check your internet connection and try again.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many failed attempts. Please wait a bit and try again.";
  }

  return "Login failed. Check your email/password and Firebase Auth setup.";
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

const ALERT_META = {
  expired: { label: "Expired", color: "#7f1d1d", order: 0 },
  "2_day_warning": { label: "2 Day Warning", color: "#dc2626", order: 1 },
  "5_day_warning": { label: "5 Day Warning", color: "#f97316", order: 2 },
  "10_day_warning": { label: "10 Day Warning", color: "#ca8a04", order: 3 },
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysRemaining(billingEndDate) {
  if (!billingEndDate) return null;
  const end = new Date(billingEndDate);
  if (Number.isNaN(end.getTime())) return null;
  const diffMs = startOfDay(end).getTime() - startOfDay(new Date()).getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getAlertType(daysRemaining) {
  if (daysRemaining === null) return null;
  if (daysRemaining <= 0) return "expired";
  if (daysRemaining <= 2) return "2_day_warning";
  if (daysRemaining <= 5) return "5_day_warning";
  if (daysRemaining <= 10) return "10_day_warning";
  return null;
}

function buildReminderMessage(daysRemaining) {
  if (daysRemaining <= 0) {
    return "Hi, your SHIELD plan has expired. Please renew to avoid service interruption.";
  }
  return `Hi, your SHIELD plan expires in ${daysRemaining} days. Please renew to avoid service interruption.`;
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
  const [joinApplicationsData, setJoinApplicationsData] = useState([]);
  const [serviceRequestsData, setServiceRequestsData] = useState([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [focusRequestId, setFocusRequestId] = useState(null);

  function toggleTab(tabKey) {
    setActiveTab((prev) => (prev === tabKey ? "" : tabKey));
  }

  useEffect(() => {
    // realtime listeners for joinApplications and serviceRequests
    const joinCol = collection(db, "joinApplications");
    const unsubJoin = onSnapshot(
      joinCol,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const dd = d.data() || {};
          return {
            id: d.id,
            ...dd,
            createdAt: dd.createdAt && typeof dd.createdAt.toDate === "function"
              ? dd.createdAt.toDate().toISOString()
              : dd.createdAt || new Date().toISOString(),
          };
        });
        setJoinApplicationsData(arr);
      },
      (err) => {
        console.error("joinApplications snapshot error:", err);
      }
    );

    const servCol = collection(db, "serviceRequests");
    const unsubServ = onSnapshot(
      servCol,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const dd = d.data() || {};
          return {
            id: d.id,
            ...dd,
            createdAt: dd.createdAt && typeof dd.createdAt.toDate === "function"
              ? dd.createdAt.toDate().toISOString()
              : dd.createdAt || new Date().toISOString(),
          };
        });
        setServiceRequestsData(arr);
        // Attempt a monthly reset when service requests arrive (client-side)
        // This runs at most once per month per client session.
        (async () => {
          try {
            const currentMonth = new Date().toISOString().slice(0,7); // YYYY-MM
            const resetKey = 'shield_monthly_reset';
            const lastRun = (() => { try { return localStorage.getItem(resetKey); } catch(e) { return null; }})();
            if (lastRun === currentMonth) return; // already ran this month on this client

            for (const r of arr) {
              if (!r.id) continue;
              const credits = r.credits || {};
              if (credits.lastResetMonth === currentMonth) continue;

              // Only reset when there is something to reset (non-zero or missing)
              const needsReset = (Number(credits.largeCommits || 0) > 0) || (Number(credits.smallChanges || 0) > 0) || !credits.lastResetMonth;
              if (!needsReset) continue;

              try {
                await updateDoc(doc(db, 'serviceRequests', r.id), {
                  credits: { largeCommits: 0, smallChanges: 0, lastResetMonth: currentMonth }
                });
              } catch (err) {
                console.error('Monthly reset failed for', r.id, err);
              }
            }

            try { localStorage.setItem(resetKey, currentMonth); } catch (e) { /* ignore */ }
          } catch (e) {
            console.error('Monthly reset flow failed:', e);
          }
        })();
      },
      (err) => {
        console.error("serviceRequests snapshot error:", err);
      }
    );

    return () => {
      try { unsubJoin(); } catch (e) {}
      try { unsubServ(); } catch (e) {}
    };
  }, []);

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

  const billingAlerts = useMemo(() => {
    const alerts = [];
    for (const request of serviceRequestsData || []) {
      const status = String(request.status || request.requesterStatus || "").toLowerCase();
      if (status !== "active") continue;

      const daysRemaining = getDaysRemaining(request.billingEndDate);
      const alertType = getAlertType(daysRemaining);
      if (!alertType) continue;

      alerts.push({
        requestId: request.id,
        name: request.name || "Unknown",
        email: request.email || "—",
        plan: request.plan || "—",
        daysRemaining,
        alertType,
      });
    }

    alerts.sort((a, b) => {
      const orderDiff = ALERT_META[a.alertType].order - ALERT_META[b.alertType].order;
      if (orderDiff !== 0) return orderDiff;
      return a.daysRemaining - b.daysRemaining;
    });

    return alerts;
  }, [serviceRequestsData]);

  useEffect(() => {
    const syncStatus = async () => {
      const updates = [];

      for (const request of serviceRequestsData || []) {
        if (!request?.id || !request.billingEndDate) continue;
        const daysRemaining = getDaysRemaining(request.billingEndDate);
        if (daysRemaining === null) continue;

        const currentStatus = String(request.status || "").toLowerCase();
        const shouldBe = daysRemaining <= 0 ? "expired" : "active";
        if (currentStatus === shouldBe) continue;

        updates.push(
          updateDoc(doc(db, "serviceRequests", request.id), {
            status: shouldBe,
          })
        );
      }

      if (!updates.length) return;
      try {
        await Promise.all(updates);
      } catch (err) {
        console.error("Failed to sync billing statuses:", err);
      }
    };

    syncStatus();
  }, [serviceRequestsData]);
  const handleUpdateStatus = async (id, updates) => {
  try {
    const docRef = doc(db, "serviceRequests", id);
    await updateDoc(docRef, updates);
    console.log("SHIELD Database Sync: Success");
  } catch (error) {
    console.error("SHIELD Database Sync: Failed", error);
  }
};
  async function handleLogin() {
    if (isLoggingIn) return;

    setError("");
    setNotice("");

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setError("Enter your email.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!password.trim()) {
      setError("Enter your password.");
      return;
    }

    try {
      setIsLoggingIn(true);
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      // onAuthStateChanged will finish gating + redirecting.
    } catch (e) {
      console.error("Login failed:", {
        code: e?.code,
        message: e?.message,
        email: normalizedEmail,
      });
      setError(getAuthErrorMessage(e));
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

  async function handleDeleteJoinApplication(id) {
    if (!id) return;
    try {
      await deleteDoc(doc(db, "joinApplications", id));
      setNotice("Join application deleted.");
    } catch (e) {
      console.error("Failed to delete join application:", e);
      setError("Failed to delete application.");
    }
  }

  async function handleDeleteServiceRequest(id) {
    if (!id) return;
    try {
      await deleteDoc(doc(db, "serviceRequests", id));
      setNotice("Service request deleted.");
    } catch (e) {
      console.error("Failed to delete service request:", e);
      setError("Failed to delete request.");
    }
  }

  async function handleUpdateServiceRequestPlan(id, newPlan) {
    if (!id || !newPlan) return;
    try {
      await updateDoc(doc(db, "serviceRequests", id), {
        plan: newPlan,
      });
      setNotice("Service request plan updated.");
    } catch (e) {
      console.error("Failed to update service request plan:", e);
      setError("Failed to update plan.");
    }
  }

  function handleViewRequestFromAlert(requestId) {
    if (!requestId) return;
    setActiveTab("serviceRequests");
    setFocusRequestId(null);
    window.setTimeout(() => setFocusRequestId(requestId), 0);
  }

  async function handlePauseWebsiteFromAlert(alert) {
    if (!alert?.requestId) return;
    if (!(alert.alertType === "expired" || alert.alertType === "2_day_warning")) return;

    try {
      await updateDoc(doc(db, "serviceRequests", alert.requestId), {
        status: "paused",
        requesterStatus: "Paused",
        pausedAt: new Date().toISOString(),
      });
      setNotice("Website paused for selected request.");
    } catch (e) {
      console.error("Failed to pause website:", e);
      setError("Failed to pause website.");
    }
  }

  async function handleCopyReminder(alert) {
    if (!alert) return;
    const text = buildReminderMessage(alert.daysRemaining);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setNotice("Reminder message copied.");
    } catch (e) {
      console.error("Failed to copy reminder:", e);
      setError("Failed to copy reminder message.");
    }
  }

  if (checkingSession) {
    return (
      <div style={{ maxWidth: 400, marginLeft: "auto", marginRight: "auto", marginTop: 50 }}>
        <p>Checking session...</p>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div
        id="login-screen"
        style={{ maxWidth: 400, marginLeft: "auto", marginRight: "auto", marginTop: 50 }}
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

      <section style={{ marginBottom: 16, padding: 14, border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, background: "rgba(17,24,39,0.45)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Billing Alerts</h2>
          <span style={{ color: "#c4b5fd", fontSize: "0.9rem" }}>{billingAlerts.length} active alert(s)</span>
        </div>

        {!billingAlerts.length && (
          <p style={{ margin: 0, color: "#9ca3af" }}>No urgent billing alerts right now.</p>
        )}

        {billingAlerts.map((alert) => {
          const meta = ALERT_META[alert.alertType];
          const canPause = alert.alertType === "expired" || alert.alertType === "2_day_warning";
          return (
            <div
              key={alert.requestId}
              style={{
                padding: 12,
                borderRadius: 8,
                border: `1px solid ${meta.color}`,
                background: "rgba(15, 23, 42, 0.7)",
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{alert.name}</div>
                  <div style={{ color: "#cbd5e1", fontSize: "0.92rem" }}>{alert.email}</div>
                  <div style={{ color: "#cbd5e1", fontSize: "0.92rem" }}>Plan: {alert.plan}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ background: meta.color, color: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: "0.82rem", fontWeight: 700 }}>
                    {meta.label}
                  </span>
                  <span style={{ color: "#fde68a", fontWeight: 600 }}>
                    {alert.daysRemaining <= 0 ? "Expired" : `${alert.daysRemaining} day(s) remaining`}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button onClick={() => handleViewRequestFromAlert(alert.requestId)}>View Request</button>
                {canPause && (
                  <button
                    onClick={() => handlePauseWebsiteFromAlert(alert)}
                    style={{ background: "#7f1d1d", border: "1px solid #ef4444", color: "#fff" }}
                  >
                    Pause Website
                  </button>
                )}
                <button onClick={() => handleCopyReminder(alert)}>Copy Reminder Message</button>
              </div>
            </div>
          );
        })}
      </section>

      {notice && <p style={{ color: "#4ade80", marginTop: 0, marginBottom: 10 }}>{notice}</p>}
      {error && <p style={{ color: "#ef4444", marginTop: 0, marginBottom: 10 }}>{error}</p>}

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
        <button
          className={`tab-button ${activeTab === "joinApplications" ? "active" : ""}`}
          aria-pressed={activeTab === "joinApplications"}
          onClick={() => toggleTab("joinApplications")}
        >
          Join Applications
        </button>
        <button
          className={`tab-button ${activeTab === "serviceRequests" ? "active" : ""}`}
          aria-pressed={activeTab === "serviceRequests"}
          onClick={() => toggleTab("serviceRequests")}
        >
          Service Requests
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
        {activeTab === "joinApplications" && (
          <JoinApplicationsTab data={joinApplicationsData} onDelete={handleDeleteJoinApplication} />
        )}
        {activeTab === "serviceRequests" && (
          <ServiceRequestsTab 
            data={serviceRequestsData} 
            onDelete={handleDeleteServiceRequest}
            onUpdatePlan={handleUpdateServiceRequestPlan}
            onUpdateStatus={handleUpdateStatus}
            focusRequestId={focusRequestId}
          />
        )}
      </div>
    </div>
  );
}