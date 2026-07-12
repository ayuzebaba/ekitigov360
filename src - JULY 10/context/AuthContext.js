import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

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

    // Step 1: verify username/password against ekiti_users via Edge Function
    const loginWithPassword = async (username, password) => {
        try {
            const response = await fetch(
                `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/login`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({ username, password }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                return { phone: null, error: { message: data.error || 'Login failed.' } };
            }

            return { phone: data.phone, error: null };
        } catch (err) {
            return { phone: null, error: { message: 'Network error. Please try again.' } };
        }
    };

    // Step 2: send OTP to phone number (native Supabase phone auth)
    const sendOTP = async (phoneNumber) => {
        const { data, error } = await supabase.auth.signInWithOtp({
            phone: phoneNumber,
        });
        return { data, error };
    };

    // Step 3: verify OTP code
    const verifyOTP = async (phoneNumber, token) => {
        const { data, error } = await supabase.auth.verifyOtp({
            phone: phoneNumber,
            token: token,
            type: 'sms'
        });
        return { data, error };
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        return { error };
    };

    const value = {
        user,
        loading,
        loginWithPassword,
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