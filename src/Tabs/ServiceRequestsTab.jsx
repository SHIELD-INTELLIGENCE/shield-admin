import React, { useState, useMemo, useEffect } from 'react';
import '../global.css';
import CustomDropdown from '../components/CustomDropdown.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

// Tier limits configuration
const TIER_LIMITS = {
  'Starter Plan': { largeCommits: 1, smallChanges: 3 },
  'Premium Plan': { largeCommits: 4, smallChanges: 6 },
  'Elite Plan': { largeCommits: 8, smallChanges: null }, // null = unlimited
  'To be discussed': { largeCommits: 0, smallChanges: 0 },
};

function getRequestBaseDate(request) {
  const source = request?.createdAt || request?.date;
  const parsed = source ? new Date(source) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

function addOneMonth(date) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function formatDateTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysRemaining(endDateValue) {
  if (!endDateValue) return null;
  const endDate = new Date(endDateValue);
  if (Number.isNaN(endDate.getTime())) return null;
  const diffMs = startOfDay(endDate).getTime() - startOfDay(new Date()).getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

const ServiceRequestsTab = ({ data = [], onDelete, onUpdatePlan, onUpdateStatus, focusRequestId }) => {
  const [menuOpen, setMenuOpen] = useState(null);
  const [query, setQuery] = useState('');
  const [filterSource, setFilterSource] = useState('any');
  const [filterAccepted, setFilterAccepted] = useState('any');
  const [filterPlan, setFilterPlan] = useState('any');
  const [sortBy, setSortBy] = useState('createdDesc');
  const [updatePlanModal, setUpdatePlanModal] = useState(null);
  const [newPlan, setNewPlan] = useState('');
  const [creditModal, setCreditModal] = useState(null);
  const [requestCredits, setRequestCredits] = useState({});
  const [notesDrafts, setNotesDrafts] = useState({});
  const [notesDirty, setNotesDirty] = useState({});
  const [notesSaving, setNotesSaving] = useState({});
  const [websiteBuildingDrafts, setWebsiteBuildingDrafts] = useState({});
  const [websiteBuildingDirty, setWebsiteBuildingDirty] = useState({});
  const [websiteBuildingSaving, setWebsiteBuildingSaving] = useState({});
  const [focusedCardId, setFocusedCardId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false });

  const toggleMenu = (index) => {
    setMenuOpen(menuOpen === index ? null : index);
  };

  // Disable dashboard elevation while modal is open to avoid hover flicker
  useEffect(() => {
    const el = document.getElementById('dashboard-screen');
    if (!el) return;
    if (updatePlanModal) {
      el.classList.add('no-elevate');
    } else {
      el.classList.remove('no-elevate');
    }
    return () => el.classList.remove('no-elevate');
  }, [updatePlanModal]);

  // Initialize local credits map from incoming data (if documents already have `credits`)
  useEffect(() => {
    if (!data || !data.length) return;
    const map = {};
    data.forEach((r) => {
      if (r.id && r.credits) {
        map[r.id] = {
          largeCommits: Number(r.credits.largeCommits || 0),
          smallChanges: Number(r.credits.smallChanges || 0),
        };
      }
    });
    if (Object.keys(map).length) setRequestCredits(prev => ({ ...prev, ...map }));
  }, [data]);

  useEffect(() => {
    if (!data || !data.length) return;

    setNotesDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      data.forEach((request) => {
        if (!request?.id || notesDirty[request.id]) return;
        const incoming = String(request.notes || '');
        if (next[request.id] !== incoming) {
          next[request.id] = incoming;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [data, notesDirty]);

  useEffect(() => {
    if (!data || !data.length) return;

    setWebsiteBuildingDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      data.forEach((request) => {
        if (!request?.id || websiteBuildingDirty[request.id]) return;
        const incoming = !!request.includesWebsiteBuilding;
        if (next[request.id] !== incoming) {
          next[request.id] = incoming;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [data, websiteBuildingDirty]);

  useEffect(() => {
    if (!focusRequestId) return;
    const el = document.getElementById(`service-request-${focusRequestId}`);
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFocusedCardId(focusRequestId);
    const timer = window.setTimeout(() => setFocusedCardId(null), 2200);
    return () => window.clearTimeout(timer);
  }, [focusRequestId]);

  const handleUpdatePlan = (request) => {
    setUpdatePlanModal(request);
    setNewPlan(request.plan || '');
    setMenuOpen(null);
  };

  const handleOpenCreditModal = (request) => {
    setCreditModal(request);
    if (!requestCredits[request.id]) {
      setRequestCredits(prev => ({
        ...prev,
        [request.id]: { largeCommits: 0, smallChanges: 0 }
      }));
    }
    setMenuOpen(null);
  };

  const handleNotesChange = (requestId, value) => {
    setNotesDrafts((prev) => ({
      ...prev,
      [requestId]: value,
    }));
    setNotesDirty((prev) => ({
      ...prev,
      [requestId]: true,
    }));
  };

  const handleSaveNotes = async (request) => {
    if (!request?.id) return;

    const draft = String(notesDrafts[request.id] ?? request.notes ?? '');
    const persisted = String(request.notes ?? '');
    if (draft === persisted) return;

    setNotesSaving((prev) => ({ ...prev, [request.id]: true }));
    try {
      await updateDoc(doc(db, 'serviceRequests', request.id), {
        notes: draft,
        notesUpdatedAt: new Date().toISOString(),
      });

      setNotesDirty((prev) => ({
        ...prev,
        [request.id]: false,
      }));
    } catch (err) {
      console.error('Failed to save request notes:', err);
      showConfirm({
        title: 'Error',
        message: 'Failed to save notes. Please try again.',
        cancelLabel: 'OK',
      });
    } finally {
      setNotesSaving((prev) => ({ ...prev, [request.id]: false }));
    }
  };

  const handleWebsiteBuildingToggle = async (request, nextValue) => {
    if (!request?.id) return;

    const baseDate = getRequestBaseDate(request);
    const nextBillingStartDate = nextValue ? addOneMonth(baseDate).toISOString() : null;

    setWebsiteBuildingDrafts((prev) => ({
      ...prev,
      [request.id]: nextValue,
    }));
    setWebsiteBuildingDirty((prev) => ({
      ...prev,
      [request.id]: true,
    }));
    setWebsiteBuildingSaving((prev) => ({
      ...prev,
      [request.id]: true,
    }));

    try {
      await updateDoc(doc(db, 'serviceRequests', request.id), {
        includesWebsiteBuilding: nextValue,
        billingStartDate: nextBillingStartDate,
      });

      setWebsiteBuildingDirty((prev) => ({
        ...prev,
        [request.id]: false,
      }));
    } catch (err) {
      console.error('Failed to save website-building toggle:', err);
      setWebsiteBuildingDrafts((prev) => ({
        ...prev,
        [request.id]: !!request.includesWebsiteBuilding,
      }));
      setWebsiteBuildingDirty((prev) => ({
        ...prev,
        [request.id]: false,
      }));
      showConfirm({
        title: 'Error',
        message: 'Failed to update website building setting. Please try again.',
        cancelLabel: 'OK',
      });
    } finally {
      setWebsiteBuildingSaving((prev) => ({
        ...prev,
        [request.id]: false,
      }));
    }
  };

  const showConfirm = ({ title, message, onConfirm, confirmLabel, cancelLabel, destructive }) => {
    setConfirmModal({ open: true, title, message, onConfirm, confirmLabel, cancelLabel, destructive });
  };

  const closeConfirm = () => setConfirmModal({ open: false });

  const normalizeEmailLocal = (email) => String(email || '').trim().toLowerCase();

  const handleClearPlan = async (request) => {
    if (!request || !request.id) return;

    showConfirm({
      title: 'Clear Plan Details',
      message: `Clear plan details and reset credits for ${request.name || request.email || request.id}?`,
      confirmLabel: 'Clear Plan',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        const currentMonth = new Date().toISOString().slice(0,7);
        const newCredits = { largeCommits: 0, smallChanges: 0, lastResetMonth: currentMonth };
        try {
          await updateDoc(doc(db, 'serviceRequests', request.id), {
            plan: 'To be discussed',
            billingCycle: null,
            includesWebsiteBuilding: false,
            billingStartDate: null,
            credits: newCredits
          });
          // update local UI state
          setRequestCredits(prev => ({ ...prev, [request.id]: { largeCommits: 0, smallChanges: 0 } }));
          setWebsiteBuildingDrafts(prev => ({ ...prev, [request.id]: false }));
          setWebsiteBuildingDirty(prev => ({ ...prev, [request.id]: false }));
          closeConfirm();
          showConfirm({ title: 'Done', message: 'Plan cleared and credits reset.', cancelLabel: 'OK' });
        } catch (err) {
          console.error('Failed to clear plan details:', err);
          closeConfirm();
          showConfirm({ title: 'Error', message: 'Failed to clear plan. Check console for details.', cancelLabel: 'OK' });
        }
      }
    });
  };

  const handleRemoveUser = async (request) => {
    if (!request || !request.email) {
      showConfirm({ title: 'No Email', message: 'No user email available to remove.', cancelLabel: 'OK' });
      return;
    }
    const emailId = normalizeEmailLocal(request.email);

    showConfirm({
      title: 'Remove User',
      message: `Permanently remove user ${request.email}? This cannot be undone.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', emailId));
          closeConfirm();
          showConfirm({ title: 'Removed', message: 'User removed.', cancelLabel: 'OK' });
        } catch (err) {
          console.error('Failed to remove user:', err);
          closeConfirm();
          showConfirm({ title: 'Error', message: 'Failed to remove user. Check console for details.', cancelLabel: 'OK' });
        }
      }
    });
  };

  const addCredit = async (type) => {
    if (!creditModal) return;

    const plan = creditModal.plan;
    const limits = TIER_LIMITS[plan];
    if (!limits) return;

    const currentCredits = requestCredits[creditModal.id] || { largeCommits: 0, smallChanges: 0 };

    let newCredits = { ...currentCredits };

    if (type === 'largeCommit') {
      if (limits.largeCommits !== null && currentCredits.largeCommits >= limits.largeCommits) {
        showConfirm({ title: 'Limit reached', message: `Large Commit limit reached (${limits.largeCommits}/${limits.largeCommits})`, cancelLabel: 'OK' });
        return;
      }
      newCredits.largeCommits = currentCredits.largeCommits + 1;
    } else if (type === 'smallChange') {
      if (limits.smallChanges !== null && currentCredits.smallChanges >= limits.smallChanges) {
        showConfirm({ title: 'Limit reached', message: `Small Change limit reached (${limits.smallChanges}/${limits.smallChanges})`, cancelLabel: 'OK' });
        return;
      }
      newCredits.smallChanges = currentCredits.smallChanges + 1;
    }

    // Update local state immediately for snappy UI
    setRequestCredits(prev => ({
      ...prev,
      [creditModal.id]: newCredits
    }));

    // Persist to Firestore
    try {
      await updateDoc(doc(db, 'serviceRequests', creditModal.id), {
        credits: newCredits
      });
    } catch (err) {
      console.error('Failed to persist credits to Firestore:', err);
      showConfirm({ title: 'Error', message: 'Failed to update credits in database. Please try again.', cancelLabel: 'OK' });
      // revert local state on failure
      setRequestCredits(prev => ({
        ...prev,
        [creditModal.id]: currentCredits
      }));
    }
  };

  const removeCredit = async (type) => {
    if (!creditModal) return;

    const currentCredits = requestCredits[creditModal.id] || { largeCommits: 0, smallChanges: 0 };
    const original = { ...currentCredits };
    let newCredits = { ...currentCredits };

    if (type === 'largeCommit') {
      if (currentCredits.largeCommits <= 0) return;
      newCredits.largeCommits = currentCredits.largeCommits - 1;
    } else if (type === 'smallChange') {
      if (currentCredits.smallChanges <= 0) return;
      newCredits.smallChanges = currentCredits.smallChanges - 1;
    }

    // Update local state immediately
    setRequestCredits(prev => ({
      ...prev,
      [creditModal.id]: newCredits
    }));

    // Persist to Firestore
    try {
      await updateDoc(doc(db, 'serviceRequests', creditModal.id), {
        credits: newCredits
      });
    } catch (err) {
      console.error('Failed to persist credits removal to Firestore:', err);
      showConfirm({ title: 'Error', message: 'Failed to update credits in database. Please try again.', cancelLabel: 'OK' });
      // revert local state on failure
      setRequestCredits(prev => ({
        ...prev,
        [creditModal.id]: original
      }));
    }
  };

  const closeCreditModal = () => {
    setCreditModal(null);
  };

  // MANAGEMENT ACTIONS
  const updateStatus = async (id, newStatus) => {
    await onUpdateStatus(id, { requesterStatus: newStatus });
    setMenuOpen(null);
  };

  const handleMakeLive = async (request) => {
    // Logic: 90 days for quarterly, 30 for monthly/default
    const isQuarterly = request.billingCycle?.toLowerCase().includes('quarterly');
    const days = isQuarterly ? 90 : 30;

    const billingStart = request.includesWebsiteBuilding && request.billingStartDate
      ? new Date(request.billingStartDate)
      : request.includesWebsiteBuilding
        ? addOneMonth(getRequestBaseDate(request))
        : new Date();

    const renewalDate = new Date(billingStart);
    renewalDate.setDate(renewalDate.getDate() + days);

    await onUpdateStatus(request.id, { 
      requesterStatus: 'Active',
      status: 'active',
      billingStartDate: billingStart.toISOString(),
      billingEndDate: renewalDate.toISOString(),
      liveDate: new Date().toISOString(),
      renewalDate: renewalDate.toISOString()
    });
    setMenuOpen(null);
  };

  const confirmUpdatePlan = async () => {
    if (!updatePlanModal || !onUpdatePlan) return;
    try {
      await onUpdatePlan(updatePlanModal.id, newPlan);
      setUpdatePlanModal(null);
      setNewPlan('');
    } catch (error) {
      showConfirm({ title: 'Error', message: 'Failed to update plan. Please try again.', cancelLabel: 'OK' });
    }
  };
  
  const cancelUpdatePlan = () => {
    setUpdatePlanModal(null);
    setNewPlan('');
  };

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();

    const arr = (data || []).filter((req) => {
      if (filterSource !== 'any' && (req.source || '') !== filterSource) return false;

      if (filterAccepted !== 'any') {
        const accepted = !!req.acceptedTerms;
        if (filterAccepted === 'yes' && !accepted) return false;
        if (filterAccepted === 'no' && accepted) return false;
      }

      if (filterPlan !== 'any' && (req.plan || '') !== filterPlan) return false;

      if (!q) return true;

      const hay = [
        req.name,
        req.email,
        req.preferredContact,
        req.otherContacts,
        req.requirements,
        req.projectReference,
        req.requesterStatus,
        req.billingCycle
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
      arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } else if (sortBy === 'nameDesc') {
      arr.sort((a, b) => String(b.name || '').localeCompare(String(a.name || '')));
    }

    return arr;
  }, [data, query, filterSource, filterAccepted, filterPlan, sortBy]);

  return (
    <div className="service-requests-tab">
      <h2>Service Requests</h2>

      <div className="tab-controls">
        <input
          className="search-input"
          placeholder="Search name, email, status, requirements..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <CustomDropdown
          options={[
            { value: 'any', label: 'Any terms' },
            { value: 'yes', label: 'Accepted' },
            { value: 'no', label: 'Not accepted' },
          ]}
          selected={filterAccepted}
          onChange={(v) => setFilterAccepted(v)}
          placeholder="Accepted"
        />

        <CustomDropdown
          options={[
            { value: 'any', label: 'Any Plan' },
            { value: 'Starter Plan', label: 'Starter Plan' },
            { value: 'Premium Plan', label: 'Premium Plan' },
            { value: 'Elite Plan', label: 'Elite Plan' },
            { value: 'To be discussed', label: 'To be discussed' },
          ]}
          selected={filterPlan}
          onChange={(v) => setFilterPlan(v)}
          placeholder="Plan"
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

      {filtered.map((request, index) => {
        const src = String(request.source || 'unknown');
        const srcClass = `source-${src.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
        const isOverdue = request.renewalDate && new Date(request.renewalDate) < new Date();
        const includesWebsiteBuilding = websiteBuildingDrafts[request.id] ?? !!request.includesWebsiteBuilding;
        const isLive = String(request.requesterStatus || '').toLowerCase() === 'active';
        const billingStartDate = request.billingStartDate ? new Date(request.billingStartDate) : null;
        const websiteBuildingWindowOpen = !billingStartDate || Number.isNaN(billingStartDate.getTime()) || new Date() < billingStartDate;
        const showWebsiteBuildingOption = isLive && websiteBuildingWindowOpen;
        const billingDaysRemaining = getDaysRemaining(request.billingEndDate);
        const isBillingExpired = billingDaysRemaining !== null && billingDaysRemaining <= 0;
        const showBillingBadge = billingDaysRemaining !== null;

        return (
          <div
            key={request.id || index}
            id={request.id ? `service-request-${request.id}` : undefined}
            className={`request-card ${isOverdue ? 'card-overdue' : ''}`}
            style={focusedCardId === request.id ? { boxShadow: '0 0 0 2px #f59e0b, 0 0 0 6px rgba(245, 158, 11, 0.18)' } : undefined}
          >
            <div className="card-header">
              <h3>{request.name}</h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {showBillingBadge && (
                  <span
                    className="badge"
                    style={{
                      background: isBillingExpired ? '#7f1d1d' : 'rgba(245, 158, 11, 0.22)',
                      border: `1px solid ${isBillingExpired ? '#ef4444' : '#f59e0b'}`,
                      color: isBillingExpired ? '#fecaca' : '#fde68a',
                    }}
                  >
                    {isBillingExpired ? 'Expired' : `Expiring in ${billingDaysRemaining} days`}
                  </span>
                )}
                <span className={`badge ${srcClass}`}>{src}</span>

                <div className="menu-container">
                  <span
                    className="menu-icon"
                    onClick={() => toggleMenu(index)}
                    style={{ cursor: 'pointer', fontSize: '1.5rem' }}
                  >
                    &#x22EE;
                  </span>

                  {menuOpen === index && (
                    <div className="menu-dropdown">
                      {/* PIPELINE ACTIONS */}
                      {!(request.requesterStatus && String(request.requesterStatus).toLowerCase() === 'active') && (
                        <>
                          <span className="menu-item" onClick={() => updateStatus(request.id, 'Negotiating')}>Negotiating</span>
                          <span className="menu-item" onClick={() => updateStatus(request.id, 'Building')}>Building</span>
                          <span className="menu-item" onClick={() => updateStatus(request.id, 'In Review')}>In Review</span>
                        </>
                      )}
                      {request.plan && String(request.plan).toLowerCase() !== 'to be discussed' && (
                        <span className="menu-item" onClick={() => handleMakeLive(request)} style={{color: '#10b981'}}>Go Live (Paid)</span>
                      )}
                      <hr className="menu-divider" />
                      <span className="menu-item" onClick={() => handleOpenCreditModal(request)} style={{color: '#fbbf24'}}>Manage Credits</span>
                      <span className="menu-item" onClick={() => handleClearPlan(request)}>Clear Plan Details</span>
                      <span className="menu-item" onClick={() => handleUpdatePlan(request)}>Update Plan</span>
                      {request.requesterStatus && String(request.requesterStatus).toLowerCase() === 'active' && (
                        <span className="menu-item" onClick={() => handleRemoveUser(request)} style={{ color: '#ef4444' }}>Remove User</span>
                      )}
                      <span className="menu-item" onClick={() => onDelete(request.id)} style={{ color: 'red' }}>Delete Request</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p><strong>Email:</strong> <span className="value">{request.email}</span></p>
            <p><strong>Preferred Contact:</strong> <span className="value">{request.preferredContact}</span></p>
            {request.otherContacts && (
              <p><strong>Other Contacts:</strong> <span className="value">{request.otherContacts}</span></p>
            )}
            <p><strong>Service Type:</strong> <span className="value">{request.serviceType}</span></p>
            <p><strong>Plan:</strong> <span className="value">{request.plan}</span></p>
            <p><strong>Billing Cycle:</strong> <span className="value">{request.billingCycle || 'Standard'}</span></p>
            <p>
              <strong>Billing Start:</strong>{' '}
              <span className="value">
                {includesWebsiteBuilding
                  ? formatDateTime(request.billingStartDate) || formatDateTime(addOneMonth(getRequestBaseDate(request)).toISOString())
                  : 'Immediate'}
              </span>
            </p>
            <p><strong>Billing End:</strong> <span className="value">{formatDateTime(request.billingEndDate) || '—'}</span></p>

            {showWebsiteBuildingOption && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 12px', color: '#f5d0fe', fontWeight: 'bold' }}>
                <input
                  type="checkbox"
                  checked={includesWebsiteBuilding}
                  disabled={websiteBuildingSaving[request.id]}
                  onChange={(e) => handleWebsiteBuildingToggle(request, e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Includes Website Building
              </label>
            )}

            {showWebsiteBuildingOption && includesWebsiteBuilding && (
              <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                marginBottom: '10px',
                color: '#d1fae5',
                fontWeight: 600,
              }}>
                First Month Free (Website Build Included)
              </div>
            )}
            
            {request.plan && TIER_LIMITS[request.plan] && (() => {
              const credits = requestCredits[request.id] || { largeCommits: 0, smallChanges: 0 };
              const limits = TIER_LIMITS[request.plan];
              return (
                <div style={{ 
                  padding: '10px', 
                  backgroundColor: 'rgba(251, 191, 36, 0.1)', 
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}>
                  <p style={{ margin: '4px 0' }}>
                    <strong>Credits Used:</strong>{' '}
                    <span className="value">
                      Large: {credits.largeCommits}/{limits.largeCommits} | 
                      Small: {credits.smallChanges}/{limits.smallChanges === null ? '∞' : limits.smallChanges}
                    </span>
                  </p>
                </div>
              );
            })()}

            <p><strong>Project Reference:</strong> <span className="value">{request.projectReference}</span></p>
            <p><strong>Requirements:</strong> <span className="value">{request.requirements}</span></p>

            <div style={{ margin: '12px 0 6px' }}>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold', color: '#f5d0fe' }}>
                Admin Notes <span style={{ fontWeight: 400, color: '#c4b5fd' }}>(private)</span>
              </label>
              <textarea
                value={notesDrafts[request.id] ?? String(request.notes || '')}
                onChange={(e) => handleNotesChange(request.id, e.target.value)}
                placeholder="Add internal notes for this request. Visible only in the admin dashboard."
                rows={5}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(167, 139, 250, 0.35)',
                  background: 'rgba(17, 24, 39, 0.85)',
                  color: '#fff',
                  font: 'inherit',
                  lineHeight: 1.5,
                  marginBottom: '8px',
                }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                <div style={{ color: '#c4b5fd', fontSize: '0.9rem' }}>
                  {request.notesUpdatedAt
                    ? `Last updated ${new Date(request.notesUpdatedAt).toLocaleString()}`
                    : 'No saved notes yet.'}
                </div>
                <button
                  onClick={() => handleSaveNotes(request)}
                  disabled={
                    notesSaving[request.id] ||
                    String(notesDrafts[request.id] ?? request.notes ?? '') === String(request.notes ?? '')
                  }
                  style={{
                    padding: '8px 14px',
                    backgroundColor: notesSaving[request.id] ? '#4b5563' : '#6b21a8',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    cursor: notesSaving[request.id] ? 'not-allowed' : 'pointer',
                    opacity: notesSaving[request.id] ? 0.7 : 1,
                  }}
                >
                  {notesSaving[request.id] ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
            <p><strong>Status:</strong> <span className="value" style={{color: isOverdue ? '#ff4d4d' : '#a78bfa', fontWeight: 'bold'}}>{request.requesterStatus || 'Lead'}</span></p>
            
            {request.renewalDate && (
              <p><strong>Next Renewal:</strong> <span className="value" style={{color: isOverdue ? '#ff4d4d' : '#10b981'}}>{new Date(request.renewalDate).toLocaleDateString()}</span></p>
            )}

            <p><strong>Date:</strong> <span className="value">{request.date}</span></p>
            <p><strong>Source:</strong> <span className="value">{request.source}</span></p>
            <p>
              <strong>Accepted Terms:</strong>{' '}
              <span className="value">{request.acceptedTerms ? 'Yes' : 'No'}</span>
            </p>
            <p>
              <strong>Created At:</strong>{' '}
              <span className="value">{request.createdAt ? new Date(request.createdAt).toLocaleString() : '—'}</span>
            </p>

            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #6b21a8' }} />
          </div>
        );
      })}

      {/* Modal remains identical to your original code */}
      {updatePlanModal && (
        <div className="modal-overlay" onClick={cancelUpdatePlan}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Update Plan</h3>
            <p style={{ marginBottom: '16px', color: '#a78bfa' }}>Update the plan for <strong>{updatePlanModal.name}</strong></p>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Select New Plan:</label>
            <div style={{ marginBottom: '20px' }}>
              <CustomDropdown
                options={[
                  { value: '', label: 'Select a Plan' },
                  { value: 'Starter Plan', label: 'Starter Plan' },
                  { value: 'Premium Plan', label: 'Premium Plan' },
                  { value: 'Elite Plan', label: 'Elite Plan' },
                  { value: 'To be discussed', label: 'To be discussed' },
                ]}
                selected={newPlan}
                onChange={(value) => setNewPlan(value)}
                placeholder="Select a Plan"
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={cancelUpdatePlan} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmUpdatePlan} disabled={!newPlan} style={{ padding: '10px 20px', backgroundColor: newPlan ? '#6b21a8' : '#333', border: 'none', borderRadius: '6px', color: '#fff', cursor: newPlan ? 'pointer' : 'not-allowed', opacity: newPlan ? 1 : 0.5 }}>Update</button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Management Modal */}
      {creditModal && (
        <div className="modal-overlay" onClick={closeCreditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Manage Credits</h3>
            <p style={{ marginBottom: '16px', color: '#a78bfa' }}>
              Managing credits for <strong>{creditModal.name}</strong> ({creditModal.plan})
            </p>

            {(() => {
              const plan = creditModal.plan;
              const limits = TIER_LIMITS[plan];
              const credits = requestCredits[creditModal.id] || { largeCommits: 0, smallChanges: 0 };

              if (!limits) {
                return <p style={{ color: '#ef4444' }}>Plan not found. Please update plan first.</p>;
              }

              const largeCommitLimit = limits.largeCommits;
              const smallChangeLimit = limits.smallChanges;
              const largeCommitRemaining = largeCommitLimit - credits.largeCommits;
              const smallChangeRemaining = smallChangeLimit === null ? Infinity : smallChangeLimit - credits.smallChanges;
              const canAddLargeCommit = largeCommitRemaining > 0;
              const canAddSmallChange = smallChangeLimit === null || smallChangeRemaining > 0;

              return (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ marginBottom: '12px', color: '#fbbf24' }}>Large Commits</h4>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      borderRadius: '6px',
                      marginBottom: '12px'
                    }}>
                      <span>
                        <strong>{credits.largeCommits}/{largeCommitLimit}</strong>
                        {largeCommitRemaining <= 0 && <span style={{ color: '#ef4444', marginLeft: '8px' }}>(Limit reached)</span>}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => removeCredit('largeCommit')}
                          disabled={credits.largeCommits <= 0}
                          aria-label="Remove Large Commit credit"
                          style={{
                            padding: '6px 10px',
                            backgroundColor: credits.largeCommits > 0 ? '#ef4444' : '#666',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: credits.largeCommits > 0 ? 'pointer' : 'not-allowed',
                            opacity: credits.largeCommits > 0 ? 1 : 0.5
                          }}
                        >
                          −
                        </button>

                        <button
                          onClick={() => addCredit('largeCommit')}
                          disabled={!canAddLargeCommit}
                          aria-label="Add Large Commit credit"
                          style={{
                            padding: '8px 16px',
                            backgroundColor: canAddLargeCommit ? '#3b82f6' : '#666',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: canAddLargeCommit ? 'pointer' : 'not-allowed',
                            opacity: canAddLargeCommit ? 1 : 0.5
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ marginBottom: '12px', color: '#fbbf24' }}>Small Changes</h4>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px',
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      borderRadius: '6px',
                      marginBottom: '12px'
                    }}>
                      <span>
                        <strong>
                          {credits.smallChanges}/{smallChangeLimit === null ? '∞' : smallChangeLimit}
                        </strong>
                        {smallChangeLimit !== null && smallChangeRemaining <= 0 && <span style={{ color: '#ef4444', marginLeft: '8px' }}>(Limit reached)</span>}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => removeCredit('smallChange')}
                          disabled={credits.smallChanges <= 0}
                          aria-label="Remove Small Change credit"
                          style={{
                            padding: '6px 10px',
                            backgroundColor: credits.smallChanges > 0 ? '#ef4444' : '#666',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: credits.smallChanges > 0 ? 'pointer' : 'not-allowed',
                            opacity: credits.smallChanges > 0 ? 1 : 0.5
                          }}
                        >
                          −
                        </button>

                        <button
                          onClick={() => addCredit('smallChange')}
                          disabled={!canAddSmallChange}
                          aria-label="Add Small Change credit"
                          style={{
                            padding: '8px 16px',
                            backgroundColor: canAddSmallChange ? '#3b82f6' : '#666',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: canAddSmallChange ? 'pointer' : 'not-allowed',
                            opacity: canAddSmallChange ? 1 : 0.5
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ 
                    padding: '12px',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderRadius: '6px',
                    marginBottom: '20px'
                  }}>
                    <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                      <strong>Plan Summary:</strong>
                    </p>
                    <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                      • Large Commits: {largeCommitLimit}/month
                    </p>
                    <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                      • Small Changes: {smallChangeLimit === null ? 'Unlimited' : smallChangeLimit}/month
                    </p>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={closeCreditModal} 
                style={{ 
                  padding: '10px 20px', 
                  backgroundColor: 'transparent', 
                  border: '1px solid rgba(255,255,255,0.2)', 
                  borderRadius: '6px', 
                  color: '#fff', 
                  cursor: 'pointer' 
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Confirm / Info modal */}
      <ConfirmModal
        open={!!confirmModal.open}
        title={confirmModal.title || ''}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
        confirmLabel={confirmModal.confirmLabel}
        cancelLabel={confirmModal.cancelLabel}
        destructive={confirmModal.destructive}
      >
        {confirmModal.message}
      </ConfirmModal>
    </div>
  );
};

export default ServiceRequestsTab;