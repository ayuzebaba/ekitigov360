import React from 'react';
import { useNavigate } from 'react-router-dom';
//import '../../styles/Footer.css';

const Footer = () => {
    const navigate = useNavigate();

    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-col">
                    <div className="logo-icon" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                        <i className="fas fa-crown"></i>
                    </div>
                    <p>One state. All LGAs. Real-time intelligence.</p>
                </div>

                <div className="footer-col footer-links">
                    <h4>State Executive</h4>
                    <a href="#" onClick={(e) => e.preventDefault()}>Dashboard</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>LGA Reports</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>AI Insights</a>
                </div>

                <div className="footer-col footer-links">
                    <h4>Local Government</h4>
                    <a href="#" onClick={(e) => e.preventDefault()}>Chairman Login</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>Project Submission</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>Budget Workflow</a>
                </div>

                <div className="footer-col footer-links">
                    <h4>Citizens</h4>
                    <a href="#" onClick={(e) => e.preventDefault()}>Track Request</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>Report Issue</a>
                    <a href="#" onClick={(e) => e.preventDefault()}>Transparency Hub</a>
                </div>
            </div>

            <div className="copyright">
                <p>© 2026 Ekiti State Government. All rights reserved. Built for the people of Ekiti State. <i className="fas fa-heart"></i></p>
            </div>
        </footer>
    );
};

export default Footer; 
