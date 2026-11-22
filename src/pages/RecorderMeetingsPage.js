import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';

const card = {
    background: 'white', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)',
    padding: '1.3rem', marginBottom: '1.5rem',
};
const input = { padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #ccc' };
const btn = {
    padding: '0.45rem 1rem', background: '#016b40', color: 'white', border: 'none',
    borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem',
};
const btnGhost = { ...btn, background: 'white', color: '#016b40', border: '1px solid #016b40' };
const th = { padding: '0.6rem 0.8rem', textAlign: 'left' };
const td = { padding: '0.5rem 0.8rem', verticalAlign: 'middle' };

const Badge = ({ children, bg, fg }) => (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: '0.1rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, marginLeft: 6 }}>
        {children}
    </span>
);

const fmtNaira = (n) => new Intl.NumberFormat('en-NG', {
    style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(n || 0);

const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '');

const toLocalInput = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const OUTCOMES = [
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'returned', label: 'Returned for rework' },
    { value: 'deferred', label: 'Deferred (stays pending)' },
];

const RecorderMeetingsPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [committees, setCommittees] = useState([]);
    const [committeeId, setCommitteeId] = useState(null);
    const [seats, setSeats] = useState([]);          // all active seats of the chosen committee
    const [designations, setDesignations] = useState([]);
    const [people, setPeople] = useState({});
    const [meetings, setMeetings] = useState([]);
    const [meetingId, setMeetingId] = useState(null);
    const [pending, setPending] = useState([]);
    const [resolutions, setResolutions] = useState([]);
    const [mode, setMode] = useState(null);
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState(false);

    const [showNew, setShowNew] = useState(false);
    const [heldAt, setHeldAt] = useState(toLocalInput(new Date()));
    const [venue, setVenue] = useState('');
    const [present, setPresent] = useState({});
    const [openItem, setOpenItem] = useState(null);
    const [form, setForm] = useState({ outcome: 'approved', method: 'consensus', votesFor: '', votesAgainst: '', abstentions: '', notes: '' });

    const flash = (type, text) => setMessage({ type, text });

    useEffect(() => {
        if (!user) navigate('/login');
    }, [user, navigate]);

    // ---------- base data: my Recorder seats, committees, designations, mode ----------
    const loadBase = useCallback(async () => {
        if (!profile?.id) return;
        setLoading(true);
        const [s, d, m] = await Promise.all([
            supabase.from('committee_seats').select('id, committee_id').eq('holder_user_id', profile.id).eq('can_record', true).eq('is_active', true),
            supabase.from('seat_designations').select('code, name'),
            supabase.rpc('get_process_settings'),
        ]);
        if (s.error) { flash('error', 'Error loading your seats: ' + s.error.message); setLoading(false); return; }
        setDesignations(d.data || []);
        setMode(m && m.data ? m.data.committee_mode : null);
        const ids = [...new Set((s.data || []).map(x => x.committee_id))];
        if (ids.length) {
            const c = await supabase.from('committees')
                .select('id, kind, name, lga_ref, quorum_min, quorum_status').in('id', ids).order('name');
            if (c.error) flash('error', 'Error loading committees: ' + c.error.message);
            setCommittees(c.data || []);
            if (c.data && c.data.length) setCommitteeId(prev => prev || c.data[0].id);
        } else {
            setCommittees([]);
        }
        setLoading(false);
    }, [profile]);

    useEffect(() => { loadBase(); }, [loadBase]);

    const committee = committees.find(c => c.id === committeeId) || null;

    // ---------- per-committee data ----------
    const loadCommittee = useCallback(async () => {
        if (!committee) return;
        const [s, mt, pa, u] = await Promise.all([
            supabase.from('committee_seats')
                .select('id, designation_code, department_id, holder_user_id, is_chair, can_record, is_voting')
                .eq('committee_id', committee.id).eq('is_active', true),
            supabase.from('committee_meetings')
                .select('id, held_at, venue, status, attendee_count, quorum_min_snapshot, quorum_status_snapshot, quorum_met, decision_ready, mode')
                .eq('committee_id', committee.id).eq('status', 'open')
                .order('held_at', { ascending: false }).limit(8),
            supabase.from('project_approvals')
                .select('id, project_id, created_at, approval_level:approval_levels(id, code, name, display_name, stage_type), project:project_id(id, title, budget_amount, lga_ref, is_demo)')
                .eq('status', 'pending'),
            supabase.from('ekiti_users').select('id, full_name, username'),
        ]);
        if (s.error) flash('error', 'Error loading seats: ' + s.error.message);
        setSeats(s.data || []);
        setMeetings(mt.data || []);
        const map = {};
        (u.data || []).forEach(x => { map[x.id] = x.full_name || x.username; });
        setPeople(map);
        const items = (pa.data || []).filter(a => {
            const lvl = a.approval_level;
            if (!lvl || lvl.stage_type !== 'committee') return false;
            if (committee.kind === 'CABINET') return lvl.code === 'CABINET';
            return lvl.code === 'FGPC' && a.project && a.project.lga_ref === committee.lga_ref;
        });
        setPending(items);
    }, [committee]);

    useEffect(() => {
        setMeetingId(null); setShowNew(false); setOpenItem(null);
        loadCommittee();
    }, [loadCommittee]);

    useEffect(() => {
        if (!meetingId) { setResolutions([]); return; }
        supabase.from('committee_resolutions')
            .select('id, project_id, outcome, decision_method, votes_for, votes_against, abstentions, notes, is_demo, is_provisional, created_at')
            .eq('meeting_id', meetingId).order('created_at')
            .then(({ data }) => setResolutions(data || []));
    }, [meetingId, pending]);

    const designationName = (code) => (designations.find(d => d.code === code) || {}).name || code;
    const seatLabel = (s) => designationName(s.designation_code);
    const holderName = (s) => (s.holder_user_id ? (people[s.holder_user_id] || 'Seat holder') : null);

    const sortedSeats = useMemo(() => [...seats].sort((a, b) => (b.is_chair - a.is_chair) || seatLabel(a).localeCompare(seatLabel(b))), [seats, designations]); // eslint-disable-line react-hooks/exhaustive-deps

    const votingPresent = seats.filter(s => s.is_voting && present[s.id]).length;
    const quorumNeeded = committee ? committee.quorum_min : null;
    const quorumState = (() => {
        if (!committee) return null;
        if (quorumNeeded === null || quorumNeeded === undefined) return { ok: false, text: 'No quorum has been set for this committee. An admin must set it on the Committees page before any decision can be recorded.' };
        if (votingPresent < quorumNeeded) return { ok: false, text: `${votingPresent} voting member(s) present; ${quorumNeeded} needed for a quorum.` };
        if (mode !== 'demo' && committee.quorum_status !== 'confirmed') return { ok: false, text: `Quorum met (${votingPresent} of ${quorumNeeded}), but the quorum rule is ${committee.quorum_status}. Live decisions need a Confirmed quorum.` };
        return { ok: true, text: `Quorum met: ${votingPresent} voting member(s) present, ${quorumNeeded} needed.` };
    })();

    // ---------- open a meeting ----------
    const openMeeting = async () => {
        const ids = Object.keys(present).filter(k => present[k]);
        if (!ids.length) { flash('error', 'Tick at least one member as present.'); return; }
        setBusy(true);
        const { data, error } = await supabase.rpc('open_committee_meeting', {
            p_committee_id: committee.id,
            p_held_at: new Date(heldAt).toISOString(),
            p_venue: venue || null,
            p_present_seat_ids: ids,
        });
        setBusy(false);
        if (error) { flash('error', error.message); return; }
        flash('ok', data && data.decision_ready
            ? 'Meeting opened. Quorum is met, so decisions can be recorded.'
            : 'Meeting opened, but decisions cannot be recorded yet (see the quorum message).');
        setShowNew(false); setPresent({}); setVenue('');
        await loadCommittee();
        if (data && data.meeting_id) setMeetingId(data.meeting_id);
    };

    // ---------- record a resolution ----------
    const recordResolution = async (approval) => {
        const isMajority = form.method === 'majority';
        const num = (v) => (v === '' ? null : Number(v));
        if (isMajority && (form.votesFor === '' || form.votesAgainst === '')) {
            flash('error', 'Enter the votes for and against for a majority decision.'); return;
        }
        if ((form.outcome === 'rejected' || form.outcome === 'returned') && !form.notes.trim()) {
            flash('error', 'Add a note giving the reason.'); return;
        }
        setBusy(true);
        const { data, error } = await supabase.rpc('record_committee_resolution', {
            p_meeting_id: meetingId,
            p_approval_id: approval.id,
            p_outcome: form.outcome,
            p_decision_method: form.method,
            p_votes_for: isMajority ? num(form.votesFor) : null,
            p_votes_against: isMajority ? num(form.votesAgainst) : null,
            p_abstentions: isMajority ? num(form.abstentions) : null,
            p_notes: form.notes.trim() || null,
        });
        setBusy(false);
        if (error) { flash('error', error.message); return; }
        const next = data && data.next_stage ? ` Next stage: ${data.next_stage}.` : '';
        flash('ok', `Recorded: ${form.outcome}.${next}${data && data.demo ? ' (DEMO)' : ''}`);
        setOpenItem(null);
        setForm({ outcome: 'approved', method: 'consensus', votesFor: '', votesAgainst: '', abstentions: '', notes: '' });
        await loadCommittee();
    };

    const meeting = meetings.find(m => m.id === meetingId) || null;

    return (
        <div style={{ minHeight: '100vh', background: '#f4f7fc' }}>
            <Header />
            <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 5%' }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', marginBottom: '0.3rem' }}>
                    <i className="fas fa-gavel" style={{ color: '#016b40', marginRight: '0.6rem' }}></i>
                    Committee Meetings
                    {mode === 'demo' && <Badge bg="#fff8e1" fg="#8a6d00">DEMO MODE</Badge>}
                </h1>
                <p style={{ color: '#4b6b68', marginBottom: '1rem' }}>
                    Open a meeting, mark who is present, then record the committee's decision on each project waiting for it.
                    A decision is only accepted when the quorum is met.
                </p>

                {message && (
                    <div style={{
                        background: message.type === 'ok' ? '#e8f5e9' : '#fdecea',
                        border: `1px solid ${message.type === 'ok' ? '#a5d6a7' : '#ef9a9a'}`,
                        color: message.type === 'ok' ? '#1b5e20' : '#b71c1c',
                        borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1rem', fontSize: '0.9rem',
                        display: 'flex', justifyContent: 'space-between', gap: '1rem',
                    }}>
                        <span>{message.text}</span>
                        <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
                    </div>
                )}

                {loading ? <p>Loading...</p> : !committees.length ? (
                    <div style={card}>
                        <p style={{ margin: 0 }}>
                            You do not hold a Recorder seat on any committee. An admin assigns Recorder seats on the
                            Admin → Committees page (tick "Records decisions" and choose you as the holder).
                        </p>
                    </div>
                ) : (
                    <>
                        {committees.length > 1 && (
                            <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '1rem' }}>
                                Committee<br />
                                <select value={committeeId || ''} onChange={e => setCommitteeId(e.target.value)} style={{ ...input, width: 300 }}>
                                    {committees.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </label>
                        )}

                        {committee && (
                            <>
                                {/* ---------- meetings ---------- */}
                                <div style={card}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                                        <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{committee.name}</h2>
                                        <button style={btn} onClick={() => { setShowNew(v => !v); setMeetingId(null); }}>
                                            {showNew ? 'Cancel' : 'New meeting'}
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: '#4b6b68', margin: '0.4rem 0 0' }}>
                                        Quorum: {committee.quorum_min ?? 'not set'} ({committee.quorum_status})
                                    </p>

                                    {showNew && (
                                        <div style={{ marginTop: '1rem' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                                                <label style={{ fontSize: '0.85rem' }}>
                                                    Date and time<br />
                                                    <input type="datetime-local" value={heldAt} onChange={e => setHeldAt(e.target.value)} style={input} />
                                                </label>
                                                <label style={{ fontSize: '0.85rem' }}>
                                                    Venue (optional)<br />
                                                    <input type="text" value={venue} onChange={e => setVenue(e.target.value)} style={{ ...input, width: 260 }} />
                                                </label>
                                            </div>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#f4f7fc' }}>
                                                        <th style={th}>Present</th><th style={th}>Seat</th><th style={th}>Holder</th><th style={th}>Votes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedSeats.map(s => (
                                                        <tr key={s.id} style={{ borderTop: '1px solid #eee', opacity: s.holder_user_id ? 1 : 0.5 }}>
                                                            <td style={td}>
                                                                <input type="checkbox" disabled={!s.holder_user_id} checked={!!present[s.id]}
                                                                    onChange={e => setPresent(p => ({ ...p, [s.id]: e.target.checked }))} />
                                                            </td>
                                                            <td style={{ ...td, fontWeight: 600 }}>{seatLabel(s)}{s.is_chair ? ' (leads)' : ''}</td>
                                                            <td style={td}>{holderName(s) || <em style={{ color: '#999' }}>Vacant</em>}</td>
                                                            <td style={td}>{s.is_voting ? 'Yes' : 'No'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {quorumState && (
                                                <p style={{ fontSize: '0.9rem', marginTop: '0.8rem', color: quorumState.ok ? '#1b5e20' : '#b71c1c' }}>
                                                    {quorumState.text}
                                                </p>
                                            )}
                                            <button style={btn} disabled={busy} onClick={openMeeting}>Open meeting</button>
                                        </div>
                                    )}

                                    {!showNew && (
                                        <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
                                            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Open meetings</h3>
                                            {meetings.length === 0 ? <p style={{ color: '#999', fontSize: '0.9rem' }}>No open meetings. Click New meeting.</p> : (
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f4f7fc' }}>
                                                            <th style={th}>Held</th><th style={th}>Venue</th><th style={th}>Present</th><th style={th}>Can decide?</th><th style={th}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {meetings.map(m => (
                                                            <tr key={m.id} style={{ borderTop: '1px solid #eee', background: m.id === meetingId ? '#e8f5ee' : 'white' }}>
                                                                <td style={td}>{fmtDate(m.held_at)}{m.mode === 'demo' && <Badge bg="#fff8e1" fg="#8a6d00">DEMO</Badge>}</td>
                                                                <td style={td}>{m.venue || '—'}</td>
                                                                <td style={td}>{m.attendee_count} (quorum {m.quorum_min_snapshot ?? 'not set'})</td>
                                                                <td style={td}>{m.decision_ready
                                                                    ? <Badge bg="#e8f5e9" fg="#1b5e20">Yes</Badge>
                                                                    : <Badge bg="#fdecea" fg="#b71c1c">No</Badge>}</td>
                                                                <td style={td}><button style={btnGhost} onClick={() => { setMeetingId(m.id); setOpenItem(null); }}>Work on this</button></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ---------- decisions ---------- */}
                                {meeting && (
                                    <div style={card}>
                                        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.3rem' }}>Decisions for the meeting of {fmtDate(meeting.held_at)}</h2>
                                        {!meeting.decision_ready && (
                                            <p style={{ color: '#b71c1c', fontSize: '0.9rem' }}>
                                                This meeting cannot record decisions: the quorum was not met, is not set, or is not Confirmed
                                                for live use. Open a new meeting once that is fixed.
                                            </p>
                                        )}
                                        <h3 style={{ fontSize: '1rem', margin: '0.8rem 0 0.5rem' }}>Waiting for this committee</h3>
                                        {pending.length === 0 ? <p style={{ color: '#999', fontSize: '0.9rem' }}>No projects are waiting for this committee.</p> : pending.map(a => (
                                            <div key={a.id} style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '0.8rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
                                                    <div>
                                                        <strong>{a.project ? a.project.title : 'Project'}</strong>
                                                        {a.project && a.project.is_demo && <Badge bg="#fff8e1" fg="#8a6d00">DEMO</Badge>}
                                                        <div style={{ fontSize: '0.85rem', color: '#4b6b68' }}>
                                                            {fmtNaira(a.project && a.project.budget_amount)} · {a.approval_level.display_name || a.approval_level.name}
                                                        </div>
                                                    </div>
                                                    <button style={btnGhost} disabled={!meeting.decision_ready}
                                                        onClick={() => setOpenItem(openItem === a.id ? null : a.id)}>
                                                        {openItem === a.id ? 'Close' : 'Record decision'}
                                                    </button>
                                                </div>
                                                {openItem === a.id && (
                                                    <div style={{ marginTop: '0.9rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                                                        <label style={{ fontSize: '0.85rem' }}>
                                                            Outcome<br />
                                                            <select value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} style={{ ...input, width: 210 }}>
                                                                {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                            </select>
                                                        </label>
                                                        <label style={{ fontSize: '0.85rem' }}>
                                                            How decided<br />
                                                            <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))} style={{ ...input, width: 200 }}>
                                                                <option value="consensus">Everyone agreed</option>
                                                                <option value="majority">Majority vote</option>
                                                            </select>
                                                        </label>
                                                        {form.method === 'majority' && (
                                                            <>
                                                                <label style={{ fontSize: '0.85rem' }}>For<br />
                                                                    <input type="number" min="0" value={form.votesFor} onChange={e => setForm(f => ({ ...f, votesFor: e.target.value }))} style={{ ...input, width: 70 }} /></label>
                                                                <label style={{ fontSize: '0.85rem' }}>Against<br />
                                                                    <input type="number" min="0" value={form.votesAgainst} onChange={e => setForm(f => ({ ...f, votesAgainst: e.target.value }))} style={{ ...input, width: 70 }} /></label>
                                                                <label style={{ fontSize: '0.85rem' }}>Abstain<br />
                                                                    <input type="number" min="0" value={form.abstentions} onChange={e => setForm(f => ({ ...f, abstentions: e.target.value }))} style={{ ...input, width: 70 }} /></label>
                                                            </>
                                                        )}
                                                        <label style={{ fontSize: '0.85rem', flex: '1 1 260px' }}>
                                                            Notes / minutes{(form.outcome === 'rejected' || form.outcome === 'returned') ? ' (required)' : ''}<br />
                                                            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...input, width: '100%' }} />
                                                        </label>
                                                        <button style={btn} disabled={busy} onClick={() => recordResolution(a)}>Save decision</button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        {resolutions.length > 0 && (
                                            <>
                                                <h3 style={{ fontSize: '1rem', margin: '1.2rem 0 0.5rem' }}>Recorded at this meeting</h3>
                                                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem' }}>
                                                    {resolutions.map(r => (
                                                        <li key={r.id}>
                                                            {r.outcome} ({r.decision_method}
                                                            {r.votes_for !== null ? `, ${r.votes_for} for / ${r.votes_against} against / ${r.abstentions ?? 0} abstained` : ''})
                                                            {r.notes ? ` — ${r.notes}` : ''}
                                                            {r.is_demo && <Badge bg="#fff8e1" fg="#8a6d00">DEMO</Badge>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default RecorderMeetingsPage;