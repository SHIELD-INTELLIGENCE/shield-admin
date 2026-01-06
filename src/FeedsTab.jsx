"use client"; // Mark component as client-side in Next.js 13+

import React, { useState, useEffect } from "react";
import Card from "./components/Card.jsx";
import {
  feedsCollection,
  usersCollection,
} from "./firebase.js";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
} from "firebase/firestore";

export default function FeedsTab() {
  const [recipients, setRecipients] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedEmails, setSelectedEmails] = useState([]);

  // Load recipients once on mount
  useEffect(() => {
    async function loadRecipients() {
      try {
        const snapshot = await getDocs(usersCollection);
        const emailsSet = new Set();
        const emails = [];
        snapshot.forEach((doc) => {
          const email = doc.data().email || doc.id;
          if (email && !emailsSet.has(email)) {
            emailsSet.add(email);
            emails.push(email);
          }
        });
        setRecipients(emails);
      } catch (error) {
        console.error("Failed to load recipients:", error);
      }
    }
    loadRecipients();
  }, []);

  // Listen to feeds live updates
  useEffect(() => {
    const q = query(feedsCollection, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feedItems = [];
      snapshot.forEach((doc) => {
        feedItems.push({ id: doc.id, ...doc.data() });
      });
      setFeeds(feedItems);
    });
    return () => unsubscribe();
  }, []);

  function toggleEmail(email) {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  }

  async function createFeed() {
    if (!title.trim() || !body.trim() || selectedEmails.length === 0) {
      alert("Fill title, body, and select at least one recipient.");
      return;
    }
    try {
      await addDoc(feedsCollection, {
        title: title.trim(),
        body: body.trim(),
        assignedTo: selectedEmails,
        createdAt: new Date(),
        status: "pending",
      });
      setTitle("");
      setBody("");
      setSelectedEmails([]);
    } catch (error) {
      console.error("Failed to create feed:", error);
      alert("Error creating feed. Try again.");
    }
  }

  async function markDone(id) {
    try {
      await updateDoc(doc(feedsCollection, id), { status: "done" });
    } catch (error) {
      console.error("Failed to mark done:", error);
    }
  }

  async function deleteFeed(id) {
    try {
      await deleteDoc(doc(feedsCollection, id));
    } catch (error) {
      console.error("Failed to delete feed:", error);
      alert("Error deleting feed.");
    }
  }

  return (
    <div>
      <Card title="Create new feed" className="" style={{ marginBottom: 8 }}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div id="recipients-list">
          <h3>Select Recipients</h3>
          {recipients.map((email) => (
            <label key={email} style={{ display: "block", marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={selectedEmails.includes(email)}
                onChange={() => toggleEmail(email)}
              /> {email}
            </label>
          ))}
        </div>
        <button type="button" onClick={createFeed}>Create Feed</button>
      </Card>

      <section id="feeds-list" style={{ marginTop: 24 }}>
        <h2>Existing Feeds</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {feeds.map((feed) => (
            <li key={feed.id} style={{ marginBottom: 12 }}>
              <Card title={feed.title} subtitle={feed.status} className="feed-card">
                <p style={{ marginTop: 8 }}>{feed.body}</p>
                <div className="field-row">
                  <div className="field-label">Assigned to</div>
                  <div className="field-value">{feed.assignedTo?.length ? feed.assignedTo.join(", ") : "No one"}</div>
                </div>
                <div className="field-row">
                  <div className="field-label">Status</div>
                  <div className="field-value"><span className={`status-label ${feed.status}`}>{feed.status}</span></div>
                </div>
                <div className="field-row">
                  <div className="field-label">Created</div>
                  <div className="field-value">{formatDate(feed.createdAt)}</div>
                </div>
                <div className="feed-btns">
                  {feed.status !== "done" && (
                    <button type="button" className="done-btn" onClick={() => markDone(feed.id)}>Mark as Done</button>
                  )}
                  <button type="button" className="delete-btn" onClick={() => deleteFeed(feed.id)}>Delete</button>
                </div>
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
  // Firestore Timestamp has toDate(), or could be a JS Date
  try {
    const d = typeof input.toDate === "function" ? input.toDate() : new Date(input);
    return d.toLocaleString();
  } catch (e) {
    return String(input);
  }
}
