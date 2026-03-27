import React, { useState, useEffect } from 'react';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';

// ─────────────────────────────────────────────────────────────
// DATA — replace with Supabase/API calls in future
// ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const LGAS = [
    { name: 'Ado-Ekiti', pop: 308100, score: [52, 54, 56, 58, 61, 63, 60, 58, 57, 60, 63, 65] },
    { name: 'Ikere', pop: 157800, score: [44, 46, 48, 50, 53, 55, 52, 50, 49, 52, 55, 57] },
    { name: 'Efon', pop: 98700, score: [38, 40, 42, 44, 47, 49, 46, 44, 43, 46, 49, 51] },
    { name: 'Ekiti East', pop: 112300, score: [41, 43, 45, 47, 50, 52, 49, 47, 46, 49, 52, 54] },
    { name: 'Ekiti South West', pop: 87600, score: [46, 48, 50, 52, 55, 57, 54, 52, 51, 54, 57, 59] },
    { name: 'Ekiti West', pop: 103400, score: [39, 41, 43, 45, 48, 50, 47, 45, 44, 47, 50, 52] },
    { name: 'Emure', pop: 76500, score: [35, 37, 39, 41, 44, 46, 43, 41, 40, 43, 46, 48] },
    { name: 'Gbonyin', pop: 94200, score: [42, 44, 46, 48, 51, 53, 50, 48, 47, 50, 53, 55] },
    { name: 'Ido/Osi', pop: 89100, score: [40, 42, 44, 46, 49, 51, 48, 46, 45, 48, 51, 53] },
    { name: 'Ijero', pop: 118700, score: [48, 50, 52, 54, 57, 59, 56, 54, 53, 56, 59, 61] },
    { name: 'Ikole', pop: 143200, score: [45, 47, 49, 51, 54, 56, 53, 51, 50, 53, 56, 58] },
    { name: 'Ilejemeje', pop: 54300, score: [33, 35, 37, 39, 42, 44, 41, 39, 38, 41, 44, 46] },
    { name: 'Irepodun/Ifelodun', pop: 126800, score: [47, 49, 51, 53, 56, 58, 55, 53, 52, 55, 58, 60] },
    { name: 'Ise/Orun', pop: 108900, score: [43, 45, 47, 49, 52, 54, 51, 49, 48, 51, 54, 56] },
    { name: 'Moba', pop: 121600, score: [49, 51, 53, 55, 58, 60, 57, 55, 54, 57, 60, 62] },
    { name: 'Oye', pop: 134500, score: [46, 48, 50, 52, 55, 57, 54, 52, 51, 54, 57, 59] },
];

const TOPICS = [
    { key: 'security', label: 'Security', color: '#e63946', data: [42, 44, 43, 45, 48, 50, 47, 45, 46, 49, 52, 54] },
    { key: 'healthcare', label: 'Healthcare', color: '#0087b4', data: [55, 57, 56, 58, 61, 63, 60, 58, 59, 62, 65, 67] },
    { key: 'education', label: 'Education', color: '#b8860b', data: [60, 62, 61, 63, 66, 68, 65, 63, 64, 67, 70, 72] },
    { key: 'infrastructure', label: 'Infrastructure', color: '#016b40', data: [38, 40, 39, 41, 44, 46, 43, 41, 42, 45, 48, 50] },
];

const LGA_COLORS = [
    '#016b40', '#0087b4', '#e63946', '#b8860b', '#8b5cf6', '#06b6d4',
    '#f97316', '#22c55e', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1',
    '#84cc16', '#ef4444', '#0ea5e9', '#a855f7'
];

// ─────────────────────────────────────────────────────────────
// SMOOTH LINE CHART
// ─────────────────────────────────────────────────────────────
const LineChart = ({ datasets, height, showDots = true, showLabels = false }) => {
    const allVals = datasets.flatMap(d => d.data);
    const max = Math.max(...allVals) + 6;
    const min = Math.min(...allVals) - 6;
    const W = 500;
    const H = height;
    const padL = 8; const padR = 8; const padT = 10; const padB = 10;
    const toY = v => padT + ((max - v) / (max - min)) * (H - padT - padB);
    const toX = i => padL + (i / 11) * (W - padL - padR);

    const smoothPath = data => {
        const pts = data.map((v, i) => ({ x: toX(i), y: toY(v) }));
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const cp1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 3;
            const cp1y = pts[i - 1].y;
            const cp2x = pts[i].x - (pts[i].x - pts[i - 1].x) / 3;
            const cp2y = pts[i].y;
            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pts[i].x} ${pts[i].y}`;
        }
        return d;
    };

    return (
        <div style={{ width: '100%' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
                {[35, 45, 55, 65].map(v => (
                    <line key={v} x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)}
                        stroke="#e0e8e4" strokeWidth="1" strokeDasharray="6,4" />
                ))}
                {datasets.map((d, di) => (
                    <path key={`fill-${di}`}
                        d={`${smoothPath(d.data)} L ${toX(11)} ${H} L ${toX(0)} ${H} Z`}
                        fill={d.color} opacity="0.07" />
                ))}
                {datasets.map((d, di) => (
                    <path key={di} d={smoothPath(d.data)}
                        fill="none" stroke={d.color}
                        strokeWidth={d.width ?? 2.5}
                        strokeLinejoin="round" strokeLinecap="round" />
                ))}
                {showDots && datasets.map((d, di) =>
                    d.data.map((v, i) => (
                        <circle key={`${di}-${i}`} cx={toX(i)} cy={toY(v)}
                            r="5" fill={d.color} />
                    ))
                )}
            </svg>
            {showLabels && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    {MONTHS.map(m => (
                        <span key={m} style={{ fontSize: 10, color: '#4b6b68', fontWeight: 500 }}>{m}</span>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// ANIMATED BAR
// ─────────────────────────────────────────────────────────────
const AnimatedBar = ({ value, color, barHeight = 10 }) => {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(value), 150);
        return () => clearTimeout(t);
    }, [value]);
    return (
        <div style={{ background: '#e0f2ec', borderRadius: 99, height: barHeight, overflow: 'hidden' }}>
            <div style={{
                width: `${width}%`, background: color, height: '100%',
                borderRadius: 99, transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
            }} />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// SHARED STYLES
// ─────────────────────────────────────────────────────────────
const blackCard = {
    background: 'white',
    border: '1px solid black',
    borderRadius: 20,
    padding: '1.4rem',
    boxShadow: '0 10px 30px -10px rgba(0,0,0,0.08)',
};

const greenCard = {
    background: 'white',
    border: '1px solid rgba(1,107,64,0.2)',
    borderRadius: 20,
    padding: '1.4rem',
    boxShadow: '0 10px 30px -10px rgba(1,107,64,0.1)',
};

const sectionTitle = {
    fontSize: 11, color: '#016b40', letterSpacing: 2,
    marginBottom: 14, fontWeight: 700, textTransform: 'uppercase',
};

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const EkitiSentimentDashboard = () => {
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedLGA, setSelectedLGA] = useState(null);

    const stateAvg = MONTHS.map((_, i) =>
        Math.round(LGAS.reduce((s, l) => s + l.score[i], 0) / LGAS.length)
    );

    // ── OVERVIEW TAB ─────────────────────────────────────────
    const OverviewTab = () => (
        <>
            {/* 4 KPI cards — black border */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
                {[
                    { label: 'HIGHEST SENTIMENT', name: 'Ado-Ekiti', value: 65, color: '#016b40', sub: 'State capital' },
                    { label: 'LOWEST SENTIMENT', name: 'Ilejemeje', value: 46, color: '#e63946', sub: 'Needs attention' },
                    { label: 'MOST IMPROVED', name: 'Ado-Ekiti', value: '+13pts', color: '#b8860b', sub: 'Jan to Dec' },
                    { label: 'CITIZENS SURVEYED', name: null, value: '16,000', color: '#0087b4', sub: '1,000 per LGA' },
                ].map((k, i) => (
                    <div key={i} style={blackCard}>
                        <div style={{ fontSize: 10, color: '#4b6b68', letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>{k.label}</div>
                        {k.name && <div style={{ fontSize: 15, fontWeight: 700, color: k.color, marginBottom: 2 }}>{k.name}</div>}
                        <div style={{ fontSize: 30, fontWeight: 800, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
                        <div style={{ fontSize: 11, color: '#4b6b68', marginTop: 4 }}>{k.sub}</div>
                    </div>
                ))}
            </div>

            {/* Trend + Topics — black border */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={blackCard}>
                    <div style={sectionTitle}>STATE SENTIMENT TREND — 12 MONTHS</div>
                    <LineChart
                        datasets={[{ data: stateAvg, color: '#016b40', width: 3 }]}
                        height={180} showDots showLabels />
                </div>
                <div style={blackCard}>
                    <div style={sectionTitle}>TOP TOPICS — DEC 2025</div>
                    {TOPICS.map(t => (
                        <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <span style={{ fontSize: 12, color: '#2d4f4c', width: 100, fontWeight: 500 }}>{t.label}</span>
                            <div style={{ flex: 1 }}>
                                <AnimatedBar value={t.data[11]} color={t.color} barHeight={12} />
                            </div>
                            <span style={{ color: t.color, fontSize: 14, width: 28, fontWeight: 800 }}>{t.data[11]}</span>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );

    // ── ALL LGAs TAB ─────────────────────────────────────────
    const LGAsTab = () => {
        const datasets = LGAS.map((l, i) => ({
            data: l.score,
            color: LGA_COLORS[i],
            width: selectedLGA === null || selectedLGA === i ? 2.2 : 0.6,
        }));

        return (
            <div style={greenCard}>
                <div style={sectionTitle}>ALL 16 LGAs — CLICK TO HIGHLIGHT</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                    {LGAS.map((l, i) => (
                        <button key={i} onClick={() => setSelectedLGA(selectedLGA === i ? null : i)}
                            style={{
                                background: `${LGA_COLORS[i]}18`,
                                border: `1px solid ${LGA_COLORS[i]}88`,
                                borderRadius: 50, padding: '3px 10px',
                                fontSize: 10, color: LGA_COLORS[i],
                                cursor: 'pointer', fontWeight: 600,
                                opacity: selectedLGA === null || selectedLGA === i ? 1 : 0.4,
                            }}>
                            {l.name}
                        </button>
                    ))}
                </div>
                <LineChart datasets={datasets} height={240} showDots={false} showLabels />
            </div>
        );
    };

    // ── BY TOPIC TAB ─────────────────────────────────────────
    const TopicsTab = () => (
        <>
            <div style={{ ...greenCard, marginBottom: 14 }}>
                <div style={sectionTitle}>SENTIMENT BY TOPIC — 12-MONTH TREND</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                    {TOPICS.map(t => (
                        <span key={t.key} style={{ fontSize: 11, color: '#4b6b68', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                            <span style={{ display: 'inline-block', width: 24, height: 3, borderRadius: 99, background: t.color }} />
                            {t.label}
                        </span>
                    ))}
                </div>
                <LineChart
                    datasets={TOPICS.map(t => ({ data: t.data, color: t.color, width: 2.2 }))}
                    height={220} showDots showLabels />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {TOPICS.map(t => (
                    <div key={t.key} style={{
                        background: 'white',
                        border: `1.5px solid ${t.color}44`,
                        borderLeft: `4px solid ${t.color}`,
                        borderRadius: 16, padding: '1.2rem',
                        boxShadow: `0 4px 16px ${t.color}15`,
                    }}>
                        <div style={{ fontSize: 10, color: '#4b6b68', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
                            {t.label.toUpperCase()}
                        </div>
                        {[['Jan', t.data[0]], ['Peak', Math.max(...t.data)], ['Low', Math.min(...t.data)], ['Dec', t.data[11]]].map(([lbl, val]) => (
                            <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4b6b68', marginBottom: 4 }}>
                                <span>{lbl}</span>
                                <span style={{ color: t.color, fontWeight: 800 }}>{val}</span>
                            </div>
                        ))}
                        <div style={{ fontSize: 20, fontWeight: 900, color: t.color, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.color}33` }}>
                            +{t.data[11] - t.data[0]}pts <span style={{ fontSize: 11, fontWeight: 600 }}>YTD</span>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );

    // ── RANKING TAB ───────────────────────────────────────────
    const RankingTab = () => {
        const sorted = [...LGAS]
            .map(l => ({ ...l, dec: l.score[11], change: l.score[11] - l.score[0] }))
            .sort((a, b) => b.dec - a.dec);
        return (
            <div style={greenCard}>
                <div style={sectionTitle}>LGA SENTIMENT RANKING — DECEMBER 2025</div>
                {sorted.map((l, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                    const barColor = i < 4 ? '#016b40' : i < 9 ? '#0087b4' : '#e63946';
                    return (
                        <div key={l.name} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderBottom: '1px solid #f0f4f2', borderRadius: 8,
                        }}>
                            <span style={{ color: '#4b6b68', fontSize: 13, width: 28, textAlign: 'right', fontWeight: 600 }}>
                                {medal || `#${i + 1}`}
                            </span>
                            <span style={{ color: '#001f1a', fontSize: 13, flex: 1, fontWeight: 500 }}>{l.name}</span>
                            <span style={{ color: '#4b6b68', fontSize: 11, width: 70 }}>Pop: {(l.pop / 1000).toFixed(0)}K</span>
                            <div style={{ width: 90, background: '#e0f2ec', borderRadius: 99, height: 8 }}>
                                <div style={{ width: `${l.dec}%`, background: barColor, height: '100%', borderRadius: 99 }} />
                            </div>
                            <span style={{ color: barColor, fontSize: 14, width: 28, fontWeight: 800 }}>{l.dec}</span>
                            <span style={{ color: l.change >= 0 ? '#016b40' : '#e63946', fontSize: 11, width: 44, textAlign: 'right', fontWeight: 600 }}>
                                {l.change >= 0 ? '+' : ''}{l.change}pts
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };

    // ── RENDER ────────────────────────────────────────────────
    const tabs = [
        { id: 'overview', label: 'OVERVIEW' },
        { id: 'lgas', label: 'ALL 16 LGAs' },
        { id: 'topics', label: 'BY TOPIC' },
        { id: 'ranking', label: 'LGA RANKING' },
    ];

    return (
        <div style={{ background: '#f4f7fc', minHeight: '100vh' }}>

            {/* Existing EkitiGov360 header */}
            <Header />

            {/* Page title strip */}
            <div style={{
                background: 'white',
                borderBottom: '3px solid #016b40',
                padding: '1rem 5%',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                boxShadow: '0 4px 20px -8px rgba(1,107,64,0.15)',
            }}>
                <div>
                    <div style={{ fontSize: 10, color: '#4b6b68', letterSpacing: 3, marginBottom: 4, fontWeight: 600 }}>
                        EKITI STATE GOVERNMENT · CITIZEN SENTIMENT INTELLIGENCE
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#001f1a' }}>
                        Citizen Sentiment Dashboard
                    </div>
                    <div style={{ fontSize: 11, color: '#4b6b68', marginTop: 2 }}>
                        All 16 LGAs · Last 12 months · 16,000 citizens surveyed
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#4b6b68', letterSpacing: 2, marginBottom: 2, fontWeight: 600 }}>STATE SENTIMENT INDEX</div>
                    <div style={{ fontSize: 44, fontWeight: 800, color: '#016b40', lineHeight: 1 }}>56.4</div>
                    <div style={{ fontSize: 12, color: '#4b6b68', marginTop: 2 }}>
                        /100 · <span style={{ color: '#016b40', fontWeight: 700 }}>▲ +13pts vs Jan 2025</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 5%', background: 'white', borderBottom: '1px solid #e0e8e4' }}>
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '12px 20px', fontSize: 11, letterSpacing: 2,
                        color: activeTab === t.id ? '#016b40' : '#4b6b68',
                        borderBottom: activeTab === t.id ? '2px solid #016b40' : '2px solid transparent',
                        fontWeight: activeTab === t.id ? 700 : 600,
                        fontFamily: 'inherit', marginBottom: -1, transition: 'all 0.2s',
                    }}>{t.label}</button>
                ))}
            </div>

            {/* Tab content */}
            <div style={{ padding: '1.5rem 5%' }}>
                {activeTab === 'overview' && <OverviewTab />}
                {activeTab === 'lgas' && <LGAsTab />}
                {activeTab === 'topics' && <TopicsTab />}
                {activeTab === 'ranking' && <RankingTab />}
            </div>

            {/* Existing EkitiGov360 footer */}
            <Footer />
        </div>
    );
};

export default EkitiSentimentDashboard;