import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabase';
import { authService } from '../services/authService';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let initialCheckDone = false;

        // Check active session once on mount
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session?.user) {
                const profile = await authService.getCurrentUser();
                setUser(profile || session.user);
            } else {
                setUser(null);
            }
            setLoading(false);
            initialCheckDone = true;
        });

        // Listen for auth changes AFTER the initial mount check.
        // onAuthStateChange fires once immediately with the current session
        // on subscribe — we skip that redundant first fire since
        // getSession() above already handled it, avoiding a duplicate
        // getCurrentUser() call that was triggering lock contention.
        const { data: listener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!initialCheckDone) return; // skip the redundant initial fire
                if (session?.user) {
                    const profile = await authService.getCurrentUser();
                    setUser(profile || session.user);
                } else {
                    setUser(null);
                }
                setLoading(false);
            }
        );

        return () => {
            listener?.subscription.unsubscribe();
        };
    }, []);

    // Register new user — Phase 1
    const register = async (userData) => {
        return await authService.register(userData);
    };

    // Register — Phase 2: confirm OTP and create profile
    const registerConfirmOTP = async (phone, token) => {
        return await authService.registerConfirmOTP(phone, token);
    };

    // STEP 1: verify username/phone + password.
    // Throws on bad credentials — never silently falls back to OTP.
    // On success, sends the OTP and returns the phone number the UI needs
    // for the next step. No session exists yet at this point.
    const login = async (identifier, password) => {
        const { phone } = await authService.verifyCredentials(identifier, password);
        const { error: otpError } = await authService.sendOTP(phone);
        if (otpError) throw otpError;
        return { phone, method: 'otp' };
    };

    // STEP 2: verify the OTP. This is the only point where a real session
    // is created and `user` gets set.
    const verifyOTP = async (phoneNumber, token) => {
        const result = await authService.verifyOTP(phoneNumber, token);
        if (result.data?.user) {
            const profile = await authService.getCurrentUser();
            setUser(profile || result.data.user);
        }
        return result;
    };

    // Sign out
    const signOut = async () => {
        const { error } = await authService.logout();
        if (!error) {
            setUser(null);
            sessionStorage.removeItem('devBypass');
        }
        return { error };
    };

    // Dev bypass (for testing)
    const devBypass = async () => {
        const { data: users } = await supabase
            .from('digop_users')
            .select('*')
            .eq('is_active', true)
            .limit(1);

        if (users && users.length > 0) {
            sessionStorage.setItem('devBypass', 'true');
            const userData = users[0];
            const fakeUser = {
                id: userData.id,
                email: userData.email,
                user_metadata: {
                    full_name: userData.full_name,
                    role: userData.role
                },
                ...userData
            };
            setUser(fakeUser);
        } else {
            const fakeUser = {
                id: 'dev-user-id',
                email: 'dev@digop.gov.ng',
                full_name: 'Developer',
                role: 'admin',
                user_metadata: {
                    full_name: 'Developer',
                    role: 'admin'
                }
            };
            sessionStorage.setItem('devBypass', 'true');
            setUser(fakeUser);
        }
    };

    const value = {
        user,
        setUser,
        loading,
        register,
        registerConfirmOTP,
        login,
        verifyOTP,
        signOut,
        devBypass
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};