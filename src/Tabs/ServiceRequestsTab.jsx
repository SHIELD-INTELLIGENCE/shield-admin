import React, { useState, useMemo, useEffect } from 'react';
import '../global.css';
import CustomDropdown from '../components/CustomDropdown.jsx';

const ServiceRequestsTab = ({ data = [], onDelete, onUpdatePlan }) => {
  const [menuOpen, setMenuOpen] = useState(null);
  const [query, setQuery] = useState('');
  const [filterSource, setFilterSource] = useState('any');
  const [filterAccepted, setFilterAccepted] = useState('any');
  const [filterPlan, setFilterPlan] = useState('any');
  const [sortBy, setSortBy] = useState('createdDesc');
  const [updatePlanModal, setUpdatePlanModal] = useState(null);
  const [newPlan, setNewPlan] = useState('');

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

  const handleUpdatePlan = (request) => {
    setUpdatePlanModal(request);
    setNewPlan(request.plan || '');
    setMenuOpen(null);
  };

  const confirmUpdatePlan = async () => {
    if (!updatePlanModal || !onUpdatePlan) return;
    
    try {
      await onUpdatePlan(updatePlanModal.id, newPlan);
      setUpdatePlanModal(null);
      setNewPlan('');
    } catch (error) {
      alert('Failed to update plan. Please try again.');
    }
  };

  const cancelUpdatePlan = () => {
    setUpdatePlanModal(null);
    setNewPlan('');
  };

  const sources = useMemo(() => {
    const set = new Set();
    (data || []).forEach((d) => {
      if (d.source) set.add(d.source);
    });
    return Array.from(set);
  }, [data]);

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
        String(a.name || '').localeCompare(String(b.name || ''))
      );
    } else if (sortBy === 'nameDesc') {
      arr.sort((a, b) =>
        String(b.name || '').localeCompare(String(a.name || ''))
      );
    }

    return arr;
  }, [data, query, filterSource, filterAccepted, filterPlan, sortBy]);

  return (
    <div className="service-requests-tab">
      <h2>Service Requests</h2>

      <div className="tab-controls">
        <input
          className="search-input"
          placeholder="Search name, email, service type, requirements..."
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
        const srcClass = `source-${src
          .replace(/[^a-z0-9]+/gi, '-')
          .toLowerCase()}`;

        return (
          <div key={request.id || index} className="request-card">
            <div className="card-header">
              <h3>{request.name}</h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${srcClass}`}>{src}</span>

                {request.acceptedTerms !== undefined && (
                  <span
                    className={`badge accepted-${
                      request.acceptedTerms ? 'yes' : 'no'
                    }`}
                  >
                    {request.acceptedTerms ? 'Accepted' : 'Not Accepted'}
                  </span>
                )}

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
                      <span
                        className="menu-item"
                        onClick={() => handleUpdatePlan(request)}
                        style={{ cursor: 'pointer', color: '#6b21a8' }}
                      >
                        Update Plan
                      </span>
                      <span
                        className="menu-item"
                        onClick={() => onDelete(request.id)}
                        style={{ cursor: 'pointer', color: 'red' }}
                      >
                        Delete
                      </span>
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
            <p><strong>Project Reference:</strong> <span className="value">{request.projectReference}</span></p>
            <p><strong>Requirements:</strong> <span className="value">{request.requirements}</span></p>
            <p><strong>Education:</strong> <span className="value">{request.education}</span></p>
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

            <hr
              style={{
                margin: '16px 0',
                border: 'none',
                borderTop: '1px solid #6b21a8',
              }}
            />
          </div>
        );
      })}

      {/* Update Plan Modal */}
      {updatePlanModal && (
        <div className="modal-overlay" onClick={cancelUpdatePlan}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Update Plan</h3>
            <p style={{ marginBottom: '16px', color: '#a78bfa' }}>
              Update the plan for <strong>{updatePlanModal.name}</strong>
            </p>
            
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Select New Plan:
            </label>
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
              <button
                onClick={cancelUpdatePlan}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmUpdatePlan}
                disabled={!newPlan}
                style={{
                  padding: '10px 20px',
                  backgroundColor: newPlan ? '#6b21a8' : '#333',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: newPlan ? 'pointer' : 'not-allowed',
                  opacity: newPlan ? 1 : 0.5,
                }}
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceRequestsTab;
