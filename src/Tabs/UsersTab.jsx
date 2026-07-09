"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import Card from "../components/Card.jsx";
import { usersCollection } from "../firebase.js";
import CustomDropdown from "../components/CustomDropdown";
import "../global.css";

import {
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  documentId,
  collection,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase.js";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

const PAYMENT_STYLES = {
  paid: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  unpaid: { bg: "rgba(249,115,22,0.15)", color: "#fb923c" },
  pending: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
  overdue: { bg: "rgba(239,68,68,0.15)", color: "#fca5a5" },
  suspended: { bg: "rgba(168,85,247,0.15)", color: "#c4b5fd" },
};

function getPayStyle(status) {
  return PAYMENT_STYLES[status] || { bg: "rgba(107,114,128,0.15)", color: "#d1d5db" };
}

const STATUS_STYLES = {
  active: { bg: "rgba(34,197,94,0.15)", color: "#4ade80" },
  building: { bg: "rgba(96,165,250,0.15)", color: "#93c5fd" },
  paused: { bg: "rgba(168,85,247,0.15)", color: "#c4b5fd" },
  expired: { bg: "rgba(239,68,68,0.15)", color: "#fca5a5" },
  negotiating: { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
};

function getStatusStyle(status) {
  return STATUS_STYLES[status?.toLowerCase()] || { bg: "rgba(107,114,128,0.15)", color: "#d1d5db" };
}

function formatCurrency(amount) {
  const numeric = Math.floor(Number(amount || 0));
  let clearString = numeric.toString();
  const lastThree = clearString.substring(clearString.length - 3);
  const otherBits = clearString.substring(0, clearString.length - 3);
  if (otherBits !== '') {
    clearString = otherBits.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree;
  }
  return `INR ${clearString}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export default function UsersTab({ serviceRequestsData = [], enterpriseConsultationsData = [], invoicesData = [] }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("user");
  const [assignmentModal, setAssignmentModal] = useState({ open: false, user: null });
  const [unassignConfirm, setUnassignConfirm] = useState({ open: false, requestId: null, type: "" });
  const [confirmModal, setConfirmModal] = useState({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, user: null });
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuPos, setMenuPos] = useState(null);

  const menuTriggerRef = useRef(null);
  const closeMenu = () => { setMenuOpen(null); setMenuPos(null); menuTriggerRef.current = null; };
  const recalcMenu = () => {
    if (!menuTriggerRef.current) return;
    const rect = menuTriggerRef.current.getBoundingClientRect();
    const menuW = 220;
    let top = rect.bottom + 4;
    let left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (top + 400 > window.innerHeight) {
      if (rect.top > 400) {
        top = rect.top - 400 - 4;
      } else {
        top = 4;
      }
    }
    setMenuPos({ top, left });
  };

  const toggleMenu = (key, event) => {
    if (menuOpen === key) { closeMenu(); return; }
    menuTriggerRef.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    const menuW = 220;
    let top = rect.bottom + 4;
    let left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (top + 400 > window.innerHeight) {
      if (rect.top > 400) {
        top = rect.top - 400 - 4;
      } else {
        top = 4;
      }
    }
    setMenuPos({ top, left });
    setMenuOpen(key);
  };

  useEffect(() => {
    if (!menuOpen && !menuPos) return;
    const handleClick = (e) => {
      if (!e.target.closest(".menu-container") && !e.target.closest(".menu-dropdown")) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", recalcMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", recalcMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuOpen, menuPos]);

  const copyToClipboard = (text, label) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showConfirm(`${label} copied.`);
  };

  useEffect(() => {
    const q = query(usersCollection, orderBy(documentId()));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => {
          const data = d.data() || {};
          list.push({ docId: d.id, ...data, email: data.email || d.id });
        });
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to load users:", err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const adminCount = useMemo(
    () => users.filter((u) => (u.role || "user") === "admin").length,
    [users]
  );

  const activeUsers = useMemo(() => users.filter((u) => !u.archived), [users]);
  const archivedUsers = useMemo(() => users.filter((u) => u.archived), [users]);

  const requestsByUser = useMemo(() => {
    const map = {};
    for (const u of users) {
      const email = u.email || u.docId;
      const sr = serviceRequestsData.filter((r) => r.assignedUserId === email);
      const er = enterpriseConsultationsData.filter((r) => r.assignedUserId === email);
      map[email] = { serviceRequests: sr, enterpriseRequests: er };
    }
    return map;
  }, [users, serviceRequestsData, enterpriseConsultationsData]);

  const invoicesByRequest = useMemo(() => {
    const map = {};
    invoicesData.forEach((inv) => {
      if (!inv.requestId) return;
      if (!map[inv.requestId]) map[inv.requestId] = [];
      map[inv.requestId].push(inv);
    });
    return map;
  }, [invoicesData]);

  function getPaymentInfo(email) {
    const assigned = requestsByUser[email] || { serviceRequests: [], enterpriseRequests: [] };
    const allReqs = [...assigned.serviceRequests, ...assigned.enterpriseRequests];
    if (allReqs.length === 0) return null;
    let unpaidCount = 0;
    let totalUnpaid = 0;
    for (const req of allReqs) {
      const reqInvoices = invoicesByRequest[req.id] || [];
      for (const inv of reqInvoices) {
        const invStatus = String(inv.status || "").toLowerCase();
        if (invStatus !== "paid") {
          unpaidCount++;
          totalUnpaid += Number(inv.amount || 0);
        }
      }
    }
    if (unpaidCount === 0) return { status: "paid", label: "All Paid" };
    return { status: "unpaid", label: `${unpaidCount} pending (${formatCurrency(totalUnpaid)})` };
  }

  const unassignedServiceRequests = useMemo(
    () => serviceRequestsData.filter((r) => !r.assignedUserId),
    [serviceRequestsData]
  );
  const unassignedEnterpriseRequests = useMemo(
    () => enterpriseConsultationsData.filter((r) => !r.assignedUserId),
    [enterpriseConsultationsData]
  );

  async function addUser() {
    const email = normalizeEmail(newEmail);
    if (!email.includes("@")) { alert("Enter a valid email."); return; }
    try {
      await setDoc(doc(usersCollection, email), { email, role: newRole, createdAt: new Date(), archived: false }, { merge: true });
      setNewEmail("");
      setNewRole("user");
    } catch (error) {
      console.error("Error adding user:", error);
      alert("Failed to add user. Try again.");
    }
  }

  function startEditing(u) {
    setEditingId(u.docId);
    setEditRole(u.role || "user");
  }

  async function saveEdit() {
    try {
      await updateDoc(doc(usersCollection, editingId), { role: editRole });
      setEditingId(null);
    } catch (error) {
      console.error("Error updating user:", error);
      alert("Failed to save changes.");
    }
  }

  async function deleteUser(docId) {
    try {
      await deleteDoc(doc(usersCollection, docId));
      if (editingId === docId) setEditingId(null);
      setDeleteConfirm({ open: false, user: null });
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user.");
    }
  }

  async function assignRequest(requestId, type, userEmail) {
    const col = type === "service" ? "serviceRequests" : "enterpriseConsultations";
    try {
      await updateDoc(doc(db, col, requestId), { assignedUserId: userEmail });
    } catch (error) {
      console.error("Error assigning request:", error);
      alert("Failed to assign request.");
    }
  }

  async function unassignRequest(requestId, type) {
    const col = type === "service" ? "serviceRequests" : "enterpriseConsultations";
    try {
      await updateDoc(doc(db, col, requestId), { assignedUserId: "" });
      setUnassignConfirm({ open: false, requestId: null, type: "" });
    } catch (error) {
      console.error("Error unassigning request:", error);
      alert("Failed to unassign request.");
    }
  }

  async function reassignRequest(requestId, type, newUserEmail) {
    const col = type === "service" ? "serviceRequests" : "enterpriseConsultations";
    try {
      await updateDoc(doc(db, col, requestId), { assignedUserId: newUserEmail });
      setAssignmentModal({ open: false, user: null });
    } catch (error) {
      console.error("Error reassigning request:", error);
      alert("Failed to reassign request.");
    }
  }

  if (loading) return <p style={{ color: "#9ca3af", padding: 20 }}>Loading users...</p>;

  function UserInfoCard({ u }) {
    const email = u.email || u.docId;
    const assigned = requestsByUser[email] || { serviceRequests: [], enterpriseRequests: [] };
    const srCount = assigned.serviceRequests.length;
    const erCount = assigned.enterpriseRequests.length;
    const allReqs = [...assigned.serviceRequests, ...assigned.enterpriseRequests];
    const isAdmin = u.role === "admin";
    const latestSr = assigned.serviceRequests[0];
    const latestEr = assigned.enterpriseRequests[0];
    const plan = latestSr?.plan || (latestEr ? "Enterprise" : "—");
    const monthlyRevenue = latestSr?.customMonthlyPrice || (latestSr?.plan ? "In plan" : "—");
    const currentStatus = latestSr?.requesterStatus || latestSr?.status || latestEr?.status || "—";
    const payInfo = getPaymentInfo(email);
    const statusStyle = getStatusStyle(currentStatus);

    return (
      <div style={{
        background: "linear-gradient(180deg, rgba(36,18,58,0.95), rgba(22,11,34,0.98))",
        border: "1px solid rgba(147,51,234,0.35)",
        borderRadius: 10,
        padding: 20,
        marginBottom: 14,
        boxShadow: "0 2px 8px rgba(88,28,135,0.35), 0 8px 24px rgba(0,0,0,0.6)",
      }}>
        {editingId === u.docId ? (
          <div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <CustomDropdown options={ROLE_OPTIONS} selected={editRole} onChange={(v) => setEditRole(v)} placeholder="Select Role" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveEdit} style={{ width: "auto", padding: "8px 20px", background: "#7c3aed" }}>Save</button>
              <button onClick={() => setEditingId(null)} style={{ width: "auto", padding: "8px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ color: "#f3e8ff", fontSize: "1.05rem", fontWeight: 700 }}>{email}</span>
                  <span style={{
                    padding: "2px 10px", borderRadius: 12, fontSize: "0.72rem", fontWeight: 600,
                    background: isAdmin ? "rgba(168,85,247,0.2)" : "rgba(96,165,250,0.15)",
                    color: isAdmin ? "#c4b5fd" : "#93c5fd",
                    border: `1px solid ${isAdmin ? "rgba(168,85,247,0.3)" : "rgba(96,165,250,0.2)"}`,
                  }}>
                    {isAdmin ? "ADMIN" : "USER"}
                  </span>
                </div>
                <div style={{ color: "rgba(250,250,250,0.45)", fontSize: "0.82rem" }}>
                  {srCount} Service • {erCount} Enterprise
                </div>
              </div>
              {u.archived && (
                <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: "0.72rem", fontWeight: 600, background: "rgba(239,68,68,0.15)", color: "#fca5a5" }}>
                  ARCHIVED
                </span>
              )}
            </div>

            <div style={{ height: 1, background: "rgba(147,51,234,0.15)", margin: "14px 0" }} />

            {!isAdmin && allReqs.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", fontSize: "0.85rem" }}>
                <div><span style={{ color: "#c4b5fd" }}>Plan</span><br /><span style={{ color: "#e9d5ff", fontWeight: 600 }}>{plan}</span></div>
                <div><span style={{ color: "#c4b5fd" }}>Monthly Revenue</span><br /><span style={{ color: "#e9d5ff", fontWeight: 600 }}>{formatCurrency(monthlyRevenue)}</span></div>
                <div><span style={{ color: "#c4b5fd" }}>Project Status</span><br />
                  <span style={{ background: statusStyle.bg, color: statusStyle.color, padding: "2px 8px", borderRadius: 4, fontSize: "0.78rem", fontWeight: 600 }}>
                    {currentStatus}
                  </span>
                </div>
                <div><span style={{ color: "#c4b5fd" }}>Payment</span><br />
                  {payInfo ? (
                    <span style={{ background: getPayStyle(payInfo.status).bg, color: getPayStyle(payInfo.status).color, padding: "2px 8px", borderRadius: 4, fontSize: "0.78rem", fontWeight: 600 }}>
                      {payInfo.label}
                    </span>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>—</span>
                  )}
                </div>
              </div>
            ) : !isAdmin ? (
              <div style={{ color: "#9ca3af", fontSize: "0.85rem" }}>No assigned projects</div>
            ) : (
              <div style={{ color: "#c4b5fd", fontSize: "0.85rem" }}>Admin account — no billing data</div>
            )}

            {(srCount > 0 || erCount > 0) && (
              <div style={{ marginTop: 12, maxHeight: 140, overflowY: "auto" }}>
                {assigned.serviceRequests.slice(0, 10).map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(107,33,168,0.15)", fontSize: "0.82rem" }}>
                    <span style={{ color: "#93c5fd", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>SR: {r.name || r.email || r.id?.slice(0, 8)}</span>
                    <div className="menu-container" style={{ flexShrink: 0 }}>
                      <span className="menu-icon" onClick={(e) => toggleMenu(`sr-${r.id}`, e)}>&#x22EE;</span>
                      {menuOpen === `sr-${r.id}` && menuPos && (
                        <div className="menu-dropdown" style={{ top: menuPos.top, left: menuPos.left, maxHeight: `min(500px, ${window.innerHeight - menuPos.top - 8}px)` }}>
                          <span className="menu-item" onClick={() => { closeMenu(); setAssignmentModal({ open: true, user: u }); }}>Manage</span>
                          <hr className="menu-divider" />
                          <span className="menu-item" onClick={() => { closeMenu(); copyToClipboard(r.id, "Request ID"); }}>Copy Request ID</span>
                          {r.email && <span className="menu-item" onClick={() => { closeMenu(); copyToClipboard(r.email, "Client email"); }}>Copy Client Email</span>}
                          <hr className="menu-divider" />
                          <span className="menu-item danger" onClick={() => { closeMenu(); setUnassignConfirm({ open: true, requestId: r.id, type: "service" }); }}>Unassign</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {assigned.enterpriseRequests.slice(0, 10).map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(107,33,168,0.15)", fontSize: "0.82rem" }}>
                    <span style={{ color: "#fbbf24", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>ER: {r.companyName || r.contactPerson || r.id?.slice(0, 8)}</span>
                    <div className="menu-container" style={{ flexShrink: 0 }}>
                      <span className="menu-icon" onClick={(e) => toggleMenu(`er-${r.id}`, e)}>&#x22EE;</span>
                      {menuOpen === `er-${r.id}` && menuPos && (
                        <div className="menu-dropdown" style={{ top: menuPos.top, left: menuPos.left, maxHeight: `min(500px, ${window.innerHeight - menuPos.top - 8}px)` }}>
                          <span className="menu-item" onClick={() => { closeMenu(); setAssignmentModal({ open: true, user: u }); }}>Manage</span>
                          <hr className="menu-divider" />
                          <span className="menu-item" onClick={() => { closeMenu(); copyToClipboard(r.id, "Request ID"); }}>Copy Request ID</span>
                          {r.email && <span className="menu-item" onClick={() => { closeMenu(); copyToClipboard(r.email, "Client email"); }}>Copy Client Email</span>}
                          <hr className="menu-divider" />
                          <span className="menu-item danger" onClick={() => { closeMenu(); setUnassignConfirm({ open: true, requestId: r.id, type: "enterprise" }); }}>Unassign</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => startEditing(u)}
                style={{ width: "auto", padding: "7px 16px", fontSize: "0.82rem", background: "rgba(147,51,234,0.2)", border: "1px solid rgba(147,51,234,0.3)", borderRadius: 5, color: "#c4b5fd", cursor: "pointer" }}>
                Edit
              </button>
              <button onClick={() => setAssignmentModal({ open: true, user: u })}
                style={{ width: "auto", padding: "7px 16px", fontSize: "0.82rem", background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 5, color: "#93c5fd", cursor: "pointer" }}>
                Manage Assignments
              </button>
              <button onClick={() => setDeleteConfirm({ open: true, user: u })}
                style={{ width: "auto", padding: "7px 16px", fontSize: "0.82rem", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, color: "#fca5a5", cursor: "pointer" }}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const showConfirm = (msg) => {
    setConfirmModal({ open: true, message: msg });
  };

  return (
    <div>
      <Card title="Admins & Users" style={{ marginBottom: 24 }}>
        <p style={{ marginTop: 0 }}>Admins can log into this dashboard. Current admins: <strong style={{ color: "#c4b5fd" }}>{adminCount}</strong></p>
        <div className="two-col">
          <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <CustomDropdown options={ROLE_OPTIONS} selected={newRole} onChange={(v) => setNewRole(v)} placeholder="Select Role" />
        </div>
        <button type="button" onClick={addUser} disabled={!newEmail.trim()}>Add User</button>
      </Card>

      <section id="users-list">
        <h2 style={{ marginBottom: 16 }}>Active Users ({activeUsers.length})</h2>
        {activeUsers.length === 0 && <p style={{ color: "#9ca3af" }}>No active users.</p>}
        {activeUsers.map((u) => <UserInfoCard key={u.docId} u={u} />)}
      </section>

      {archivedUsers.length > 0 && (
        <section id="users-list" style={{ marginTop: 32 }}>
          <h2 style={{ marginBottom: 16 }}>Archived Users ({archivedUsers.length})</h2>
          {archivedUsers.map((u) => <UserInfoCard key={u.docId} u={u} />)}
        </section>
      )}

      {/* Assignment Modal */}
      {assignmentModal.open && assignmentModal.user && (
        <div className="modal-overlay" onClick={() => setAssignmentModal({ open: false, user: null })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh", overflowY: "auto", maxWidth: 600 }}>
            <h3>Manage Assignments — {assignmentModal.user.email}</h3>

            {unassignedServiceRequests.length === 0 && unassignedEnterpriseRequests.length === 0 && (
              <p style={{ color: "#9ca3af" }}>No unassigned requests available.</p>
            )}

            {unassignedServiceRequests.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ color: "#93c5fd", marginBottom: 8 }}>Unassigned Service Requests</h4>
                {unassignedServiceRequests.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "rgba(59,130,246,0.06)", borderRadius: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: "0.85rem" }}>{r.name || r.email || r.id?.slice(0, 8)} — {r.plan || "—"}</span>
                    <button onClick={() => assignRequest(r.id, "service", assignmentModal.user.email)}
                      style={{ width: "auto", padding: "5px 12px", fontSize: "0.78rem", background: "#3b82f6", border: "none", borderRadius: 3, color: "#fff", cursor: "pointer" }}>
                      Assign
                    </button>
                  </div>
                ))}
              </div>
            )}

            {unassignedEnterpriseRequests.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ color: "#fbbf24", marginBottom: 8 }}>Unassigned Enterprise Requests</h4>
                {unassignedEnterpriseRequests.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "rgba(251,191,36,0.06)", borderRadius: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: "0.85rem" }}>{r.companyName || r.contactPerson || r.id?.slice(0, 8)} — {r.projectTitle || "—"}</span>
                    <button onClick={() => assignRequest(r.id, "enterprise", assignmentModal.user.email)}
                      style={{ width: "auto", padding: "5px 12px", fontSize: "0.78rem", background: "#f59e0b", border: "none", borderRadius: 3, color: "#fff", cursor: "pointer" }}>
                      Assign
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => setAssignmentModal({ open: false, user: null })}
                style={{ width: "auto", padding: "8px 16px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "#fff", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm.open && deleteConfirm.user && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm({ open: false, user: null })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Delete User</h3>
            <p>Are you sure you want to delete <strong>{deleteConfirm.user.email}</strong>? This cannot be undone.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setDeleteConfirm({ open: false, user: null })}
                style={{ width: "auto", padding: "8px 16px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => deleteUser(deleteConfirm.user.docId)}
                style={{ width: "auto", padding: "8px 16px", background: "#ef4444", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unassign Confirm */}
      {unassignConfirm.open && (
        <div className="modal-overlay" onClick={() => setUnassignConfirm({ open: false, requestId: null, type: "" })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Unassign Request</h3>
            <p>Remove assignment from this request?</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setUnassignConfirm({ open: false, requestId: null, type: "" })}
                style={{ width: "auto", padding: "8px 16px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => unassignRequest(unassignConfirm.requestId, unassignConfirm.type)}
                style={{ width: "auto", padding: "8px 16px", background: "#ef4444", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer" }}>
                Unassign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generic Confirm */}
      {confirmModal.open && (
        <div className="modal-overlay" onClick={() => setConfirmModal({ open: false })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <p>{confirmModal.message}</p>
            <button onClick={() => setConfirmModal({ open: false })}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
