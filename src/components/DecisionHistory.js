import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '');

const STATUS_STYLE = {
    approved: { bg: '#e8f5e9', fg: '#1b5e20' },
    rejected: { bg: '#fdecea', fg: '#b71c1c' },
    pending: { bg: '#fff3e0', fg: '#e65100' },
    returned: { bg: '#e3f2fd', fg: '#0d47a1' },
    escalated: { bg: '#f3e5f5', fg: '#6a1b9a' },
};

const Pill = ({ children, bg, fg }) => (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: '0.1rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, marginRight: 6 }}>
        {children}
    </span>
);

// Decision history for one project: every approval stage, committee resolutions
// (votes, quorum status, notes) and Cabinet escalations, oldest first.
const DecisionHistory = ({ projectId }) => {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            const [ap, rs, es, dir] = await Promise.all([
                supabase.from('project_approvals')
                    .select('id, status, comments, created_at, approved_at, approver_id, resolution_id, approval_level:approval_levels(name, display_name, code, stage_type)')
                    .eq('project_id', projectId).order('created_at', { ascending: true }),
                supabase.from('committee_resolutions')
                    .select('id, outcome, decision_method, votes_for, votes_against, abstentions, notes, is_provisional, is_demo, created_at, meeting:meeting_id(held_at, venue, quorum_min_snapshot, attendee_count, committee:committee_id(name))')
                    .eq('project_id', projectId),
                supabase.from('approval_escalations')
                    .select('id, reason, created_at, from_level:from_level_id(name), to_level:to_level_id(name)')
                    .eq('project_id', projectId).order('created_at', { ascending: true }),
                supabase.rpc('get_officials_directory'),
            ]);
            if (cancelled) return;
            const err = [ap, rs, es].find(x => x.error);
            if (err) { setError(err.error.message); setLoading(false); return; }
            const names = {};
            (dir.data || []).forEach(o => { names[o.auth_id] = o.full_name || o.username; });
            const resById = {};
            (rs.data || []).forEach(r => { resById[r.id] = r; });
            const usedRes = new Set();
            const list = [];
            (ap.data || []).forEach(a => {
                const r = a.resolution_id ? resById[a.resolution_id] : null;
                if (r) usedRes.add(r.id);
                list.push({
                    key: 'a' + a.id, when: a.approved_at || a.created_at, kind: 'stage', a, r,
                    who: a.approver_id ? names[a.approver_id] : null,
                });
            });
            // resolutions not tied to a decided approval (for example "deferred")
            (rs.data || []).filter(r => !usedRes.has(r.id)).forEach(r => {
                list.push({ key: 'r' + r.id, when: r.created_at, kind: 'resolution', r });
            });
            (es.data || []).forEach(e => list.push({ key: 'e' + e.id, when: e.created_at, kind: 'escalation', e }));
            list.sort((x, y) => new Date(x.when) - new Date(y.when));
            setItems(list);
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [projectId]);

    const resolutionText = (r) => {
        const m = r.meeting;
        const parts = [];
        if (m && m.committee) parts.push(m.committee.name);
        if (m && m.held_at) parts.push('meeting of ' + fmt(m.held_at));
        const how = r.decision_method === 'majority'
            ? `majority vote (${r.votes_for ?? 0} for, ${r.votes_against ?? 0} against, ${r.abstentions ?? 0} abstained)`
            : 'everyone agreed';
        return { head: parts.join(' · '), how };
    };

    if (loading) return <p>Loading approval history...</p>;
    if (error) return <p style={{ color: '#b71c1c' }}>Could not load the history: {error}</p>;
    if (!items.length) {
        return (
            <div className="empty-state">
                <i className="fas fa-clipboard-check"></i>
                <p>This project has not been submitted for approval yet.</p>
            </div>
        );
    }

    return (
        <div>
            {items.map(it => {
                if (it.kind === 'escalation') {
                    return (
                        <div key={it.key} style={{ borderLeft: '3px solid #6a1b9a', padding: '0.4rem 0 0.4rem 0.9rem', marginBottom: '0.9rem' }}>
                            <div><Pill bg="#f3e5f5" fg="#6a1b9a">ESCALATED</Pill><strong>Escalated to Cabinet</strong></div>
                            <div style={{ fontSize: '0.85rem', color: '#4b6b68' }}>{fmt(it.e.created_at)}</div>
                            <div style={{ fontSize: '0.9rem' }}>Reason: {it.e.reason}</div>
                        </div>
                    );
                }
                if (it.kind === 'resolution') {
                    const t = resolutionText(it.r);
                    return (
                        <div key={it.key} style={{ borderLeft: '3px solid #9e9e9e', padding: '0.4rem 0 0.4rem 0.9rem', marginBottom: '0.9rem' }}>
                            <div><Pill bg="#eeeeee" fg="#424242">{it.r.outcome.toUpperCase()}</Pill><strong>Committee resolution</strong>
                                {it.r.is_demo && <Pill bg="#fff8e1" fg="#8a6d00">DEMO</Pill>}</div>
                            <div style={{ fontSize: '0.85rem', color: '#4b6b68' }}>{fmt(it.r.created_at)} · {t.head}</div>
                            <div style={{ fontSize: '0.9rem' }}>{t.how}{it.r.notes ? ` — ${it.r.notes}` : ''}</div>
                        </div>
                    );
                }
                const st = STATUS_STYLE[it.a.status] || { bg: '#eeeeee', fg: '#424242' };
                const lvl = it.a.approval_level || {};
                const t = it.r ? resolutionText(it.r) : null;
                return (
                    <div key={it.key} style={{ borderLeft: `3px solid ${st.fg}`, padding: '0.4rem 0 0.4rem 0.9rem', marginBottom: '0.9rem' }}>
                        <div>
                            <Pill bg={st.bg} fg={st.fg}>{it.a.status.toUpperCase()}</Pill>
                            <strong>{lvl.display_name || lvl.name || 'Approval stage'}</strong>
                            {it.r && it.r.is_demo && <Pill bg="#fff8e1" fg="#8a6d00">DEMO</Pill>}
                            {it.r && it.r.is_provisional && <Pill bg="#fff8e1" fg="#8a6d00">PROVISIONAL QUORUM</Pill>}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#4b6b68' }}>
                            {it.a.status === 'pending' ? `Waiting since ${fmt(it.a.created_at)}` : fmt(it.when)}
                            {it.who ? ` · ${it.who}` : ''}
                        </div>
                        {t && <div style={{ fontSize: '0.9rem' }}>{t.head}: {t.how}</div>}
                        {it.a.comments && (
                            <div style={{ fontSize: '0.9rem' }}>
                                {lvl.stage_type === 'review_forward' ? 'Funds note: ' : 'Comments: '}{it.a.comments}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default DecisionHistory;