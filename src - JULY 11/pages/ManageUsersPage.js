import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';

const ROLE_OPTIONS = [
    'citizen',
    'department_staff',
    'lg_legislative',
    'executive_chairman',
    'mda_oversight',
    'governor',
    'judiciary',
    'hoa',
];

const ManageUsersPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [departments, setDepartments] = useState([]);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        // profile may still be loading on first mount — wait for it
        if (profile && !profile.is_admin) {
            navigate('/dashboard');
            return;
        }
        if (profile?.is_admin) {
            fetchUsers();
            fetchDepartments();
        }
    }, [user, profile]);

    const fetchUsers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('ekiti_users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching users:', error);
            alert('Error loading users: ' + error.message);
        } else {
            setUsers(data || []);
        }
        setLoading(false);
    };

    const fetchDepartments = async () => {
        const { data } = await supabase
            .from('departments')
            .select('id, name')
            .order('name');
        setDepartments(data || []);
    };

    const handleFieldChange = (userId, field, value) => {
        setUsers(prev =>
            prev.map(u => (u.id === userId ? { ...u, [field]: value } : u))
        );
    };

    const handleSave = async (userId) => {
        setSavingId(userId);
        const target = users.find(u => u.id === userId);

        const { error } = await supabase
            .from('ekiti_users')
            .update({
                role: target.role,
                lga: target.lga,
                department_id: target.department_id || null,
                is_admin: target.is_admin,
                is_active: target.is_active,
            })
            .eq('id', userId);

        if (error) {
            alert('Error saving: ' + error.message);
        } else {
            alert(`Updated ${target.username} successfully.`);
        }
        setSavingId(null);
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
            <main style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 5%' }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2rem', marginBottom: '0.3rem' }}>
                    <i className="fas fa-users-cog" style={{ color: '#016b40', marginRight: '0.6rem' }}></i>
                    Manage Users
                </h1>
                <p style={{ color: '#4b6b68', marginBottom: '2rem' }}>
                    Assign roles, LGAs, departments, and admin status. Changes save immediately per row.
                </p>

                {loading ? (
                    <p>Loading users...</p>
                ) : (
                    <div style={{ overflowX: 'auto', background: 'white', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#f4f7fc', textAlign: 'left' }}>
                                    <th style={{ padding: '0.8rem' }}>Username</th>
                                    <th style={{ padding: '0.8rem' }}>Full Name</th>
                                    <th style={{ padding: '0.8rem' }}>Phone</th>
                                    <th style={{ padding: '0.8rem' }}>Role</th>
                                    <th style={{ padding: '0.8rem' }}>LGA</th>
                                    <th style={{ padding: '0.8rem' }}>Department</th>
                                    <th style={{ padding: '0.8rem' }}>Admin</th>
                                    <th style={{ padding: '0.8rem' }}>Active</th>
                                    <th style={{ padding: '0.8rem' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} style={{ borderTop: '1px solid #eee' }}>
                                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{u.username}</td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>{u.full_name || <em style={{ color: '#999' }}>none</em>}</td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>{u.phone}</td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>
                                            <select
                                                value={u.role || ''}
                                                onChange={(e) => handleFieldChange(u.id, 'role', e.target.value)}
                                                style={{ padding: '0.3rem', borderRadius: 6, border: '1px solid #ccc' }}
                                            >
                                                {ROLE_OPTIONS.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>
                                            <input
                                                type="text"
                                                value={u.lga || ''}
                                                onChange={(e) => handleFieldChange(u.id, 'lga', e.target.value)}
                                                placeholder="e.g. Ado-Ekiti"
                                                style={{ padding: '0.3rem', borderRadius: 6, border: '1px solid #ccc', width: 120 }}
                                            />
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>
                                            <select
                                                value={u.department_id || ''}
                                                onChange={(e) => handleFieldChange(u.id, 'department_id', e.target.value)}
                                                style={{ padding: '0.3rem', borderRadius: 6, border: '1px solid #ccc' }}
                                            >
                                                <option value="">None</option>
                                                {departments.map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={!!u.is_admin}
                                                onChange={(e) => handleFieldChange(u.id, 'is_admin', e.target.checked)}
                                            />
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={u.is_active !== false}
                                                onChange={(e) => handleFieldChange(u.id, 'is_active', e.target.checked)}
                                            />
                                        </td>
                                        <td style={{ padding: '0.6rem 0.8rem' }}>
                                            <button
                                                onClick={() => handleSave(u.id)}
                                                disabled={savingId === u.id}
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
                                                {savingId === u.id ? 'Saving...' : 'Save'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default ManageUsersPage;