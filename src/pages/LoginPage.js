import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/LoginPage.css';

const LoginPage = () => {
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState('phone');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const { sendOTP, verifyOTP } = useAuth();
    const navigate = useNavigate();

    const handleSendOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+' + formattedPhone;
        }

        const { error } = await sendOTP(formattedPhone);

        if (error) {
            setMessage(`Error: ${error.message}`);
        } else {
            setMessage('✓ Code sent! Check your phone.');
            setStep('otp');
        }
        setLoading(false);
    };

    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        let formattedPhone = phone.trim();
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+' + formattedPhone;
        }

        const { error } = await verifyOTP(formattedPhone, otp);

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

                {/* Logo Section */}
                <div className="logo-section">
                    <div className="logo-icon-large">
                        <i className="fas fa-crown"></i>
                    </div>
                    <h1 className="app-title">EKITIGOV360</h1>
                    <p className="app-subtitle">COMMAND CENTER</p>
                </div>

                {/* Form Section */}
                <div className="form-section">
                    <h2 className="form-title">
                        {step === 'phone' ? 'Welcome back, Official' : 'Enter verification code'}
                    </h2>
                    <p className="form-subtitle">
                        {step === 'phone'
                            ? 'Sign in with your phone number'
                            : `We sent a 6-digit code to ${phone}`}
                    </p>

                    {step === 'phone' ? (
                        <form onSubmit={handleSendOTP}>
                            <div className="input-group">
                                <i className="fas fa-phone-alt input-icon"></i>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+2348012345678"
                                    required
                                    className="form-input"
                                />
                            </div>
                            <p className="input-hint">
                                Include country code (e.g., +234 for Nigeria)
                            </p>

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary btn-block"
                            >
                                {loading ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i>
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-paper-plane"></i>
                                        Send Code
                                    </>
                                )}
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
                                    setStep('phone');
                                    setMessage('');
                                    setOtp('');
                                }}
                                className="btn-link"
                            >
                                <i className="fas fa-arrow-left"></i>
                                Use different number
                            </button>
                        </form>
                    )}

                    {/* Success / Error Message */}
                    {message && (
                        <div className={`message ${message.includes('Error') ? 'message-error' : 'message-success'}`}>
                            <i className={`fas ${message.includes('Error') ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
                            {message}
                        </div>
                    )}
                </div>

                {/* Security Badge */}
                <div className="security-badge">
                    <i className="fas fa-shield-alt"></i>
                    <span>Secured by Twilio · End-to-end encrypted</span>
                </div>

                {/* ✅ DEV BYPASS — remove entire block before going to production */}
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