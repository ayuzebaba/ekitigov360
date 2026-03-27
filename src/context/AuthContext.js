import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active sessions
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: listener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                setUser(session?.user ?? null);
                setLoading(false);
            }
        );

        return () => {
            listener?.subscription.unsubscribe();
        };
    }, []);

    // Send OTP to phone number
    const sendOTP = async (phoneNumber) => {
        const { data, error } = await supabase.auth.signInWithOtp({
            phone: phoneNumber,
        });
        return { data, error };
    };

    // Verify OTP code
    const verifyOTP = async (phoneNumber, token) => {
        const { data, error } = await supabase.auth.verifyOtp({
            phone: phoneNumber,
            token: token,
            type: 'sms'
        });
        return { data, error };
    };

    // Sign out
    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        return { error };
    };

    const value = {
        user,
        loading,
        sendOTP,
        verifyOTP,
        signOut
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}; 
