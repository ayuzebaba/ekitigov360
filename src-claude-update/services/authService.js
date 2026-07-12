import { supabase } from './supabase';

export const authService = {
    // Register new user — Phase 1: create auth account and send OTP
    async register({ username, email, phone, password, fullName, role, lga, departmentId }) {
        // 1. Check if username exists
        const { data: existingUser, error: checkError } = await supabase
            .from('digop_users')
            .select('username')
            .eq('username', username)
            .maybeSingle();

        if (checkError) throw checkError;
        if (existingUser) throw new Error('Username already taken');

        // 2. Create auth account. With phone signup, Supabase returns
        // user: null until the phone is confirmed via OTP — this is normal.
        // We store the registration data to complete the profile insert
        // after OTP confirmation in registerConfirmOTP().
        const { data: authData, error: authError } = await supabase.auth.signUp({
            phone: phone,
            password: password
        });

        if (authError) throw authError;

        // Store pending registration data in sessionStorage so
        // registerConfirmOTP() can complete the profile insert after
        // the user confirms their phone number
        sessionStorage.setItem('pendingRegistration', JSON.stringify({
            username, email: email || null, phone,
            fullName, role, lga: lga || null, departmentId: departmentId || null
        }));

        return { phone };
    },

    // Register — Phase 2: confirm OTP and create digop_users profile
    async registerConfirmOTP(phone, token) {
        // Verify the OTP — this confirms the phone and creates the real
        // auth.users row, giving us a valid user ID
        const { data, error } = await supabase.auth.verifyOtp({
            phone,
            token,
            type: 'sms'
        });

        if (error) throw error;
        if (!data.user) throw new Error('OTP verification failed — no user returned');

        // Now we have a real user ID — retrieve the pending registration data
        const pending = JSON.parse(sessionStorage.getItem('pendingRegistration') || '{}');
        sessionStorage.removeItem('pendingRegistration');

        // Insert the profile row via RPC
        const { error: profileError } = await supabase.rpc('register_digop_user', {
            p_id: data.user.id,
            p_username: pending.username,
            p_email: pending.email,
            p_phone: pending.phone,
            p_full_name: pending.fullName,
            p_role: pending.role,
            p_lga: pending.lga,
            p_department_id: pending.departmentId
        });

        if (profileError) throw profileError;

        // Sign out so the user goes through the proper 2FA login flow
        await supabase.auth.signOut();

        return { success: true };
    },

    // STEP 1 of login: verify username/phone + password.
    // This NEVER returns a usable session on its own, and it NEVER falls
    // back to OTP on failure. A wrong password must fail here, full stop.
    async verifyCredentials(identifier, password) {
        // Look up the real phone number behind a username, if a username was entered
        let phone = identifier;
        if (!identifier.match(/^\+?[0-9]{7,15}$/)) {
            // Doesn't look like a phone number — treat as a username and look it up
            const { data: userRow, error: lookupError } = await supabase
                .from('digop_users')
                .select('phone')
                .eq('username', identifier)
                .maybeSingle();

            if (lookupError || !userRow) {
                throw new Error('Invalid username or password');
            }
            phone = userRow.phone;
        }

        // Verify the password against the real Supabase Auth account
        const { data, error } = await supabase.auth.signInWithPassword({
            phone,
            password
        });

        if (error) {
            // Password was wrong — stop here. Do NOT fall through to OTP.
            throw new Error('Invalid username or password');
        }

        // Password is correct, but we deliberately do not treat this as
        // "logged in" yet. Sign out immediately so no real session persists
        // until the OTP step (step 2) is also completed.
        await supabase.auth.signOut();

        return { phone, passwordVerified: true };
    },

    // STEP 2a of login: send the OTP, only ever called after verifyCredentials succeeded
    async sendOTP(phone) {
        const { data, error } = await supabase.auth.signInWithOtp({ phone });
        return { data, error };
    },

    // STEP 2b of login: verify the OTP. Only at this point does a real session exist.
    async verifyOTP(phone, token) {
        const { data, error } = await supabase.auth.verifyOtp({
            phone,
            token,
            type: 'sms'
        });
        return { data, error };
    },

    // Verify OTP during REGISTRATION to confirm the phone number.
    // Uses type: 'sms' same as login OTP — Supabase uses the same
    // verification flow for both signup confirmation and login OTP.
    async verifyRegistrationOTP(phone, token) {
        const { data, error } = await supabase.auth.verifyOtp({
            phone,
            token,
            type: 'sms'
        });
        return { data, error };
    },

    // Get current user profile
    async getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: profile, error } = await supabase
            .from('digop_users')
            .select('*, department:department_id(id, name)')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return user;
        }

        return { ...user, ...profile };
    },

    // Get all users (admin only)
    async getUsers() {
        const { data, error } = await supabase
            .from('digop_users')
            .select('*, department:department_id(id, name)')
            .order('full_name');
        return { data, error };
    },

    // Update user
    async updateUser(id, updates) {
        const { data, error } = await supabase
            .from('digop_users')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        return { data, error };
    },

    // Delete user (soft delete)
    async deleteUser(id) {
        const { error } = await supabase
            .from('digop_users')
            .update({ is_active: false })
            .eq('id', id);
        return { error };
    },

    // Logout
    async logout() {
        const { error } = await supabase.auth.signOut();
        return { error };
    },

    // Check if username exists
    async checkUsername(username) {
        const { data, error } = await supabase
            .from('digop_users')
            .select('username')
            .eq('username', username)
            .single();
        return { exists: !!data, error };
    }
};