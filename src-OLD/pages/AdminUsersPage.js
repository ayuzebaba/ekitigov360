import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/AdminUsersPage.css';

const AdminUsersPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        if (user.role !== 'admin') {
            navigate('/dashboard');
            return;
        }
        fetchUsers();
    }, [user]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await authService.getUsers();
            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
            alert('Error loading users');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Deactivate this user?')) {
            try {
                const { error } = await authService.deleteUser(id);
                if (error) throw error;
                alert('User deactivated successfully');
                fetchUsers();
            } catch (error) {
                console.error('Error deleting user:', error);
                alert('Error deleting user');
            }
        }
    };

    return (
        <div className="admin-users-page">
            <Header />
            <main className="admin-users-main">
                <div className="container">
                    <h1>User Management</h1>
                    <div className="users-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Full Name</th>
                                    <th>Role</th>
                                    <th>LGA</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td>{u.username}</td>
                                        <td>{u.full_name}</td>
                                        <td>{u.role}</td>
                                        <td>{u.lga || '—'}</td>
                                        <td>{u.is_active ? '✅ Active' : '❌ Inactive'}</td>
                                        <td>
                                            <button onClick={() => handleDelete(u.id)} className="btn-danger">
                                                Deactivate
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default AdminUsersPage;