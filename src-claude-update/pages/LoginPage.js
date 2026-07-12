import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/LoginPage.css';

const LoginPage = () => {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [phoneForOtp, setPhoneForOtp] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    // Steps: 'login' | 'login-otp' | 'register' | 'register-otp'
    const [step, setStep] = useState('login');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const { login, verifyOTP, register, registerConfirmOTP, devBypass } = useAuth();
    const navigate = useNavigate();

    const [regData, setRegData] = useState({
        username: '', email: '', phone: '', password: '',
        fullName: '', role: 'official', lga: '', departmentId: ''
    });

    // ── LOGIN STEP 1: username/phone + password ──
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            const { phone } = await login(identifier, password);
            setPhoneForOtp(phone);
            setStep('login-otp');
            setMessage('✓ Password verified — OTP sent to your phone!');
        } catch (error) {
            setMessage(`Error: ${error.message}`);
        }
        setLoading(false);
    };

    // ── LOGIN STEP 2: verify OTP ──
    const handleVerifyLoginOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            const { error } = await verifyOTP(phoneForOtp, otp);
            if (error) throw error;
            setMessage('✓ Login successful! Redirecting...');
            setTimeout(() => navigate('/dashboard'), 1500);
        } catch (error) {
            setMessage(`Error: ${error.message}`);
        }
        setLoading(false);
    };

    // ── REGISTER STEP 1: fill in form, signUp creates auth account + sends OTP ──
    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            const { phone } = await register(regData);
            setPhoneForOtp(phone);
            setStep('register-otp');
            setMessage('✓ Account created! Enter the OTP sent to your phone to confirm it.');
        } catch (error) {
            setMessage(`Error: ${error.message}`);
        }
        setLoading(false);
    };

    // ── REGISTER STEP 2: confirm OTP, creates profile row, then go to login ──
    const handleVerifyRegistrationOTP = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            await registerConfirmOTP(phoneForOtp, otp);
            setMessage('✓ Phone confirmed! You can now log in.');
            setOtp('');
            setStep('login');
            setIdentifier(regData.username);
        } catch (error) {
            setMessage(`Error: ${error.message}`);
        }
        setLoading(false);
    };

    const handleDevBypass = async () => {
        await devBypass();
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
                    <p className="app-subtitle">Digital Governance Platform</p>
                </div>

                <div className="form-section">

                    {/* LOGIN: username + password */}
                    {step === 'login' && (
                        <form onSubmit={handleLogin}>
                            <h2 className="form-title">Welcome Back</h2>
                            <p className="form-subtitle">Sign in with your username or phone number</p>
                            <div className="input-group">
                                <i className="fas fa-user input-icon"></i>
                                <input type="text" value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    placeholder="Username or Phone Number" required className="form-input" />
                            </div>
                            <div className="input-group">
                                <i className="fas fa-lock input-icon"></i>
                                <input type={showPassword ? 'text' : 'password'} value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password" required className="form-input" />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="password-toggle">
                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                            <button type="submit" disabled={loading} className="btn-primary btn-block">
                                {loading ? <><i className="fas fa-spinner fa-spin"></i> Verifying...</> : <><i className="fas fa-sign-in-alt"></i> Sign In</>}
                            </button>
                            <div className="auth-links">
                                <button type="button" onClick={() => { setStep('register'); setMessage(''); }} className="btn-link">
                                    <i className="fas fa-user-plus"></i> Create Account
                                </button>
                            </div>
                        </form>
                    )}

                    {/* LOGIN OTP */}
                    {step === 'login-otp' && (
                        <form onSubmit={handleVerifyLoginOTP}>
                            <h2 className="form-title">Two-Factor Verification</h2>
                            <p className="form-subtitle">Enter the 6-digit code sent to your phone</p>
                            <div className="otp-container">
                                <input type="text" value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder="123456" maxLength="6" required className="otp-input" autoFocus />
                            </div>
                            <button type="submit" disabled={loading} className="btn-primary btn-block">
                                {loading ? <><i className="fas fa-spinner fa-spin"></i> Verifying...</> : <><i className="fas fa-check-circle"></i> Verify & Sign In</>}
                            </button>
                            <button type="button" onClick={() => { setStep('login'); setOtp(''); setMessage(''); }} className="btn-link">
                                <i className="fas fa-arrow-left"></i> Back to login
                            </button>
                        </form>
                    )}

                    {/* REGISTER: fill in details */}
                    {step === 'register' && (
                        <form onSubmit={handleRegister}>
                            <h2 className="form-title">Create Account</h2>
                            <p className="form-subtitle">Register for DiGoP</p>
                            <div className="input-group">
                                <i className="fas fa-user input-icon"></i>
                                <input type="text" value={regData.username}
                                    onChange={(e) => setRegData({ ...regData, username: e.target.value })}
                                    placeholder="Username *" required className="form-input" />
                            </div>
                            <div className="input-group">
                                <i className="fas fa-phone input-icon"></i>
                                <input type="tel" value={regData.phone}
                                    onChange={(e) => setRegData({ ...regData, phone: e.target.value })}
                                    placeholder="Phone Number * (e.g. +13068804290)" required className="form-input" />
                            </div>
                            <div className="input-group">
                                <i className="fas fa-envelope input-icon"></i>
                                <input type="email" value={regData.email}
                                    onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                                    placeholder="Email (Optional)" className="form-input" />
                            </div>
                            <div className="input-group">
                                <i className="fas fa-user input-icon"></i>
                                <input type="text" value={regData.fullName}
                                    onChange={(e) => setRegData({ ...regData, fullName: e.target.value })}
                                    placeholder="Full Name *" required className="form-input" />
                            </div>
                            <div className="input-group">
                                <i className="fas fa-lock input-icon"></i>
                                <input type="password" value={regData.password}
                                    onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                                    placeholder="Password *" required className="form-input" />
                            </div>
                            <div className="input-group">
                                <i className="fas fa-user-tag input-icon"></i>
                                <select value={regData.role}
                                    onChange={(e) => setRegData({ ...regData, role: e.target.value })}
                                    className="form-input" required>
                                    <option value="official">Official</option>
                                    <option value="hod">Head of Department</option>
                                    <option value="director">Director</option>
                                    <option value="chairman">Chairman</option>
                                    <option value="commissioner">Commissioner</option>
                                </select>
                            </div>
                            <div className="input-group">
                                <i className="fas fa-map-marker-alt input-icon"></i>
                                <input type="text" value={regData.lga}
                                    onChange={(e) => setRegData({ ...regData, lga: e.target.value })}
                                    placeholder="LGA" className="form-input" />
                            </div>
                            <button type="submit" disabled={loading} className="btn-primary btn-block">
                                {loading ? <><i className="fas fa-spinner fa-spin"></i> Creating Account...</> : <><i className="fas fa-user-plus"></i> Register</>}
                            </button>
                            <button type="button" onClick={() => { setStep('login'); setMessage(''); }} className="btn-link">
                                <i className="fas fa-arrow-left"></i> Back to login
                            </button>
                        </form>
                    )}

                    {/* REGISTER OTP: confirm phone */}
                    {step === 'register-otp' && (
                        <form onSubmit={handleVerifyRegistrationOTP}>
                            <h2 className="form-title">Confirm Your Phone</h2>
                            <p className="form-subtitle">Enter the 6-digit code sent to {phoneForOtp}</p>
                            <div className="otp-container">
                                <input type="text" value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder="123456" maxLength="6" required className="otp-input" autoFocus />
                            </div>
                            <button type="submit" disabled={loading} className="btn-primary btn-block">
                                {loading ? <><i className="fas fa-spinner fa-spin"></i> Confirming...</> : <><i className="fas fa-check-circle"></i> Confirm & Continue</>}
                            </button>
                            <button type="button" onClick={() => { setStep('register'); setOtp(''); setMessage(''); }} className="btn-link">
                                <i className="fas fa-arrow-left"></i> Back to registration
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
                    <span>Secured · End-to-end encrypted · 2FA enabled</span>
                </div>

                <div className="dev-quick-link">
                    <button type="button" onClick={handleDevBypass} className="dev-link">
                        <i className="fas fa-forward"></i>
                        Skip to Dashboard (Dev Only)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;