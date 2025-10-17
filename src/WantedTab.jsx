import React, { useState, useEffect } from "react";
import Card from "./components/Card.jsx";
import {
  wantedsCollection,
} from "./firebase.js";

import {
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

export default function WantedTab() {
  const [wanteds, setWanteds] = useState([]);
  const [newName, setNewName] = useState("");
  const [newReason, setNewReason] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editReason, setEditReason] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(wantedsCollection, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, snapshot => {
      const list = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setWanteds(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function addWanted() {
    if (!newName.trim() || !newReason.trim()) {
  // TODO: Handle validation error (removed alert)
      return;
    }
    await addDoc(wantedsCollection, {
      name: newName.trim(),
      reason: newReason.trim(),
      createdAt: new Date(),
    });
    setNewName("");
    setNewReason("");
  }

  function startEditing(wanted) {
    setEditingId(wanted.id);
    setEditName(wanted.name);
    setEditReason(wanted.reason);
  }

  async function saveEdit() {
    if (!editName.trim() || !editReason.trim()) {
  // TODO: Handle validation error (removed alert)
      return;
    }
    await updateDoc(doc(wantedsCollection, editingId), {
      name: editName.trim(),
      reason: editReason.trim(),
    });
    setEditingId(null);
  }

  async function deleteWanted(id) {
  // TODO: Handle delete confirmation in UI (removed window.confirm)
  await deleteDoc(doc(wantedsCollection, id));
  }

  if (loading) return <p>Loading wanted list...</p>;

  return (
    <div>
      <Card title="Add to Wanted List" style={{ marginBottom: 24 }}>
        <div className="two-col">
          <input
            placeholder="Name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <input
            placeholder="Reason"
            value={newReason}
            onChange={e => setNewReason(e.target.value)}
          />
        </div>
        <button type="button" onClick={addWanted}>Add Wanted</button>
      </Card>

      <section id="wanted-list">
        <h2>Wanted List</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {wanteds.map((wanted) => (
            <li key={wanted.id} style={{ marginBottom: 12 }}>
              <Card title={wanted.name} subtitle={wanted.reason} className="wanted-card">
                {editingId === wanted.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                    />
                    <input
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Reason"
                    />
                    <div style={{ marginTop: 8 }}>
                      <button type="button" onClick={saveEdit} style={{ marginRight: 10 }}>
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field-row">
                      <div className="field-label">Reason</div>
                      <div className="field-value">{wanted.reason || "-"}</div>
                    </div>
                    <div className="field-row">
                      <div className="field-label">Added</div>
                      <div className="field-value">{formatDate(wanted.createdAt)}</div>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                      <button type="button" onClick={() => startEditing(wanted)}>Edit</button>
                      <button
                        type="button"
                        className="delete-btn"
                        onClick={() => deleteWanted(wanted.id)}
                        style={{ backgroundColor: "#e11d48", color: "#fff" }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function formatDate(input) {
  if (!input) return "-";
  try {
    const d = typeof input.toDate === "function" ? input.toDate() : new Date(input);
    return d.toLocaleString();
  } catch (e) {
    return String(input);
  }
}
