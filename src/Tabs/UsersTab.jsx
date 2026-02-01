"use client";

import React, { useEffect, useMemo, useState } from "react";
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
} from "firebase/firestore";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export default function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");

  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("user");

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

  async function addUser() {
    const email = normalizeEmail(newEmail);
    if (!email.includes("@")) {
      alert("Enter a valid email.");
      return;
    }
    try {
      await setDoc(
        doc(usersCollection, email),
        {
          email,
          role: newRole,
          createdAt: new Date(),
        },
        { merge: true }
      );
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
      await updateDoc(doc(usersCollection, editingId), {
        role: editRole,
      });
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
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("Failed to delete user.");
    }
  }

  if (loading) return <p>Loading users...</p>;

  return (
    <div>
      <Card title="Admins & Users" style={{ marginBottom: 24 }}>
        <p style={{ marginTop: 0 }}>
          Admins can log into this dashboard. Current admins: <strong>{adminCount}</strong>
        </p>
        <div className="two-col">
          <input
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <CustomDropdown
            options={ROLE_OPTIONS}
            selected={newRole}
            onChange={(value) => setNewRole(value)}
            placeholder="Select Role"
          />
        </div>
        <button type="button" onClick={addUser} disabled={!newEmail.trim()}>
          Add User
        </button>
      </Card>

      <section id="users-list">
        <h2>Existing Users</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {users.map((u) => (
            <li key={u.docId} style={{ marginBottom: 12 }}>
              <Card title={u.email} subtitle={(u.role || "user").toUpperCase()}>
                {editingId === u.docId ? (
                  <>
                    <CustomDropdown
                      options={ROLE_OPTIONS}
                      selected={editRole}
                      onChange={(value) => setEditRole(value)}
                      placeholder="Select Role"
                    />
                    <button onClick={saveEdit} style={{ marginRight: 10 }}>
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <div className="field-row">
                      <div className="field-label">Role</div>
                      <div className="field-value">{u.role || "user"}</div>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                      <button type="button" onClick={() => startEditing(u)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => deleteUser(u.docId)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </Card>
              <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #6b21a8' }} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
