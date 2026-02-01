import React, { useState, useMemo } from 'react';
import '../global.css';
import CustomDropdown from '../components/CustomDropdown.jsx';

const JoinApplicationsTab = ({ data = [], onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(null);
  const [query, setQuery] = useState('');
  const [filterSource, setFilterSource] = useState('any');
  const [filterAccepted, setFilterAccepted] = useState('any');
  const [sortBy, setSortBy] = useState('createdDesc');

  const toggleMenu = (index) => {
    setMenuOpen(menuOpen === index ? null : index);
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
          placeholder="Search name, email, contact, reason..."
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
        const srcClass = `source-${src
          .replace(/[^a-z0-9]+/gi, '-')
          .toLowerCase()}`;

        return (
          <div key={application.id || index} className="application-card">
            <div className="card-header">
              <h3>{application.fullName}</h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${srcClass}`}>{src}</span>

                {application.acceptedTerms !== undefined && (
                  <span
                    className={`badge accepted-${
                      application.acceptedTerms ? 'yes' : 'no'
                    }`}
                  >
                    {application.acceptedTerms ? 'Accepted' : 'Not Accepted'}
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
                        onClick={() => onDelete(application.id)}
                        style={{ cursor: 'pointer', color: 'red' }}
                      >
                        Delete
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p><strong>Email:</strong> <span className="value">{application.email}</span></p>
            <p><strong>Contact:</strong> <span className="value">{application.contact}</span></p>
            <p><strong>Date of Birth:</strong> <span className="value">{application.dob}</span></p>
            <p><strong>Education:</strong> <span className="value">{application.education}</span></p>
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
    </div>
  );
};

export default JoinApplicationsTab;
