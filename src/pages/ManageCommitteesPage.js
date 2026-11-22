import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';

const STATUS_OPTIONS = [
    { value: 'unverified', label: 'Unverified' },
    { value: 'provisional', label: 'Provisional' },
    { value: 'confirmed', label: 'Confirmed' },
];

const STATUS_COLORS = {
    unverified: { bg: '#fdecea', fg: '#b71c1c' },
    provisional: { bg: '#fff8e1', fg: '#8a6d00' },
    confirmed: { bg: '#e8f5e9', fg: '#1b5e20' },
};

const card = {
    background: 'white',
    borderRadius: 16,
    border: '1px solid rgba(0,0,0,0.08)',
    padding: '1.3rem',
    marginBottom: '1.5rem',
};
const input = { padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #ccc' };
const btn = {
    padding: '0.4rem 0.9rem', background: '#016b40', color: 'white', border: 'none',
    borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem',
};
const btnGhost = { ...btn, background: 'white', color: '#016b40', border: '1px solid #016b40' };
const th = { padding: '0.6rem 0.8rem', textAlign: 'left' };
const td = { padding: '0.5rem 0.8rem', verticalAlign: 'middle' };

const StatusBadge = ({ status }) => {
    const c = STATUS_COLORS[status] || STATUS_COLORS.unverified;
    const label = (STATUS_OPTIONS.find(o => o.value === status) || {}).label || status;
    return (
        <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: '0.1rem 0.6rem', fontSize: '0.78rem', fontWeight: 600 }}>
            {label}
        </span>
    );
};

const StatusBadgeText = ({ children, bg, fg }) => (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: '0.1rem 0.6rem', fontSize: '0.78rem', fontWeight: 600 }}>{children}</span>
);

const fmtNaira = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-NG'));

const ManageCommitteesPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [committees, setCommittees] = useState([]);
    const [seats, setSeats] = useState([]);
    const [designations, setDesignations] = useState([]);
    const [people, setPeople] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [proc, setProc] = useState({ committee_mode: null, active_rule_set: 'legacy', lga_overrides: [] });
    const [checks, setChecks] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }
    const [busy, setBusy] = useState(false);

    // editable copies
    const [quorumEdit, setQuorumEdit] = useState({ quorum_min: '', quorum_status: 'unverified' });
    const [showRemoved, setShowRemoved] = useState(false);
    const [newSeat, setNewSeat] = useState({ designation_code: '', department_id: '', can_record: false, is_voting: true });
    const [limits, setLimits] = useState({ lg: '', lgStatus: 'provisional', state: '', stateStatus: 'provisional' });

    const flash = (type, text) => setMessage({ type, text });

    const loadAll = useCallback(async () => {
        setLoading(true);
        const [c, s, d, p, dep, r, ps] = await Promise.all([
            supabase.from('committees').select('id, kind, name, lga_ref, quorum_min, quorum_status, decision_rule, is_active').order('name'),
            supabase.from('committee_seats').select('id, committee_id, designation_code, department_id, holder_user_id, is_chair, can_record, is_voting, is_active, created_at').order('created_at'),
            supabase.from('seat_designations').select('code, name, tier, sort_order, is_active').order('sort_order'),
            supabase.from('ekiti_users').select('id, username, full_name, role, lga, is_active').order('full_name'),
            supabase.from('departments').select('id, name').order('name'),
            supabase.from('approval_routes').select('id, name, tier, min_amount, max_amount, status, rule_status, rule_set, version')
                .eq('rule_set', 'ekiti_process_v1').neq('status', 'retired').order('min_amount'),
            supabase.rpc('get_process_settings'),
        ]);
        const firstError = [c, s, d, p, dep, r].find(x => x.error);
        if (firstError) {
            flash('error', 'Error loading data: ' + firstError.error.message);
            setLoading(false);
            return;
        }
        setCommittees(c.data || []);
        setSeats(s.data || []);
        setDesignations(d.data || []);
        setPeople((p.data || []).filter(x => x.is_active !== false));
        setDepartments(dep.data || []);
        setRoutes(r.data || []);
        if (ps.data) setProc(ps.data);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        if (profile && !profile.is_admin) { navigate('/dashboard'); return; }
        if (profile?.is_admin) loadAll();
    }, [user, profile, navigate, loadAll]);

    // Cabinet first, then LG committees alphabetically
    const sortedCommittees = useMemo(() => {
        const list = [...committees];
        list.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'CABINET' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        return list;
    }, [committees]);

    useEffect(() => {
        if (!selectedId && sortedCommittees.length) setSelectedId(sortedCommittees[0].id);
    }, [sortedCommittees, selectedId]);

    const selected = committees.find(c => c.id === selectedId) || null;

    useEffect(() => {
        if (selected) {
            setQuorumEdit({
                quorum_min: selected.quorum_min ?? '',
                quorum_status: selected.quorum_status || 'unverified',
            });
            setNewSeat({ designation_code: '', department_id: '', can_record: false, is_voting: true });
        }
    }, [selectedId, committees]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { setChecks(null); }, [selectedId]);

    // limits panel state follows the routes
    const routeInfo = useMemo(() => {
        const pick = (tier) => {
            const list = routes.filter(r => r.tier === tier).sort((a, b) => Number(a.min_amount) - Number(b.min_amount));
            if (list.length !== 2) return null;
            return { low: list[0], high: list[1] };
        };
        return { lg: pick('LG'), state: pick('STATE') };
    }, [routes]);

    useEffect(() => {
        setLimits({
            lg: routeInfo.lg ? (routeInfo.lg.low.max_amount ?? '') : '',
            lgStatus: routeInfo.lg ? routeInfo.lg.low.rule_status : 'provisional',
            state: routeInfo.state ? (routeInfo.state.low.max_amount ?? '') : '',
            stateStatus: routeInfo.state ? routeInfo.state.low.rule_status : 'provisional',
        });
    }, [routeInfo]);

    const designationName = (code) => (designations.find(d => d.code === code) || {}).name || code;
    const departmentName = (id) => (departments.find(d => d.id === id) || {}).name || '';
    const personLabel = (u) => `${u.full_name || u.username}${u.lga ? ' (' + u.lga + ')' : ''} · ${u.role || 'no role'}`;

    const seatsOf = (committeeId) => seats.filter(s => s.committee_id === committeeId);
    const summaryOf = (committeeId) => {
        const active = seatsOf(committeeId).filter(s => s.is_active);
        return {
            total: active.length,
            filled: active.filter(s => s.holder_user_id).length,
            votingFilled: active.filter(s => s.holder_user_id && s.is_voting).length,
        };
    };

    // ---------------- quorum ----------------
    const parseQuorum = (v) => {
        if (v === '' || v === null || v === undefined) return { ok: true, value: null };
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) return { ok: false };
        return { ok: true, value: n };
    };

    const saveQuorum = async () => {
        const q = parseQuorum(quorumEdit.quorum_min);
        if (!q.ok) { flash('error', 'Quorum must be a whole number of 1 or more, or left blank.'); return; }
        const status = q.value === null ? 'unverified' : quorumEdit.quorum_status;
        setBusy(true);
        const { error } = await supabase.from('committees')
            .update({ quorum_min: q.value, quorum_status: status }).eq('id', selected.id);
        setBusy(false);
        if (error) { flash('error', 'Could not save quorum: ' + error.message); return; }
        flash('ok', `Saved quorum for ${selected.name}.`);
        loadAll();
    };

    const applyQuorumToAllLg = async () => {
        const q = parseQuorum(quorumEdit.quorum_min);
        if (!q.ok || q.value === null) { flash('error', 'Enter a quorum number first.'); return; }
        const lgCount = committees.filter(c => c.kind === 'FGPC').length;
        const ok = window.confirm(
            `Set quorum ${q.value} (${quorumEdit.quorum_status}) on all ${lgCount} LG committees? ` +
            'This replaces any quorum already set on them.'
        );
        if (!ok) return;
        setBusy(true);
        const { error } = await supabase.from('committees')
            .update({ quorum_min: q.value, quorum_status: quorumEdit.quorum_status }).eq('kind', 'FGPC');
        setBusy(false);
        if (error) { flash('error', 'Could not apply quorum: ' + error.message); return; }
        flash('ok', `Applied quorum ${q.value} to all LG committees.`);
        loadAll();
    };

    // ---------------- seats ----------------
    const updateSeat = async (seatId, patch, okText) => {
        setBusy(true);
        const { error } = await supabase.from('committee_seats').update(patch).eq('id', seatId);
        setBusy(false);
        if (error) { flash('error', 'Could not update seat: ' + error.message); return; }
        if (okText) flash('ok', okText);
        loadAll();
    };

    const assignHolder = (seat, userId) => {
        if (userId) {
            const clash = seatsOf(seat.committee_id).find(s => s.id !== seat.id && s.is_active && s.holder_user_id === userId);
            if (clash) {
                flash('error', `That person already holds the ${designationName(clash.designation_code)} seat on this committee. One person cannot fill two seats.`);
                return;
            }
        }
        updateSeat(seat.id, { holder_user_id: userId || null }, userId ? 'Seat holder saved.' : 'Seat is now vacant.');
    };

    const addSeat = async () => {
        if (!newSeat.designation_code) { flash('error', 'Pick a seat type first.'); return; }
        const isHod = newSeat.designation_code === 'HOD';
        if (isHod && !newSeat.department_id) { flash('error', 'A Head of Department seat needs a department.'); return; }
        setBusy(true);
        const { error } = await supabase.from('committee_seats').insert({
            committee_id: selected.id,
            designation_code: newSeat.designation_code,
            department_id: isHod ? newSeat.department_id : null,
            can_record: newSeat.can_record,
            is_voting: newSeat.is_voting,
            is_chair: false,
        });
        setBusy(false);
        if (error) { flash('error', 'Could not add seat: ' + error.message); return; }
        flash('ok', 'Seat added (vacant).');
        loadAll();
    };

    // ---------------- limits ----------------
    const saveLimits = async (tier) => {
        const info = tier === 'LG' ? routeInfo.lg : routeInfo.state;
        const value = tier === 'LG' ? limits.lg : limits.state;
        const status = tier === 'LG' ? limits.lgStatus : limits.stateStatus;
        const n = Number(value);
        if (value === '' || !Number.isFinite(n) || n <= 0) { flash('error', 'Enter the limit as an amount above zero.'); return; }
        if (!info) { flash('error', 'The two routes for this tier were not found.'); return; }
        if (info.low.status === 'published' && info.high.status === 'published') {
            // published routes are never edited: a new version is created and projects in progress keep theirs
            const why = window.prompt('Reason for the change (required). This creates a new version of the route. Projects already in progress keep the version they started on.');
            if (why === null || !why.trim()) { flash('error', 'A reason is required.'); return; }
            setBusy(true);
            const rv = await supabase.rpc('revise_route_limits', {
                p_tier: tier, p_limit: n, p_rule_status: status, p_reason: why.trim(),
            });
            setBusy(false);
            if (rv.error) { flash('error', rv.error.message); return; }
            flash('ok', `Saved a new version of the ${tier === 'LG' ? 'LG' : 'State/MDA'} limit: ₦${fmtNaira(n)} (${status}).`);
            loadAll();
            return;
        }
        if (info.low.status !== 'draft' || info.high.status !== 'draft') {
            flash('error', 'These routes are in a mixed state and cannot be edited here. Tell your developer.');
            return;
        }
        const suffix = status === 'confirmed' ? '' : ' (provisional)';
        const prefix = tier === 'LG' ? 'LG' : 'State/MDA';
        setBusy(true);
        const r1 = await supabase.from('approval_routes').update({
            max_amount: n, rule_status: status, name: `${prefix}: up to ₦${fmtNaira(n)}${suffix}`,
        }).eq('id', info.low.id).eq('status', 'draft');
        if (r1.error) { setBusy(false); flash('error', 'Could not save limit: ' + r1.error.message); return; }
        const r2 = await supabase.from('approval_routes').update({
            min_amount: n, rule_status: status, name: `${prefix}: above ₦${fmtNaira(n)}${suffix}`,
        }).eq('id', info.high.id).eq('status', 'draft');
        setBusy(false);
        if (r2.error) { flash('error', 'Saved the lower route but not the upper one: ' + r2.error.message); loadAll(); return; }
        flash('ok', `Saved the ${prefix} limit: ₦${fmtNaira(n)} (${status}).`);
        loadAll();
    };

    const publishRoutes = async () => {
        if (!window.confirm('Publish the committee-process routes? They cannot be edited afterwards (limits can still be changed by creating a new version). Nothing uses them until an LGA is switched on.')) return;
        const why = window.prompt('Reason (required):', 'Publish committee-process routes for testing');
        if (why === null || !why.trim()) { flash('error', 'A reason is required.'); return; }
        setBusy(true);
        const { error } = await supabase.rpc('publish_process_routes', { p_reason: why.trim() });
        setBusy(false);
        if (error) { flash('error', error.message); return; }
        flash('ok', 'Routes published. No LGA uses them until you switch one on.');
        loadAll();
    };

    const toggleMode = async () => {
        const next = proc.committee_mode === 'demo' ? 'live' : 'demo';
        if (!window.confirm(next === 'demo'
            ? 'Switch to DEMO mode? Projects created for an LGA on the committee process become demo projects, and a Confirmed quorum is not required. Live and demo never mix.'
            : 'Switch to LIVE mode? Decisions then need a Confirmed quorum and Confirmed limits. Demo projects cannot be decided in live mode.')) return;
        const why = window.prompt('Reason (required):');
        if (why === null || !why.trim()) { flash('error', 'A reason is required.'); return; }
        setBusy(true);
        const { error } = await supabase.rpc('set_committee_mode', { p_mode: next, p_reason: why.trim() });
        setBusy(false);
        if (error) { flash('error', error.message); return; }
        flash('ok', `Committee mode is now ${next.toUpperCase()}.`);
        setChecks(null);
        loadAll();
    };

    const runChecks = async () => {
        setBusy(true);
        const { data, error } = await supabase.rpc('check_lga_process', { p_lga_ref: selected.lga_ref, p_rule_set: 'ekiti_process_v1' });
        setBusy(false);
        if (error) { flash('error', error.message); return; }
        setChecks(data || []);
    };

    const switchProcess = async (ruleSet) => {
        const name = selected.name.replace('F&GPC - ', '');
        const on = ruleSet !== 'legacy';
        if (!window.confirm(on
            ? `Switch ${name} to the committee process? New projects in ${name} will follow it. Other LGAs and projects already in progress are not affected.`
            : `Switch ${name} back to the old approval chain? New projects follow the old chain. Projects already in progress keep the route they started on.`)) return;
        const why = window.prompt('Reason (required):');
        if (why === null || !why.trim()) { flash('error', 'A reason is required.'); return; }
        setBusy(true);
        const { error } = await supabase.rpc('set_lga_process', { p_lga_ref: selected.lga_ref, p_rule_set: ruleSet, p_reason: why.trim() });
        setBusy(false);
        if (error) { flash('error', error.message); runChecks(); return; }
        flash('ok', on ? `${name} now uses the committee process.` : `${name} is back on the old chain.`);
        setChecks(null);
        loadAll();
    };

    if (!profile?.is_admin) {
        return (
            <div style={{ minHeight: '100vh', background: '#f4f7fc' }}>
                <Header />
                <div style={{ textAlign: 'center', padding: '4rem' }}><p>Checking permissions...</p></div>
                <Footer />
            </div>
        );
    }

    const sel = selected ? summaryOf(selected.id) : null;
    const selectedSeats = selected
        ? seatsOf(selected.id)
            .filter(s => showRemoved || s.is_active)
            .sort((a, b) => {
                const sa = (designations.find(d => d.code === a.designation_code) || {}).sort_order ?? 999;
                const sb = (designations.find(d => d.code === b.designation_code) || {}).sort_order ?? 999;
                return sa - sb;
            })
        : [];
    const designationChoices = selected
        ? designations.filter(d => d.is_active && d.tier === (selected.kind === 'CABINET' ? 'STATE' : 'LG'))
        : [];
    const quorumNum = parseQuorum(quorumEdit.quorum_min);
    const quorumTooHigh = sel && quorumNum.ok && quorumNum.value !== null && quorumNum.value > sel.votingFilled;

    return (
        <div style={{ minHeight: '100vh', background: '#f4f7fc' }}>
            <Header />
            <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 5%' }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', marginBottom: '0.3rem' }}>
                    <i className="fas fa-users" style={{ color: '#016b40', marginRight: '0.6rem' }}></i>
                    Committees
                </h1>
                <p style={{ color: '#4b6b68', marginBottom: '1rem' }}>
                    Set the quorum, seat holders and approval limits for each committee. Values not yet confirmed by the
                    State should stay <strong>Unverified</strong> or <strong>Provisional</strong>. Live decisions are
                    blocked until a quorum is set, and in live mode until it is <strong>Confirmed</strong>.
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

                {!loading && (
                    <div style={{
                        ...card, padding: '0.9rem 1.2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem',
                        alignItems: 'center', justifyContent: 'space-between',
                        background: proc.committee_mode === 'demo' ? '#fff8e1' : 'white',
                    }}>
                        <div style={{ fontSize: '0.9rem' }}>
                            Committee mode: <strong>{(proc.committee_mode || 'live').toUpperCase()}</strong>.{' '}
                            {proc.committee_mode === 'demo'
                                ? 'Projects for LGAs on the committee process are DEMO projects. A Confirmed quorum is not required.'
                                : 'Decisions need a Confirmed quorum and Confirmed limits.'}
                            <br />
                            <span style={{ color: '#4b6b68' }}>
                                LGAs on the committee process: {proc.lga_overrides.length} of {committees.filter(c => c.kind === 'FGPC').length}.
                                All other LGAs use the old approval chain.
                            </span>
                        </div>
                        <button style={btnGhost} disabled={busy} onClick={toggleMode}>
                            Switch to {proc.committee_mode === 'demo' ? 'LIVE' : 'DEMO'} mode
                        </button>
                    </div>
                )}

                {loading ? <p>Loading committees...</p> : (
                    <>
                        {/* ---------- overview ---------- */}
                        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ background: '#f4f7fc' }}>
                                        <th style={th}>Committee</th>
                                        <th style={th}>Quorum</th>
                                        <th style={th}>Quorum status</th>
                                        <th style={th}>Seats filled</th>
                                        <th style={th}>Approval process</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedCommittees.map(c => {
                                        const sm = summaryOf(c.id);
                                        const isSel = c.id === selectedId;
                                        return (
                                            <tr key={c.id} onClick={() => setSelectedId(c.id)}
                                                style={{ borderTop: '1px solid #eee', cursor: 'pointer', background: isSel ? '#e8f5ee' : 'white' }}>
                                                <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                                                <td style={td}>{c.quorum_min ?? <span style={{ color: '#999' }}>not set</span>}</td>
                                                <td style={td}><StatusBadge status={c.quorum_status} /></td>
                                                <td style={td}>{sm.filled} of {sm.total}</td>
                                                <td style={td}>{c.kind === 'CABINET' ? '—' : (proc.lga_overrides.some(o => o.lga_ref === c.lga_ref)
                                                    ? <StatusBadgeText bg="#e8f5e9" fg="#1b5e20">Committee process</StatusBadgeText>
                                                    : <span style={{ color: '#777' }}>Old chain</span>)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* ---------- selected committee ---------- */}
                        {selected && (
                            <div style={card}>
                                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.8rem' }}>{selected.name}</h2>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '0.6rem' }}>
                                    <label style={{ fontSize: '0.85rem' }}>
                                        Quorum (members needed)<br />
                                        <input type="number" min="1" value={quorumEdit.quorum_min}
                                            onChange={e => setQuorumEdit(q => ({ ...q, quorum_min: e.target.value }))}
                                            placeholder="Not set" style={{ ...input, width: 140 }} />
                                    </label>
                                    <label style={{ fontSize: '0.85rem' }}>
                                        Status<br />
                                        <select value={quorumEdit.quorum_status}
                                            onChange={e => setQuorumEdit(q => ({ ...q, quorum_status: e.target.value }))}
                                            style={{ ...input, width: 160 }}>
                                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </label>
                                    <button style={btn} disabled={busy} onClick={saveQuorum}>Save quorum</button>
                                    {selected.kind === 'FGPC' && (
                                        <button style={btnGhost} disabled={busy} onClick={applyQuorumToAllLg}>Apply to all LG committees</button>
                                    )}
                                </div>
                                {quorumEdit.quorum_min === '' && (
                                    <p style={{ fontSize: '0.82rem', color: '#8a6d00', margin: '0 0 0.6rem' }}>
                                        With no quorum set, this committee cannot record any decision. The status is stored as Unverified.
                                    </p>
                                )}
                                {quorumTooHigh && (
                                    <p style={{ fontSize: '0.82rem', color: '#b71c1c', margin: '0 0 0.6rem' }}>
                                        This quorum is more than the {sel.votingFilled} voting seat(s) currently filled, so no meeting could meet it yet.
                                    </p>
                                )}

                                {selected.kind === 'FGPC' && (() => {
                                    const on = proc.lga_overrides.some(o => o.lga_ref === selected.lga_ref);
                                    const allOk = checks && checks.length > 0 && checks.every(c => c.ok);
                                    return (
                                        <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: '0.9rem 1rem', margin: '1rem 0' }}>
                                            <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem' }}>Approval process for this LGA</h3>
                                            <p style={{ fontSize: '0.9rem', margin: '0 0 0.6rem' }}>
                                                Currently: <strong>{on ? 'Committee process' : 'Old approval chain'}</strong>.{' '}
                                                {on
                                                    ? 'New projects here follow the committee route. Switching back does not change projects already in progress.'
                                                    : 'New projects here follow the old chain, as before.'}
                                            </p>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                                <button style={btnGhost} disabled={busy} onClick={runChecks}>Run checks</button>
                                                {!on && (
                                                    <button style={btn} disabled={busy || (checks && !allOk)} onClick={() => switchProcess('ekiti_process_v1')}>
                                                        Switch this LGA to the committee process
                                                    </button>
                                                )}
                                                {on && (
                                                    <button style={btnGhost} disabled={busy} onClick={() => switchProcess('legacy')}>
                                                        Switch back to the old chain
                                                    </button>
                                                )}
                                            </div>
                                            {checks && (
                                                <ul style={{ listStyle: 'none', padding: 0, margin: '0.8rem 0 0', fontSize: '0.88rem' }}>
                                                    {checks.map((c, i) => (
                                                        <li key={i} style={{ color: c.ok ? '#1b5e20' : '#b71c1c', marginBottom: 2 }}>
                                                            {c.ok ? '✓' : '✗'} {c.check_name}{c.detail ? ` — ${c.detail}` : ''}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    );
                                })()}

                                <h3 style={{ fontSize: '1.05rem', margin: '1.2rem 0 0.5rem' }}>Seats</h3>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ background: '#f4f7fc' }}>
                                                <th style={th}>Seat</th>
                                                <th style={th}>Holder</th>
                                                <th style={th}>Votes</th>
                                                <th style={th}>Records decisions</th>
                                                <th style={th}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedSeats.map(seat => (
                                                <tr key={seat.id} style={{ borderTop: '1px solid #eee', opacity: seat.is_active ? 1 : 0.5 }}>
                                                    <td style={{ ...td, fontWeight: 600 }}>
                                                        {designationName(seat.designation_code)}
                                                        {seat.department_id ? ` · ${departmentName(seat.department_id)}` : ''}
                                                        {seat.is_chair && <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#016b40' }}>(leads)</span>}
                                                    </td>
                                                    <td style={td}>
                                                        <select value={seat.holder_user_id || ''} disabled={busy || !seat.is_active}
                                                            onChange={e => assignHolder(seat, e.target.value)}
                                                            style={{ ...input, maxWidth: 320, width: '100%' }}>
                                                            <option value="">Vacant</option>
                                                            {people.map(u => <option key={u.id} value={u.id}>{personLabel(u)}</option>)}
                                                        </select>
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        <input type="checkbox" checked={!!seat.is_voting} disabled={busy || !seat.is_active}
                                                            onChange={e => updateSeat(seat.id, { is_voting: e.target.checked })} />
                                                    </td>
                                                    <td style={{ ...td, textAlign: 'center' }}>
                                                        <input type="checkbox" checked={!!seat.can_record} disabled={busy || !seat.is_active}
                                                            onChange={e => updateSeat(seat.id, { can_record: e.target.checked })} />
                                                    </td>
                                                    <td style={td}>
                                                        {seat.is_active ? (
                                                            !seat.is_chair && (
                                                                <button style={btnGhost} disabled={busy}
                                                                    onClick={() => updateSeat(seat.id, { is_active: false, holder_user_id: null }, 'Seat removed.')}>
                                                                    Remove
                                                                </button>
                                                            )
                                                        ) : (
                                                            <button style={btnGhost} disabled={busy}
                                                                onClick={() => updateSeat(seat.id, { is_active: true }, 'Seat restored.')}>
                                                                Restore
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {selectedSeats.length === 0 && (
                                                <tr><td colSpan={5} style={{ ...td, color: '#999' }}>No seats.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <label style={{ fontSize: '0.82rem', color: '#4b6b68', display: 'inline-block', marginTop: '0.5rem' }}>
                                    <input type="checkbox" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} /> Show removed seats
                                </label>

                                <h3 style={{ fontSize: '1.05rem', margin: '1.2rem 0 0.5rem' }}>Add a seat</h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                                    <label style={{ fontSize: '0.85rem' }}>
                                        Seat type<br />
                                        <select value={newSeat.designation_code}
                                            onChange={e => setNewSeat(s => ({ ...s, designation_code: e.target.value }))}
                                            style={{ ...input, width: 260 }}>
                                            <option value="">Choose...</option>
                                            {designationChoices.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                                        </select>
                                    </label>
                                    {newSeat.designation_code === 'HOD' && (
                                        <label style={{ fontSize: '0.85rem' }}>
                                            Department<br />
                                            <select value={newSeat.department_id}
                                                onChange={e => setNewSeat(s => ({ ...s, department_id: e.target.value }))}
                                                style={{ ...input, width: 220 }}>
                                                <option value="">Choose...</option>
                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </label>
                                    )}
                                    <label style={{ fontSize: '0.85rem' }}>
                                        <input type="checkbox" checked={newSeat.is_voting}
                                            onChange={e => setNewSeat(s => ({ ...s, is_voting: e.target.checked }))} /> Votes
                                    </label>
                                    <label style={{ fontSize: '0.85rem' }}>
                                        <input type="checkbox" checked={newSeat.can_record}
                                            onChange={e => setNewSeat(s => ({ ...s, can_record: e.target.checked }))} /> Records decisions
                                    </label>
                                    <button style={btn} disabled={busy} onClick={addSeat}>Add seat</button>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#6b8280', marginTop: '0.6rem' }}>
                                    A seat with no holder is vacant and cannot count toward the quorum. One person cannot fill two seats on the same committee.
                                </p>
                            </div>
                        )}

                        {/* ---------- limits ---------- */}
                        <div style={card}>
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.4rem' }}>Approval limits</h2>
                            <p style={{ fontSize: '0.88rem', color: '#4b6b68', marginBottom: '0.9rem' }}>
                                Current working figures: LG Chairman ₦500,000 and Commissioner ₦1,000,000. They stay
                                <strong> Provisional</strong> until confirmed. They apply only to the new committee process, not to the
                                approval chain running today.
                            </p>
                            {[routeInfo.lg, routeInfo.state].some(i => i && (i.low.status === 'draft' || i.high.status === 'draft')) && (
                                <div style={{ marginBottom: '0.9rem' }}>
                                    <button style={btn} disabled={busy} onClick={publishRoutes}>Publish the committee routes</button>
                                    <span style={{ fontSize: '0.82rem', color: '#6b8280', marginLeft: 10 }}>
                                        They are drafts now and nothing uses them. Publishing does not switch any LGA on.
                                    </span>
                                </div>
                            )}
                            {[
                                { tier: 'LG', label: 'LG projects', info: routeInfo.lg, valueKey: 'lg', statusKey: 'lgStatus' },
                                { tier: 'STATE', label: 'State / MDA projects', info: routeInfo.state, valueKey: 'state', statusKey: 'stateStatus' },
                            ].map(row => (
                                <div key={row.tier} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '0.8rem' }}>
                                    <div style={{ width: 170, fontWeight: 600, fontSize: '0.9rem' }}>{row.label}</div>
                                    {row.info ? (
                                        <>
                                            <label style={{ fontSize: '0.85rem' }}>
                                                Limit (₦)<br />
                                                <input type="number" min="1" value={limits[row.valueKey]}
                                                    onChange={e => setLimits(l => ({ ...l, [row.valueKey]: e.target.value }))}
                                                    style={{ ...input, width: 160 }} />
                                            </label>
                                            <label style={{ fontSize: '0.85rem' }}>
                                                Status<br />
                                                <select value={limits[row.statusKey]}
                                                    onChange={e => setLimits(l => ({ ...l, [row.statusKey]: e.target.value }))}
                                                    style={{ ...input, width: 150 }}>
                                                    <option value="prototype">Prototype</option>
                                                    <option value="provisional">Provisional</option>
                                                    <option value="confirmed">Confirmed</option>
                                                </select>
                                            </label>
                                            <button style={btn} disabled={busy} onClick={() => saveLimits(row.tier)}>Save</button>
                                            <span style={{ fontSize: '0.8rem', color: '#6b8280' }}>
                                                {row.info.low.status === 'published'
                                                    ? `Published (version ${row.info.low.version}). A change creates a new version.`
                                                    : 'Draft (not in use yet).'}
                                            </span>
                                        </>
                                    ) : (
                                        <span style={{ fontSize: '0.85rem', color: '#999' }}>The two routes for this tier were not found.</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default ManageCommitteesPage;