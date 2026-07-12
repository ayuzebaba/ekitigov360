import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import '../styles/LoginPage.css';

const ForgotPasswordPage = () => {
    const [step, setStep] = useState('username'); // 'username' | 'otp' | 'newPassword'
    const [username, setUsername] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const handleUsernameSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            const response = await fetch(
                `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/reset-password`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({ action: 'lookup', username }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(`Error: ${data.error}`);
                setLoading(false);
                return;
            }

            const { error: otpError } = await supabase.auth.signInWithOtp({
                phone: data.phone,
            });

            if (otpError) {
                setMessage(`Error: ${otpError.message}`);
                setLoading(false);
                return;
            }

            setPhone(data.phone);
            setMessage(`✓ Code sent to ${data.phone}`);
            setStep('otp');
        } catch (err) {
            setMessage('Error: Network error. Please try again.');
        }
        setLoading(false);
    };

    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const { error } = await supabase.auth.verifyOtp({
            phone,
            token: otp,
            type: 'sms',
        });

        if (error) {
            setMessage(`Error: ${error.message}`);
            setLoading(false);
            return;
        }

        setMessage('✓ Verified! Set your new password.');
        setStep('newPassword');
        setLoading(false);
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        try {
            const response = await fetch(
                `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/reset-password`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({ action: 'update', phone, newPassword }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                setMessage(`Error: ${data.error}`);
                setLoading(false);
                return;
            }

            setMessage('✓ Password updated! Redirecting to login...');
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
                    <h2 className="form-title">
                        {step === 'username' && 'Reset Password'}
                        {step === 'otp' && 'Enter verification code'}
                        {step === 'newPassword' && 'Set new password'}
                    </h2>
                    <p className="form-subtitle">
                        {step === 'username' && 'Enter your username to begin'}
                        {step === 'otp' && `We sent a code to ${phone}`}
                        {step === 'newPassword' && 'Choose a new password'}
                    </p>

                    {step === 'username' && (
                        <form onSubmit={handleUsernameSubmit}>
                            <div className="input-group">
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    required
                                    className="form-input"
                                />
                            </div>
                            <button type="submit" disabled={loading} className="btn-primary btn-block" style={{ marginTop: '1.5rem' }}>
                                {loading ? 'Sending...' : 'Send Code'}
                            </button>
                        </form>
                    )}

                    {step === 'otp' && (
                        <form onSubmit={handleOtpSubmit}>
                            <div className="otp-container">
                                <input
                                    type="text"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder="123456"
                                    maxLength="6"
                                    required
                                    className="otp-input"
                                />
                            </div>
                            <button type="submit" disabled={loading} className="btn-primary btn-block">
                                {loading ? 'Verifying...' : 'Verify Code'}
                            </button>
                        </form>
                    )}

                    {step === 'newPassword' && (
                        <form onSubmit={handlePasswordSubmit}>
                            <div className="input-group">
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="New password (min 6 characters)"
                                    minLength={6}
                                    required
                                    className="form-input"
                                />
                            </div>
                            <button type="submit" disabled={loading} className="btn-primary btn-block" style={{ marginTop: '1.5rem' }}>
                                {loading ? 'Saving...' : 'Update Password'}
                            </button>
                        </form>
                    )}

                    {message && (
                        <div className={`message ${message.includes('Error') ? 'message-error' : 'message-success'}`}>
                            <i className={`fas ${message.includes('Error') ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
                            {message}
                        </div>
                    )}

                    <button type="button" onClick={() => navigate('/login')} className="btn-link">
                        <i className="fas fa-arrow-left"></i> Back to login
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;