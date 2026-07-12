import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/LoginPage.css';

const RegisterPage = () => {
    const [form, setForm] = useState({ username: '', password: '', phone: '' });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        let formattedPhone = form.phone.trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+' + formattedPhone;
        }

        try {
            const response = await fetch(
                `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/register`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({ ...form, phone: formattedPhone }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(`Error: ${data.error || 'Registration failed.'}`);
                setLoading(false);
                return;
            }

            setMessage('✓ Registration successful! Redirecting to login...');
            setTimeout(() => navigate('/login'), 1500);
        } catch (err) {
            setMessage('Error: Network error. Please try again.');
        }
        setLoading(false);
    };

    return (
        <div className="login-container">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            <div className="login-card">
                <div className="logo-section">
                    <div className="logo-icon-large">
                        <i className="fas fa-crown"></i>
                    </div>
                    <h1 className="app-title">DiGoP</h1>
                    <p className="app-subtitle">COMMAND CENTER</p>
                </div>

                <div className="form-section">
                    <h2 className="form-title">Create Account</h2>
                    <p className="form-subtitle">Register to access the platform</p>

                    <form onSubmit={handleSubmit}>
                        <div className="input-group">
                            <input
                                type="text"
                                name="username"
                                value={form.username}
                                onChange={handleChange}
                                placeholder="Username"
                                required
                                className="form-input"
                                style={{ marginBottom: '1rem' }}
                            />
                        </div>
                        <div className="input-group">
                            <input
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                placeholder="Password (min 6 characters)"
                                required
                                minLength={6}
                                className="form-input"
                                style={{ marginBottom: '1rem' }}
                            />
                        </div>
                        <div className="input-group">
                            <input
                                type="tel"
                                name="phone"
                                value={form.phone}
                                onChange={handleChange}
                                placeholder="+2348012345678"
                                required
                                className="form-input"
                            />
                        </div>
                        <p className="input-hint">Include country code</p>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary btn-block"
                        >
                            {loading ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i>
                                    Registering...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-user-plus"></i>
                                    Register
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/login')}
                            className="btn-link"
                        >
                            <i className="fas fa-arrow-left"></i>
                            Already have an account? Login
                        </button>
                    </form>

                    {message && (
                        <div className={`message ${message.includes('Error') ? 'message-error' : 'message-success'}`}>
                            <i className={`fas ${message.includes('Error') ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
                            {message}
                        </div>
                    )}
                </div>

                <div className="security-badge">
                    <i className="fas fa-shield-alt"></i>
                    <span>Secured by Twilio · End-to-end encrypted</span>
                </div>
            </div>
        </div>
    );
};

export default RegisterPage;