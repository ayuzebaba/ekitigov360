import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

const VideoCallPage = () => {
    const navigate = useNavigate();
    const [screen, setScreen] = useState("lobby");
    const [roomId, setRoomId] = useState("");
    const [inputRoom, setInputRoom] = useState("");
    const [isHost, setIsHost] = useState(false);
    const [incomingCall, setIncomingCall] = useState(null);
    const [connected, setConnected] = useState(false);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [statusMsg, setStatusMsg] = useState("Waiting for someone to join...");
    const [error, setError] = useState("");
    const [currentUser, setCurrentUser] = useState(null);
    const [showMinutes, setShowMinutes] = useState(false);
    const [discussionPoints, setDiscussionPoints] = useState("");
    const [aiMinutes, setAiMinutes] = useState("");
    const [generatingMinutes, setGeneratingMinutes] = useState("");
    const [savingMinutes, setSavingMinutes] = useState(false);
    const [minutesSaved, setMinutesSaved] = useState(false);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const channelRef = useRef(null);

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUser(user);
        };
        getUser();
    }, []);

    const cleanup = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
    }, []);

    const createCallRecord = async (room) => {
        try {
            const { data: userData } = await supabase.from('profiles').select('full_name').eq('id', currentUser?.id).single();
            await supabase.from('calls').insert([{
                room_id: room,
                caller_id: currentUser?.id,
                caller_name: userData?.full_name || 'Unknown Official',
                status: 'ringing',
                expires_at: new Date(Date.now() + 30000).toISOString()
            }]);
        } catch (error) { console.error('Error creating call record:', error); }
    };

    const updateCallStatus = async (status) => {
        try {
            await supabase.from('calls').update({ status, ended_at: new Date().toISOString() })
                .eq('room_id', roomId).eq('caller_id', currentUser?.id);
        } catch (error) { console.error('Error updating call status:', error); }
    };

    const getMedia = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            return stream;
        } catch (e) {
            setError("Camera/microphone access denied. Please allow access and try again.");
            return null;
        }
    };

    const createPC = (stream, room, host) => {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        pc.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
                setConnected(true);
                setStatusMsg("Connected");
            }
        };
        pc.onicecandidate = (event) => {
            if (event.candidate && channelRef.current) {
                channelRef.current.send({
                    type: "broadcast", event: "ice",
                    payload: { candidate: event.candidate, from: host ? "host" : "guest" },
                });
            }
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
                setConnected(false);
                setStatusMsg("Connection lost...");
            }
        };
        return pc;
    };

    const startCall = async () => {
        if (!inputRoom.trim()) { setError("Please enter a room code."); return; }
        setError("");
        const room = inputRoom.trim().toLowerCase();
        setRoomId(room);
        setIsHost(true);
        const stream = await getMedia();
        if (!stream) return;
        await createCallRecord(room);
        setScreen("waiting");
        const channel = supabase.channel(`call-${room}`, { config: { broadcast: { self: false } } });
        channelRef.current = channel;
        const pc = createPC(stream, room, true);
        channel.on("broadcast", { event: "answer" }, async ({ payload }) => {
            if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
            }
        });
        channel.on("broadcast", { event: "ice" }, async ({ payload }) => {
            if (payload.from === "guest" && payload.candidate) {
                try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { }
            }
        });
        await channel.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                const lobbyChannel = supabase.channel("ekitigov-lobby");
                await lobbyChannel.subscribe();
                await lobbyChannel.send({ type: "broadcast", event: "offer", payload: { offer, roomId: room } });
                await supabase.removeChannel(lobbyChannel);
                setScreen("call");
            }
        });
    };

    useEffect(() => {
        const lobbyChannel = supabase.channel("ekitigov-lobby", { config: { broadcast: { self: false } } });
        lobbyChannel.on("broadcast", { event: "offer" }, ({ payload }) => {
            setIncomingCall({ roomId: payload.roomId, offer: payload.offer });
        });
        lobbyChannel.subscribe();
        return () => { supabase.removeChannel(lobbyChannel); };
    }, []);

    const acceptCall = async () => {
        if (!incomingCall) return;
        const { roomId: room, offer } = incomingCall;
        setIncomingCall(null);
        setRoomId(room);
        setIsHost(false);
        setError("");
        const stream = await getMedia();
        if (!stream) return;
        setScreen("call");
        const channel = supabase.channel(`call-${room}`, { config: { broadcast: { self: false } } });
        channelRef.current = channel;
        const pc = createPC(stream, room, false);
        channel.on("broadcast", { event: "ice" }, async ({ payload }) => {
            if (payload.from === "host" && payload.candidate) {
                try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { }
            }
        });
        await channel.subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await channel.send({ type: "broadcast", event: "answer", payload: { answer } });
            }
        });
    };

    const declineCall = () => setIncomingCall(null);

    const endCall = () => {
        updateCallStatus('ended');
        cleanup();
        setScreen("lobby");
        setConnected(false);
        setRoomId("");
        setInputRoom("");
        setStatusMsg("");
        setShowMinutes(true); // ← show minutes popup after call!!
    };

    const toggleMic = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
            setMicOn(p => !p);
        }
    };

    const toggleCam = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
            setCamOn(p => !p);
        }
    };

    const generateMinutes = async () => {
        if (!discussionPoints.trim()) {
            alert('Please enter the key discussion points first!!');
            return;
        }
        setGeneratingMinutes(true);
        setAiMinutes('');

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1000,
                    messages: [{
                        role: 'user',
                        content: `You are a formal government secretary for Ekiti State Government, Nigeria.

Generate formal meeting minutes based on these discussion points from a video call:

Room Code: ${roomId.toUpperCase()}
Date: ${new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Platform: EkitiGov360 Secure Video Connect

Discussion Points:
${discussionPoints}

Generate formal meeting minutes in this exact structure:
1. MEETING DETAILS (date, platform, room code)
2. SUMMARY OF DISCUSSIONS (formal paragraph)
3. KEY DECISIONS MADE (bullet points)
4. ACTION ITEMS (who does what by when — use "Responsible Officer" if name unknown)
5. NEXT STEPS

Write in formal Nigerian government language. Be concise and professional.`
                    }]
                })
            });

            const data = await response.json();
            const minutes = data.content?.[0]?.text || 'Error generating minutes';
            setAiMinutes(minutes);
        } catch (error) {
            console.error('Error generating minutes:', error);
            setAiMinutes('Error generating minutes. Please try again.');
        } finally {
            setGeneratingMinutes(false);
        }
    };

    const saveMinutes = async () => {
        if (!aiMinutes) return;
        setSavingMinutes(true);
        try {
            await supabase.from('meeting_minutes').insert([{
                room_id: roomId || 'unknown',
                discussion_points: discussionPoints,
                ai_summary: aiMinutes,
                participants: currentUser?.user_metadata?.full_name || 'Government Official',
                created_by: currentUser?.id,
                created_at: new Date().toISOString()
            }]);
            setMinutesSaved(true);
            setTimeout(() => {
                setShowMinutes(false);
                setAiMinutes('');
                setDiscussionPoints('');
                setMinutesSaved(false);
            }, 2000);
        } catch (error) {
            console.error('Error saving minutes:', error);
            alert('Error saving minutes');
        } finally {
            setSavingMinutes(false);
        }
    };

    useEffect(() => {
        if (screen === "call" && localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
    }, [screen]);

    useEffect(() => () => cleanup(), [cleanup]);

    return (
        <div style={{ minHeight: '100vh', background: '#f4f7fc', position: 'relative' }}>
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                backgroundImage: 'radial-gradient(rgba(0,100,80,0.1) 2px, transparent 2px)',
                backgroundSize: '40px 40px', zIndex: -2
            }} />

            <Header />

            <style>{`
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(1,107,64,0.4); }
                    50% { box-shadow: 0 0 0 16px rgba(1,107,64,0); }
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes slideDown {
                    from { opacity: 0; transform: translate(-50%, -20px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* Incoming call banner */}
            {incomingCall && (
                <div style={{
                    position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
                    background: 'white', border: '2px solid #016b40',
                    borderRadius: 20, padding: '24px 32px', zIndex: 100,
                    textAlign: 'center', minWidth: 300,
                    boxShadow: '0 20px 60px rgba(1,107,64,0.2)',
                    animation: 'slideDown 0.3s ease'
                }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: '#016b40', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px', fontSize: 28,
                        animation: 'pulse 1.5s infinite'
                    }}>📞</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#001f1a', marginBottom: 4 }}>
                        Incoming Government Call
                    </div>
                    <div style={{ fontSize: 13, color: '#016b40', marginBottom: 20, letterSpacing: 1 }}>
                        Room: {incomingCall.roomId.toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={acceptCall} style={{
                            flex: 1, padding: '12px', background: '#016b40',
                            border: 'none', borderRadius: 12, color: 'white',
                            fontWeight: 700, fontSize: 14, cursor: 'pointer'
                        }}>✓ Accept</button>
                        <button onClick={declineCall} style={{
                            flex: 1, padding: '12px', background: 'white',
                            border: '1.5px solid #c62828', borderRadius: 12,
                            color: '#c62828', fontWeight: 700, fontSize: 14, cursor: 'pointer'
                        }}>✕ Decline</button>
                    </div>
                </div>
            )}

            <main style={{ padding: '2rem 5%', maxWidth: 1000, margin: '0 auto' }}>

                {/* Page title */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h1 style={{
                        fontFamily: 'Outfit, sans-serif', fontSize: '2rem',
                        fontWeight: 700, color: '#001f1a', marginBottom: '0.3rem'
                    }}>
                        <i className="fas fa-video" style={{ color: '#016b40', marginRight: '0.8rem' }}></i>
                        Video Connect
                    </h1>
                    <p style={{ color: '#4b6b68' }}>
                        Secure peer-to-peer government meetings · No time limit · Fully encrypted
                    </p>
                </div>

                {/* LOBBY */}
                {screen === 'lobby' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        {/* Start call card */}
                        <div style={{
                            background: 'white', border: '1px solid black',
                            borderRadius: 24, padding: '2rem',
                            boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{ fontSize: 11, color: '#016b40', letterSpacing: 2, marginBottom: 16, fontWeight: 700 }}>
                                START A NEW CALL
                            </div>
                            <input
                                type="text"
                                placeholder="Enter a room code (e.g. EKITI-01)"
                                value={inputRoom}
                                onChange={e => { setInputRoom(e.target.value); setError(''); }}
                                onKeyDown={e => e.key === 'Enter' && startCall()}
                                style={{
                                    width: '100%', padding: '0.9rem 1rem',
                                    border: '1.5px solid rgba(0,0,0,0.2)',
                                    borderRadius: 12, fontSize: '0.95rem',
                                    fontFamily: 'Inter, sans-serif',
                                    marginBottom: 12, boxSizing: 'border-box', outline: 'none'
                                }}
                            />
                            {error && (
                                <div style={{ color: '#c62828', fontSize: 13, marginBottom: 10 }}>
                                    ⚠ {error}
                                </div>
                            )}
                            <button onClick={startCall} style={{
                                width: '100%', padding: '0.9rem',
                                background: '#016b40', border: 'none',
                                borderRadius: 40, color: 'white',
                                fontSize: '0.95rem', fontWeight: 700,
                                cursor: 'pointer', fontFamily: 'Inter, sans-serif'
                            }}>
                                <i className="fas fa-video"></i> Start Call
                            </button>

                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                margin: '20px 0', color: '#4b6b68', fontSize: 12
                            }}>
                                <div style={{ flex: 1, height: 1, background: '#e0e8e4' }} />
                                <span>or join</span>
                                <div style={{ flex: 1, height: 1, background: '#e0e8e4' }} />
                            </div>

                            <p style={{ textAlign: 'center', fontSize: 13, color: '#4b6b68', margin: '0 0 16px' }}>
                                Share your room code with the other official.<br />
                                They will see an incoming call notification.
                            </p>

                            <button onClick={() => navigate('/dashboard')} style={{
                                width: '100%', padding: '0.8rem',
                                background: 'transparent', border: '1.5px solid rgba(0,0,0,0.15)',
                                borderRadius: 40, color: '#4b6b68',
                                fontSize: '0.9rem', cursor: 'pointer',
                                fontFamily: 'Inter, sans-serif'
                            }}>
                                ← Back to Dashboard
                            </button>
                        </div>

                        {/* Info card */}
                        <div style={{
                            background: 'linear-gradient(145deg, #1e3a5f, #0a1f3a)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 24, padding: '2rem', color: 'white'
                        }}>
                            <div style={{ fontSize: 11, color: '#ffd700', letterSpacing: 2, marginBottom: 16, fontWeight: 700 }}>
                                EKITIGOV360 VIDEO CONNECT
                            </div>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1rem' }}>
                                Secure Government Meetings
                            </h3>
                            {[
                                { icon: '🔒', text: 'End-to-end encrypted peer-to-peer' },
                                { icon: '⏰', text: 'No time limit — meet as long as needed' },
                                { icon: '🤖', text: 'AI-generated meeting minutes' },
                                { icon: '💾', text: 'Minutes saved to government records' },
                                { icon: '📱', text: 'Works on any device with a browser' },
                                { icon: '🇳🇬', text: 'Built for Ekiti State Government' },
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{item.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* WAITING */}
                {screen === 'waiting' && (
                    <div style={{
                        background: 'white', border: '1px solid black',
                        borderRadius: 24, padding: '3rem',
                        textAlign: 'center', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{
                            width: 80, height: 80, borderRadius: '50%',
                            border: '3px solid #e0f2ec',
                            borderTop: '3px solid #016b40',
                            animation: 'spin 1.5s linear infinite',
                            margin: '0 auto 24px',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 32
                        }}>⏳</div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#001f1a', marginBottom: 8 }}>
                            Waiting for someone to join
                        </h2>
                        <div style={{ fontSize: 13, color: '#016b40', letterSpacing: 2, marginBottom: 24, fontWeight: 600 }}>
                            ROOM: {roomId.toUpperCase()}
                        </div>
                        <div style={{
                            background: '#f4f7fc', borderRadius: 12,
                            padding: '1rem', marginBottom: 24, fontSize: 14, color: '#4b6b68'
                        }}>
                            Share this room code with the official you want to meet with
                        </div>
                        <button onClick={() => { cleanup(); setScreen('lobby'); setRoomId(''); }} style={{
                            padding: '0.8rem 2rem', background: 'transparent',
                            border: '1.5px solid rgba(0,0,0,0.2)', borderRadius: 40,
                            color: '#4b6b68', fontSize: '0.9rem', cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif'
                        }}>
                            Cancel Call
                        </button>
                    </div>
                )}

                {/* CALL SCREEN */}
                {screen === 'call' && (
                    <div>
                        <div style={{
                            position: 'relative', width: '100%',
                            borderRadius: 20, overflow: 'hidden',
                            background: '#050a07', border: '1px solid rgba(1,107,64,0.3)',
                            aspectRatio: '16/9', marginBottom: 16
                        }}>
                            <video ref={remoteVideoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} autoPlay playsInline />

                            {!connected && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', justifyContent: 'center', color: '#4b6b68'
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
                                    <div style={{ fontSize: 14 }}>
                                        {isHost ? "Waiting for the other official to join..." : "Connecting..."}
                                    </div>
                                </div>
                            )}

                            <video ref={localVideoRef} style={{
                                position: 'absolute', bottom: 16, right: 16,
                                width: 180, borderRadius: 12,
                                border: '2px solid #016b40',
                                objectFit: 'cover', aspectRatio: '4/3',
                                background: '#0a1510',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                            }} autoPlay playsInline muted />

                            <div style={{
                                position: 'absolute', top: 16, left: 16,
                                background: 'rgba(1,107,64,0.9)', borderRadius: 8,
                                padding: '6px 12px', fontSize: 12, color: 'white',
                                fontWeight: 600, letterSpacing: 1
                            }}>
                                🔒 {roomId.toUpperCase()}
                            </div>

                            <div style={{
                                position: 'absolute', top: 16, right: 16,
                                display: 'flex', alignItems: 'center', gap: 6,
                                background: 'rgba(0,0,0,0.6)', borderRadius: 8,
                                padding: '6px 12px', fontSize: 12, color: 'white'
                            }}>
                                <div style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: connected ? '#22c55e' : '#f59e0b',
                                    boxShadow: connected ? '0 0 6px #22c55e' : '0 0 6px #f59e0b'
                                }} />
                                {connected ? "Live" : "Connecting"}
                            </div>
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                            <button onClick={toggleMic} title={micOn ? "Mute" : "Unmute"} style={{
                                width: 52, height: 52, borderRadius: '50%',
                                border: micOn ? '1.5px solid rgba(0,0,0,0.2)' : '1.5px solid #c62828',
                                background: micOn ? 'white' : 'rgba(198,40,40,0.1)',
                                fontSize: 20, cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center'
                            }}>{micOn ? "🎤" : "🔇"}</button>

                            <button onClick={toggleCam} title={camOn ? "Stop Camera" : "Start Camera"} style={{
                                width: 52, height: 52, borderRadius: '50%',
                                border: camOn ? '1.5px solid rgba(0,0,0,0.2)' : '1.5px solid #c62828',
                                background: camOn ? 'white' : 'rgba(198,40,40,0.1)',
                                fontSize: 20, cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center'
                            }}>{camOn ? "📷" : "🚫"}</button>

                            <button onClick={endCall} title="End Call" style={{
                                width: 52, height: 52, borderRadius: '50%',
                                border: 'none', background: '#c62828',
                                color: 'white', fontSize: 20, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>📵</button>
                        </div>

                        {!connected && (
                            <div style={{ textAlign: 'center' }}>
                                <span style={{
                                    display: 'inline-block', padding: '10px 20px',
                                    background: 'white', border: '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: 20, fontSize: 13, color: '#4b6b68'
                                }}>{statusMsg}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* AI MEETING MINUTES MODAL */}
                {showMinutes && (
                    <div style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', zIndex: 200,
                        padding: 20
                    }}>
                        <div style={{
                            background: 'white', borderRadius: 24,
                            padding: '2rem', width: '100%', maxWidth: 640,
                            maxHeight: '90vh', overflowY: 'auto',
                            animation: 'fadeIn 0.3s ease',
                            boxShadow: '0 30px 60px rgba(0,0,0,0.3)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div>
                                    <div style={{ fontSize: 11, color: '#016b40', letterSpacing: 2, marginBottom: 4, fontWeight: 700 }}>
                                        AI MEETING MINUTES
                                    </div>
                                    <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#001f1a' }}>
                                        Generate Meeting Minutes
                                    </h2>
                                </div>
                                <button onClick={() => setShowMinutes(false)} style={{
                                    background: '#f4f7fc', border: 'none',
                                    borderRadius: '50%', width: 36, height: 36,
                                    cursor: 'pointer', fontSize: 16, color: '#4b6b68'
                                }}>✕</button>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: 13, fontWeight: 600, color: '#001f1a', display: 'block', marginBottom: 8 }}>
                                    What was discussed in this meeting?
                                </label>
                                <textarea
                                    value={discussionPoints}
                                    onChange={e => setDiscussionPoints(e.target.value)}
                                    placeholder="e.g. Discussed the road construction delay in Ward 5, agreed to release additional ₦2M funding, Chairman to provide weekly progress reports..."
                                    rows={5}
                                    style={{
                                        width: '100%', padding: '0.9rem',
                                        border: '1.5px solid rgba(0,0,0,0.2)',
                                        borderRadius: 12, fontSize: '0.9rem',
                                        fontFamily: 'Inter, sans-serif',
                                        resize: 'vertical', boxSizing: 'border-box',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <button onClick={generateMinutes} disabled={generatingMinutes} style={{
                                width: '100%', padding: '0.9rem',
                                background: generatingMinutes ? '#4b6b68' : '#016b40',
                                border: 'none', borderRadius: 40, color: 'white',
                                fontSize: '0.95rem', fontWeight: 700,
                                cursor: generatingMinutes ? 'not-allowed' : 'pointer',
                                marginBottom: '1rem', fontFamily: 'Inter, sans-serif'
                            }}>
                                {generatingMinutes
                                    ? '🤖 Generating formal minutes...'
                                    : '🤖 Generate AI Meeting Minutes'}
                            </button>

                            {aiMinutes && (
                                <div>
                                    <div style={{
                                        background: '#f4f7fc', borderRadius: 12,
                                        padding: '1.2rem', marginBottom: '1rem',
                                        border: '1px solid rgba(1,107,64,0.2)'
                                    }}>
                                        <div style={{ fontSize: 11, color: '#016b40', letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>
                                            GENERATED MINUTES
                                        </div>
                                        <pre style={{
                                            whiteSpace: 'pre-wrap', fontFamily: 'Inter, sans-serif',
                                            fontSize: 13, color: '#1e2f4a', lineHeight: 1.6, margin: 0
                                        }}>
                                            {aiMinutes}
                                        </pre>
                                    </div>

                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button onClick={saveMinutes} disabled={savingMinutes || minutesSaved} style={{
                                            flex: 1, padding: '0.9rem',
                                            background: minutesSaved ? '#016b40' : '#1e3a5f',
                                            border: 'none', borderRadius: 40, color: 'white',
                                            fontSize: '0.9rem', fontWeight: 700,
                                            cursor: 'pointer', fontFamily: 'Inter, sans-serif'
                                        }}>
                                            {minutesSaved ? '✅ Minutes Saved!!' : savingMinutes ? 'Saving...' : '💾 Save to Government Records'}
                                        </button>
                                        <button onClick={() => {
                                            navigator.clipboard.writeText(aiMinutes);
                                            alert('Minutes copied to clipboard!!');
                                        }} style={{
                                            padding: '0.9rem 1.5rem',
                                            background: 'transparent',
                                            border: '1.5px solid #016b40',
                                            borderRadius: 40, color: '#016b40',
                                            fontSize: '0.9rem', fontWeight: 600,
                                            cursor: 'pointer', fontFamily: 'Inter, sans-serif'
                                        }}>
                                            📋 Copy
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default VideoCallPage;