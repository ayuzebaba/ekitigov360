import React from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentService } from '../services/departmentService';
import Header from '../components/shared/Header';
import Footer from '../components/shared/Footer';
import '../styles/HomePage.css';

const HomePage = () => {
    const navigate = useNavigate();

    return (
        <div className="home-page">
            <div className="bg-pattern"></div>
            <div className="gradient-orb"></div>
            <div className="gradient-orb-2"></div>

            {/* Use shared Header */}
            <Header />

            {/* Main Content */}
            <main className="container">
                {/* Hero Section */}
                <section className="hero">
                    <div className="hero-content">
                        <h2>
                            One State.<br />
                            <span className="hero-gradient-text">16 LGAs.</span> Real-Time<br />
                            Intelligence.
                        </h2>
                        <p className="hero-description">
                            Unify every local government, every project, and every voice. A single AI-driven platform for transparent, paperless, and predictive governance.
                        </p>
                        <div className="stats-grid">
                            <div className="stat-item">
                                <span className="stat-number">16</span>
                                <span className="stat-label">Local Governments</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-number">247+</span>
                                <span className="stat-label">Active Projects</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-number">₦42B</span>
                                <span className="stat-label">Budget Oversight</span>
                            </div>
                        </div>
                        <div className="button-group">
                            <button
                                className="btn-primary"
                                onClick={() => navigate('/login')}
                            >
                                <i className="fas fa-sign-in-alt"></i> CLICK TO LOGIN
                            </button>
                            <button
                                className="btn-outline"
                                onClick={() => navigate('/register')}
                            >
                                <i className="fas fa-user-plus"></i> REGISTER AS A NEW USER
                            </button>
                        </div>
                        <p className="hero-footer">
                            <i className="fas fa-check-circle"></i> For State Executives, Local Government Chairmen & Citizens.
                        </p>
                    </div>

                    {/* LIVE DASHBOARD CARD */}
                    <div className="hero-visual">
                        <div className="pill-tag-card">
                            <i className="fas fa-microchip"></i> AI-POWERED GOVERNANCE · EKITI STATE
                        </div>
                        <div className="visual-icon-stack">
                            <span className="icon-card"><i className="fas fa-chart-line"></i></span>
                            <span className="icon-card"><i className="fas fa-comments"></i></span>
                            <span className="icon-card"><i className="fas fa-check-double"></i></span>
                        </div>
                        <div className="card-title">LIVE DASHBOARD</div>
                        <div className="card-subtitle">Ado-Ekiti · Ikere · Oye · 13 more</div>
                        <div className="ai-graph-line"></div>
                        <div className="card-stats">
                            <span><span className="stat-highlight">↑ 94%</span> reporting</span>
                            <span><i className="fas fa-circle alert-dot"></i> 12 alerts</span>
                        </div>
                        <div className="card-sentiment">
                            <i className="fas fa-robot"></i> AI Sentiment: <strong>78% positive</strong> feedback on new roads
                        </div>
                    </div>
                </section>

                {/* FEATURES SECTION */}
                <section className="claude-features">
                    <div className="features-header">
                        <div className="section-eyebrow">EIGHT INTELLIGENCE LAYERS.</div>
                        <h3>One command center.</h3>
                    </div>

                    {/* Wide feature card with AI sentiment */}
                    <div className="feature-card-wide">
                        <div>
                            <div className="feature-number">INTELLIGENCE</div>
                            <h4>AI-Powered Sentiment & Predictive Analytics</h4>
                            <p>Continuously monitors citizen feedback, complaints, and social signals. The AI engine surfaces real-time sentiment scores, predicts project risks, forecasts resource needs, and generates evidence-based recommendations — transforming raw data into strategic governance intelligence.</p>
                        </div>
                        <div className="sentiment-dashboard">
                            <h5>LIVE SENTIMENT DASHBOARD</h5>

                            <div className="sentiment-bar">
                                <span className="sentiment-label">Infrastructure</span>
                                <div className="bar-track"><div className="bar-fill" style={{ width: '82%' }}></div></div>
                                <span className="sentiment-percent">82%</span>
                            </div>

                            <div className="sentiment-bar">
                                <span className="sentiment-label">Healthcare</span>
                                <div className="bar-track"><div className="bar-fill" style={{ width: '68%' }}></div></div>
                                <span className="sentiment-percent">68%</span>
                            </div>

                            <div className="sentiment-bar">
                                <span className="sentiment-label">Education</span>
                                <div className="bar-track"><div className="bar-fill" style={{ width: '91%' }}></div></div>
                                <span className="sentiment-percent">91%</span>
                            </div>

                            <div className="sentiment-bar">
                                <span className="sentiment-label">Security</span>
                                <div className="bar-track"><div className="bar-fill" style={{ width: '55%' }}></div></div>
                                <span className="sentiment-percent">55%</span>
                            </div>
                        </div>
                    </div>

                    {/* Regular feature cards grid */}
                    <div className="features-grid">
                        <div className="feature-card">
                            <div className="feature-icon"><i className="fas fa-tachometer-alt"></i></div>
                            <h4>Unified Command Dashboard</h4>
                            <p>Real-time consolidation of project progress, budget burn rates, LGA performance metrics, and MDA activities — giving the Governor and executives a single authoritative view of the entire state.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon"><i className="fas fa-file-contract"></i></div>
                            <h4>Digital Project Approvals & BOQs</h4>
                            <p>Submit, review, and approve projects with attached Bills of Quantities digitally. Threshold-based approval routing ensures proper authorization at every level — no physical paper, no missing files.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon"><i className="fas fa-comments"></i></div>
                            <h4>Secure Inter-Government Channels</h4>
                            <p>Encrypted messaging and broadcast system connecting the Governor, Chairmen, HOA members, and MDA heads. Announcements, directives, and reports flow through verified, logged channels.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon"><i className="fas fa-search-dollar"></i></div>
                            <h4>Monitoring, Evaluation & Audit Trail</h4>
                            <p>Every action — approval, disbursement, submission — generates a tamper-proof audit trail. Abridged reports are automatically available to oversight MDAs and the Office of the Governor.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon"><i className="fas fa-hand-holding-heart"></i></div>
                            <h4>Citizen Portal & Complaint Management</h4>
                            <p>A public-facing portal for complaint submission, service tracking, and performance transparency. AI triages, routes, and escalates citizen issues to the relevant LGA or MDA automatically.</p>
                        </div>

                        <div className="feature-card">
                            <div className="feature-icon"><i className="fas fa-coins"></i></div>
                            <h4>AI Budget Allocation & Prioritization</h4>
                            <p>AI recommends optimal budget distribution across LGAs and projects, factoring in population data, project phase, performance scores, and historical spend — reducing politically driven allocation risk.</p>
                        </div>
                    </div>
                </section>

                {/* Stakeholder Logins */}
                <div className="stakeholder-row">
                    <div className="stakeholder-badge"><i className="fas fa-user-tie"></i> Governor's Office</div>
                    <div className="stakeholder-badge"><i className="fas fa-users"></i> 16 LGA Chairmen</div>
                    <div className="stakeholder-badge"><i className="fas fa-house-user"></i> Ekiti Citizens</div>
                </div>
            </main>

            {/* Use shared Footer */}
            <Footer />
        </div>
    );
};

export default HomePage;