import React, { useState, useEffect } from "react";
import Card from "../components/Card.jsx";
import { wantedsCollection } from "../firebase.js";
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
  const [showRankingInfo, setShowRankingInfo] = useState(false);

  // Disable dashboard elevation while ranking info modal is open to avoid hover flicker
  useEffect(() => {
    const el = document.getElementById("dashboard-screen");
    if (!el) return;
    if (showRankingInfo) {
      el.classList.add("no-elevate");
    } else {
      el.classList.remove("no-elevate");
    }
    return () => el.classList.remove("no-elevate");
  }, [showRankingInfo]);

  useEffect(() => {
    const q = query(wantedsCollection, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setWanteds(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function addWanted() {
    if (!newName.trim() || !newReason.trim()) {
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
      return;
    }
    await updateDoc(doc(wantedsCollection, editingId), {
      name: editName.trim(),
      reason: editReason.trim(),
    });
    setEditingId(null);
  }

  async function deleteWanted(id) {
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
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            placeholder="Reason"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <button type="button" onClick={addWanted}>
            Add Wanted
          </button>

          {/* 🆕 Info button */}
          <button
            type="button"
            onClick={() => setShowRankingInfo(true)}
            style={{ backgroundColor: "#2563eb", color: "#fff" }}
          >
            How Ranking Works
          </button>
        </div>
      </Card>

      {showRankingInfo && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowRankingInfo(false)}
        >
          <div
            style={{
              background: "#1b0f2e",
              padding: "24px",
              borderRadius: "8px",
              width: "90%",
              maxWidth: "700px",
              maxHeight: "85%",
              overflowY: "auto",
              border: "1px solid #5b21b6",
              boxShadow: "0 4px 16px rgba(128, 90, 213, 0.4)",
              color: "#f5f3ff",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#c4b5fd" }}>How the Ranking System Works</h2>
            <p>
              The <strong>Reason</strong> field helps determine a concern level
              by scanning for certain words. This helps staff quickly identify
              potential risks or behavioral trends. The more serious the
              language, the higher the concern ranking.
            </p>

            <h3 style={{ color: "#c084fc" }}>Examples by Concern Level</h3>

            <div style={{ marginBottom: "1em" }}>
              <strong style={{ color: "#15803d" }}>🟢 Low Concern</strong>
              <ul>
                <li>“Was seen talking with another group after class.”</li>
                <li>“Discussed a rumor but did not participate.”</li>
                <li>“Reported concern to a teacher.”</li>
              </ul>
              <small>Low concern indicates minimal or no risk behavior.</small>
            </div>

            <div style={{ marginBottom: "1em" }}>
              <strong style={{ color: "#eab308" }}>🟡 Moderate Concern</strong>
              <ul>
                <li>“Argued with peers during lunch.”</li>
                <li>“Refused to follow instructions in class.”</li>
                <li>“Displayed rude or defiant behavior.”</li>
              </ul>
              <small>
                Moderate concern means repeated or disruptive actions that may
                need follow-up.
              </small>
            </div>

            <div style={{ marginBottom: "1em" }}>
              <strong style={{ color: "#dc2626" }}>🔴 High Concern</strong>
              <ul>
                <li>“Threatened another student.”</li>
                <li>“Attempted to start a fight.”</li>
                <li>“Was seen carrying a weapon.”</li>
              </ul>
              <small>
                High concern signals possible aggression or danger. Immediate
                action is advised.
              </small>
            </div>

            <h3 style={{ color: "#c084fc", marginTop: "2em" }}>
              Keyword Reference
            </h3>
            <p>
              Use or include the following terms in the <strong>Reason</strong>{" "}
              text to indicate the appropriate concern level:
            </p>

            {/* Keyword groups */}
            <div style={{ marginTop: "1em" }}>
              <h4 style={{ color: "#dc2626" }}>High Concern Keywords (🔴)</h4>
              <p style={{ fontSize: "0.9em", lineHeight: "1.6" }}>
                threat, threats, threaten, threatened, threatening, attack,
                attacks, attacked, attacking, assault, assaults, assaulted,
                assaulting, weapon, weapons, violence, violent, violently,
                abuse, abuses, abused, abusing, abusive, fight, fights,
                fighting, fought, harm, harms, harmed, harming, harmful, injury,
                injuries, injure, injures, injured, injuring, bully, bullies,
                bullied, bullying, danger, dangers, dangerous, endanger,
                endangered, endangering, punch, punches, punched, punching, hit,
                hits, hitting, kick, kicks, kicked, kicking, hurt, hurts,
                hurting, hurtful, self-harm, selfharm, suicide, suicidal,
                intimidate, intimidates, intimidated, intimidating, intimidation
              </p>

              <h4 style={{ color: "#eab308", marginTop: "1em" }}>
                Moderate Concern Keywords (🟡)
              </h4>
              <p style={{ fontSize: "0.9em", lineHeight: "1.6" }}>
                misbehave, misbehaves, misbehaved, misbehaving, misbehavior,
                disrespect, disrespects, disrespected, disrespecting,
                disrespectful, disrupt, disrupts, disrupted, disrupting,
                disruptive, disruption, argue, argues, argued, arguing,
                argument, arguments, harass, harasses, harassed, harassing,
                harassment, dispute, disputes, disputed, disputing, conflict,
                conflicts, conflicted, conflicting, ignore, ignores, ignored,
                ignoring, noncompliant, noncompliance, rude, rudely, rudeness,
                yell, yells, yelled, yelling, shout, shouts, shouted, shouting,
                blame, blames, blamed, blaming, refuse, refuses, refused,
                refusing, refusal, defiant, defy, defies, defied, defying,
                defiance, anger, angry, angered, angering, tension, tensions,
                tense, tensed
              </p>

              <h4 style={{ color: "#15803d", marginTop: "1em" }}>
                Low Concern Keywords (🟢)
              </h4>
              <p style={{ fontSize: "0.9em", lineHeight: "1.6" }}>
                support, supports, supported, supporting, supportive, ally,
                allies, allied, seen with, was seen with, were seen with,
                associate, associates, associated, associating, association,
                witness, witnesses, witnessed, witnessing, rumor, rumors,
                rumored, report, reports, reported, reporting, concern,
                concerns, concerned, concerning, conversation, conversations,
                discussion, discussions, discuss, discusses, discussed,
                discussing
              </p>

              <h4 style={{ color: "#60a5fa", marginTop: "1em" }}>
                Positive / Protective Keywords (🔵)
              </h4>
              <p style={{ fontSize: "0.9em", lineHeight: "1.6" }}>
                apology, apologies, apologize, apologizes, apologized,
                apologizing, improve, improves, improved, improving,
                improvement, improvements, help, helps, helped, helping,
                helpful, resolve, resolves, resolved, resolving, resolution,
                resolutions, calm, calms, calmed, calming, calmly, cooperate,
                cooperates, cooperated, cooperating, cooperation, cooperative,
                assist, assists, assisted, assisting, assistance, mentor,
                mentors, mentored, mentoring, mentorship, positive, positivity,
                progress, progresses, progressed, progressing, progressive
              </p>
            </div>

            <p style={{ marginTop: "1em" }}>
              💡 <strong>Tip:</strong> Describing events using these keywords
              helps the system rank entries accurately. Avoid vague terms like
              “problematic” — instead, be specific about the action or behavior.
            </p>

            <div style={{ textAlign: "right", marginTop: "1.5em" }}>
              <button
                onClick={() => setShowRankingInfo(false)}
                style={{
                  background: "#5b21b6",
                  color: "#fff",
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <section id="wanted-list">
        <h2>Wanted List</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {wanteds.map((wanted) => (
            <li key={wanted.id} style={{ marginBottom: 12 }}>
              <Card
                title={wanted.name}
                className="wanted-card"
              >
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
                      <button
                        type="button"
                        onClick={saveEdit}
                        style={{ marginRight: 10 }}
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
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
                      <div className="field-value">
                        {formatDate(wanted.createdAt)}
                      </div>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => startEditing(wanted)}
                      >
                        Edit
                      </button>
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
              <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #6b21a8' }} />
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
    const d =
      typeof input.toDate === "function" ? input.toDate() : new Date(input);
    return d.toLocaleString();
  } catch (e) {
    return String(input);
  }
}
