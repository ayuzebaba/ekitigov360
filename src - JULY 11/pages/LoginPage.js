import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/LoginPage.css';

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState('credentials'); // 'credentials' | 'otp'
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const { loginWithPassword, sendOTP, verifyOTP } = useAuth();
    const navigate = useNavigate();

    // Step 1: verify username/password, then trigger OTP send
    const handleCredentialsSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const { phone: userPhone, error: loginError } = await loginWithPassword(username, password);

        if (loginError) {
            setMessage(`Error: ${loginError.message}`);
            setLoading(false);
            return;
        }

        const { error: otpError } = await sendOTP(userPhone);

        if (otpError) {
            setMessage(`Error: ${otpError.message}`);
        } else {
            setPhone(userPhone);
            setMessage('✓ Code sent! Check your phone.');
            setStep('otp');
        }
        setLoading(false);
    };

    // Step 2: verify OTP
    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        const { error } = await verifyOTP(phone, otp);

        if (error) {
            setMessage(`Error: ${error.message}`);
        } else {
            setMessage('✓ Login successful! Redirecting...');
            setTimeout(() => navigate('/dashboard'), 1500);
        }
        setLoading(false);
    };

    // ✅ Dev bypass handler — remove in production
    const handleDevBypass = () => {
        sessionStorage.setItem('devBypass', 'true');
        navigate('/dashboard');
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
                        {step === 'credentials' ? 'Welcome back, Official' : 'Enter verification code'}
                    </h2>
                    <p className="form-subtitle">
                        {step === 'credentials'
                            ? 'Sign in with your username and password'
                            : `We sent a 6-digit code to ${phone}`}
                    </p>

                    {step === 'credentials' ? (
                        <form onSubmit={handleCredentialsSubmit}>
                            <div className="input-group">
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    required
                                    className="form-input"
                                    style={{ marginBottom: '1rem' }}
                                />
                            </div>
                            <div className="input-group">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    required
                                    className="form-input"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary btn-block"
                                style={{ marginTop: '1.5rem' }}
                            >
                                {loading ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i>
                                        Checking...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-sign-in-alt"></i>
                                        Login
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => navigate('/forgot-password')}
                                className="btn-link"
                            >
                                Forgot password?
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleVerifyOTP}>
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
                            <p className="input-hint">
                                Enter the 6-digit code sent to your phone
                            </p>

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary btn-block"
                            >
                                {loading ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i>
                                        Verifying...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-check-circle"></i>
                                        Verify & Sign In
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setStep('credentials');
                                    setMessage('');
                                    setOtp('');
                                }}
                                className="btn-link"
                            >
                                <i className="fas fa-arrow-left"></i>
                                Back to login
                            </button>
                        </form>
                    )}

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

                <div className="dev-quick-link">
                    <button
                        type="button"
                        onClick={handleDevBypass}
                        className="dev-link"
                    >
                        <i className="fas fa-forward"></i>
                        Skip to Dashboard (Dev Only)
                    </button>
                </div>

            </div>
        </div>
    );
};

export default LoginPage;