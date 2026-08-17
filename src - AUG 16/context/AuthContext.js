import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch the ekiti_users row matching this session's phone number.
    // Supabase Auth stores phone WITHOUT a leading '+', but ekiti_users
    // stores it WITH one — hence the added '+' below.
    const fetchProfile = async (sessionUser) => {
        if (!sessionUser?.phone) {
            setProfile(null);
            return;
        }
        const { data, error } = await supabase
            .from('ekiti_users')
            .select('*')
            .eq('phone', `+${sessionUser.phone}`)
            .single();

        if (error) {
            console.error('Error fetching ekiti_users profile:', error);
            setProfile(null);
        } else {
            setProfile(data);
        }
    };

    useEffect(() => {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            setUser(session?.user ?? null);
            await fetchProfile(session?.user ?? null);
            setLoading(false);
        });

        // IMPORTANT: never call other supabase.* functions synchronously
        // inside onAuthStateChange — it can deadlock, because the callback
        // fires while an internal auth lock is still held (e.g. during
        // verifyOtp), and a nested database call waits on that same lock.
        // Deferring with setTimeout lets the current auth operation finish
        // and release its lock first.
        const { data: listener } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setUser(session?.user ?? null);
                setTimeout(() => {
                    fetchProfile(session?.user ?? null).finally(() => setLoading(false));
                }, 0);
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
        // Profile will be picked up automatically by onAuthStateChange above
        return { data, error };
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        setProfile(null);
        return { error };
    };

    const value = {
        user,
        profile,
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