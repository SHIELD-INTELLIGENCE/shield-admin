import React, { useState, useMemo, useEffect } from 'react';
import '../global.css';
import CustomDropdown from '../components/CustomDropdown.jsx';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const JoinApplicationsTab = ({ data = [], onDelete, onUpdateStatus }) => {
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const closeMenu = () => { setMenuOpen(null); setMenuPos(null); };
  const [query, setQuery] = useState('');
  const [filterSource, setFilterSource] = useState('any');
  const [filterAccepted, setFilterAccepted] = useState('any');
  const [sortBy, setSortBy] = useState('createdDesc');
  const [editModal, setEditModal] = useState({ open: false, saving: false, application: null });
  const [editForm, setEditForm] = useState({});

  const toggleMenu = (index, event) => {
    if (menuOpen === index) { closeMenu(); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuW = 220;
    let top = rect.bottom + 4;
    let left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (top + 300 > window.innerHeight) top = rect.top - 4;
    setMenuPos({ top, left });
    setMenuOpen(index);
  };

  useEffect(() => {
    if (!menuOpen && !menuPos) return;
    const handleClick = (e) => {
      if (!e.target.closest(".menu-container") && !e.target.closest(".menu-dropdown")) {
        closeMenu();
      }
    };
    const handleScroll = () => { closeMenu(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuOpen, menuPos]);

  const anyModalOpen = !!menuOpen || editModal.open;
  useEffect(() => {
    const el = document.getElementById("dashboard-screen");
    if (!el) return;
    if (anyModalOpen) {
      el.classList.add("no-elevate");
    } else {
      el.classList.remove("no-elevate");
    }
    return () => el.classList.remove("no-elevate");
  }, [anyModalOpen]);

  const updateAppStatus = async (id, newStatus) => {
    await onUpdateStatus(id, { applicationStatus: newStatus });
    closeMenu();
  };

  const handleEditApplication = (application) => {
    setEditForm({
      fullName: application.fullName || '',
      email: application.email || '',
      contact: application.contact || '',
      dob: application.dob || '',
      interests: (application.interests || []).join(', '),
      reason: application.reason || '',
      source: application.source || '',
      applicationStatus: application.applicationStatus || 'Applied',
    });
    setEditModal({ open: true, saving: false, application });
  };

  const submitEditApplication = async () => {
    if (!editModal.application?.id || !editForm.fullName.trim() || !editForm.email.trim()) return;
    setEditModal((p) => ({ ...p, saving: true }));
    try {
      const interests = editForm.interests
        ? editForm.interests.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      await updateDoc(doc(db, "joinApplications", editModal.application.id), {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        contact: editForm.contact.trim(),
        dob: editForm.dob,
        interests,
        reason: editForm.reason.trim(),
        source: editForm.source,
        applicationStatus: editForm.applicationStatus,
        updatedAt: new Date().toISOString(),
      });
      setEditModal({ open: false, saving: false, application: null });
    } catch (e) {
      console.error("Failed to update application:", e);
      setEditModal((p) => ({ ...p, saving: false }));
    }
  };

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    const arr = (data || []).filter((app) => {
      if (filterSource !== 'any' && (app.source || '') !== filterSource)
        return false;
      if (filterAccepted !== 'any') {
        const accepted = !!app.acceptedTerms;
        if (filterAccepted === 'yes' && !accepted) return false;
        if (filterAccepted === 'no' && accepted) return false;
      }
      if (!q) return true;
      const hay = [
        app.fullName,
        app.email,
        app.contact,
        app.reason,
        app.applicationStatus,
        ...(app.interests || []),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    if (sortBy === 'createdAsc') {
      arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortBy === 'createdDesc') {
      arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sortBy === 'nameAsc') {
      arr.sort((a, b) =>
        String(a.fullName || '').localeCompare(String(b.fullName || ''))
      );
    } else if (sortBy === 'nameDesc') {
      arr.sort((a, b) =>
        String(b.fullName || '').localeCompare(String(a.fullName || ''))
      );
    }
    return arr;
  }, [data, query, filterSource, filterAccepted, sortBy]);

  return (
    <div className="join-applications-tab">
      <h2>Join Applications</h2>

      <div className="tab-controls">
        <input
          className="search-input"
          placeholder="Search name, status, interests..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      
        <CustomDropdown
          options={[
            { value: 'createdDesc', label: 'Newest' },
            { value: 'createdAsc', label: 'Oldest' },
            { value: 'nameAsc', label: 'Name A→Z' },
            { value: 'nameDesc', label: 'Name Z→A' },
          ]}
          selected={sortBy}
          onChange={(v) => setSortBy(v)}
          placeholder="Sort"
        />

        <div className="result-count">{filtered.length} results</div>
      </div>

      {filtered.map((application, index) => {
        const src = String(application.source || 'unknown');
        const srcClass = `source-${src.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
        const currentStatus = application.applicationStatus || 'Applied';

        return (
          <div key={application.id || index} className="application-card">
            <div className="card-header">
              <h3>{application.fullName}</h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${srcClass}`}>{src}</span>

                <div className="menu-container">
                  <span
                    className="menu-icon"
                    onClick={(e) => toggleMenu(index, e)}
                    style={{ cursor: 'pointer', fontSize: '1.5rem' }}
                  >
                    &#x22EE;
                  </span>

                  {menuOpen === index && menuPos && (
                    <div className="menu-dropdown" style={{ top: menuPos.top, left: menuPos.left }}>
                      {/* RECRUITMENT PIPELINE */}
                      <span className="menu-item" onClick={() => updateAppStatus(application.id, 'Vetting')}>Move to Vetting</span>
                      <span className="menu-item" onClick={() => updateAppStatus(application.id, 'Interviewing')}>Interviewing</span>
                      <span className="menu-item" onClick={() => updateAppStatus(application.id, 'Accepted')} style={{color: '#10b981'}}>Accept Member</span>
                      <hr className="menu-divider" />
                      <span className="menu-item" onClick={() => { closeMenu(); handleEditApplication(application); }}>
                        Edit Application
                      </span>
                      <span
                        className="menu-item"
                        onClick={() => { closeMenu(); onDelete(application.id); }}
                        style={{ cursor: 'pointer', color: 'red' }}
                      >
                        Delete
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p><strong>Status:</strong> <span className="value" style={{color: '#a78bfa', fontWeight: 'bold'}}>{currentStatus}</span></p>
            <p><strong>Email:</strong> <span className="value">{application.email}</span></p>
            <p><strong>Contact:</strong> <span className="value">{application.contact}</span></p>
            <p><strong>Date of Birth:</strong> <span className="value">{application.dob}</span></p>
            <p>
              <strong>Interests:</strong>{' '}
              <span className="value">{(application.interests || []).join(', ')}</span>
            </p>
            <p><strong>Reason:</strong> <span className="value">{application.reason}</span></p>
            <p><strong>Source:</strong> <span className="value">{application.source}</span></p>
            <p>
              <strong>Accepted Terms:</strong>{' '}
              <span className="value">{application.acceptedTerms ? 'Yes' : 'No'}</span>
            </p>
            <p><strong>Is 13+:</strong> <span className="value">{application.is13Plus ? 'Yes' : 'No'}</span></p>
            <p>
              <strong>Created At:</strong>{' '}
              <span className="value">{application.createdAt ? new Date(application.createdAt).toLocaleString() : '—'}</span>
            </p>

            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #6b21a8' }} />
          </div>
        );
      })}

      {/* Edit Application Modal */}
      {editModal.open && (
        <div className="modal-overlay" onClick={() => { if (!editModal.saving) setEditModal({ open: false, saving: false, application: null }); }}>
          <div className="modal-content" style={{ maxWidth: 520, width: "100%", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", color: "#fbbf24" }}>Edit Application</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="search-input" placeholder="Full Name *" value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Email *" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Contact" value={editForm.contact} onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Date of Birth" value={editForm.dob} onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })} style={{ width: "100%" }} />
              <input className="search-input" placeholder="Interests (comma-separated)" value={editForm.interests} onChange={(e) => setEditForm({ ...editForm, interests: e.target.value })} style={{ width: "100%" }} />
              <textarea className="search-input" placeholder="Reason" value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} rows={3} style={{ width: "100%", resize: "vertical" }} />
              <input className="search-input" placeholder="Source" value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} style={{ width: "100%" }} />
              <select className="search-input" value={editForm.applicationStatus} onChange={(e) => setEditForm({ ...editForm, applicationStatus: e.target.value })} style={{ width: "100%", color: "#fff", background: "rgba(255,255,255,0.06)" }}>
                <option value="Applied">Applied</option>
                <option value="Vetting">Vetting</option>
                <option value="Interviewing">Interviewing</option>
                <option value="Accepted">Accepted</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setEditModal({ open: false, saving: false, application: null })} disabled={editModal.saving} style={{ padding: "10px 20px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={submitEditApplication}
                disabled={editModal.saving || !editForm.fullName.trim() || !editForm.email.trim()}
                style={{
                  padding: "10px 20px",
                  background: editModal.saving || !editForm.fullName.trim() || !editForm.email.trim() ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #7c3aed, #a78bfa)",
                  border: "none", borderRadius: 6, color: "#fff",
                  cursor: editModal.saving || !editForm.fullName.trim() || !editForm.email.trim() ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {editModal.saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JoinApplicationsTab;
