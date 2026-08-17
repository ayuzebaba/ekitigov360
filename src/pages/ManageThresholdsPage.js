import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';

const ManageThresholdsPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const [thresholds, setThresholds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        if (profile && !profile.is_admin) {
            navigate('/dashboard');
            return;
        }
        if (profile?.is_admin) {
            fetchThresholds();
        }
    }, [user, profile]);

    const fetchThresholds = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('approval_thresholds')
            .select('*, approval_levels(name)')
            .order('min_amount', { ascending: true });

        if (error) {
            console.error('Error fetching thresholds:', error);
            alert('Error loading approval thresholds: ' + error.message);
        } else {
            setThresholds(data || []);
        }
        setLoading(false);
    };

    const handleFieldChange = (id, field, value) => {
        setThresholds(prev =>
            prev.map(t => (t.id === id ? { ...t, [field]: value } : t))
        );
    };

    const handleSave = async (id) => {
        setSavingId(id);
        const target = thresholds.find(t => t.id === id);

        const { error } = await supabase
            .from('approval_thresholds')
            .update({
                min_amount: target.min_amount === '' ? 0 : Number(target.min_amount),
                max_amount: target.max_amount === '' || target.max_amount === null ? null : Number(target.max_amount),
                requires_state_oversight: target.requires_state_oversight,
            })
            .eq('id', id);

        if (error) {
            alert('Error saving: ' + error.message);
        } else {
            alert(`Updated "${target.approval_levels?.name}" threshold successfully.`);
            fetchThresholds();
        }
        setSavingId(null);
    };

    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return 'No upper limit';
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    if (!profile?.is_admin) {
        return (
            <div style={{ minHeight: '100vh', background: '#f4f7fc' }}>
                <Header />
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <p>Checking permissions...</p>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f4f7fc' }}>
            <Header />
            <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 5%' }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', marginBottom: '0.3rem' }}>
                    <i className="fas fa-sliders-h" style={{ color: '#016b40', marginRight: '0.6rem' }}></i>
                    Approval Thresholds
                </h1>
                <p style={{ color: '#4b6b68', marginBottom: '1rem' }}>
                    Set the budget ranges that determine which approval level a project routes through.
                    Changes save immediately per row.
                </p>
                <div style={{
                    background: '#fff8e1',
                    border: '1px solid #ffd54f',
                    borderRadius: 10,
                    padding: '0.9rem 1.2rem',
                    marginBottom: '1.5rem',
                    fontSize: '0.9rem',
                    color: '#5d4a00'
                }}>
                    <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }}></i>
                    Level <strong>names</strong> (Director, Chairman, State) are intentionally not editable here —
                    the approval routing logic is built around those exact names. Only the budget ranges and
                    the "Requires State Oversight" flag are safe to change.
                </div>

                {loading ? (
                    <p>Loading thresholds...</p>
                ) : (
                    <div style={{ overflowX: 'auto', background: 'white', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#f4f7fc', textAlign: 'left' }}>
                                    <th style={{ padding: '0.8rem' }}>Level</th>
                                    <th style={{ padding: '0.8rem' }}>Min Amount (₦)</th>
                                    <th style={{ padding: '0.8rem' }}>Max Amount (₦, blank = no limit)</th>
                                    <th style={{ padding: '0.8rem' }}>Requires State Oversight</th>
                                    <th style={{ padding: '0.8rem' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {thresholds.map(t => (
                                    <tr key={t.id} style={{ borderTop: '1px solid #eee' }}>
                                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>
                                            {t.approval_levels?.name || 'Unknown'}
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>
                                            <input
                                                type="number"
                                                value={t.min_amount ?? ''}
                                                onChange={(e) => handleFieldChange(t.id, 'min_amount', e.target.value)}
                                                style={{ padding: '0.3rem', borderRadius: 6, border: '1px solid #ccc', width: 140 }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>
                                            <input
                                                type="number"
                                                value={t.max_amount ?? ''}
                                                onChange={(e) => handleFieldChange(t.id, 'max_amount', e.target.value)}
                                                placeholder="No limit"
                                                style={{ padding: '0.3rem', borderRadius: 6, border: '1px solid #ccc', width: 140 }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={!!t.requires_state_oversight}
                                                onChange={(e) => handleFieldChange(t.id, 'requires_state_oversight', e.target.checked)}
                                            />
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>
                                            <button
                                                onClick={() => handleSave(t.id)}
                                                disabled={savingId === t.id}
                                                style={{
                                                    padding: '0.4rem 0.9rem',
                                                    background: '#016b40',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: 8,
                                                    cursor: 'pointer',
                                                    fontSize: '0.85rem'
                                                }}
                                            >
                                                {savingId === t.id ? 'Saving...' : 'Save'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{ marginTop: '2rem', background: 'white', borderRadius: 16, padding: '1.5rem', border: '1px solid rgba(0,0,0,0.08)' }}>
                    <h3 style={{ marginBottom: '0.8rem' }}>Current Ranges (read-only summary)</h3>
                    {thresholds.map(t => (
                        <p key={t.id} style={{ fontSize: '0.9rem', color: '#4b6b68', marginBottom: 4 }}>
                            <strong>{t.approval_levels?.name}:</strong> {formatCurrency(t.min_amount)} – {formatCurrency(t.max_amount)}
                            {t.requires_state_oversight && <span style={{ color: '#f57c00' }}> · Requires State Oversight</span>}
                        </p>
                    ))}
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default ManageThresholdsPage;