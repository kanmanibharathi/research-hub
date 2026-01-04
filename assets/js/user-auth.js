/**
 * User Authentication and Modal Handler
 */

document.addEventListener('DOMContentLoaded', function () {
    const userBtn = document.getElementById('user-menu-toggle');
    const userDropdown = document.getElementById('user-dropdown');
    const loginModal = document.getElementById('login-modal');
    const signupModal = document.getElementById('signup-modal');
    const loginLink = document.getElementById('show-login');
    const signupLink = document.getElementById('show-signup');
    const closeBtns = document.querySelectorAll('.close-modal');
    const switchLogin = document.getElementById('switch-to-login');
    const switchSignup = document.getElementById('switch-to-signup');

    // Toggle Dropdown
    if (userBtn) {
        userBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            userDropdown.classList.toggle('active');
        });
    }

    // Close dropdown on outside click
    window.addEventListener('click', function () {
        if (userDropdown && userDropdown.classList.contains('active')) {
            userDropdown.classList.remove('active');
        }
    });

    // Prevent closing when clicking inside dropdown
    if (userDropdown) {
        userDropdown.addEventListener('click', function (e) {
            e.stopPropagation();
        });
    }

    // Show Login Modal
    if (loginLink) {
        loginLink.addEventListener('click', function (e) {
            e.preventDefault();
            userDropdown.classList.remove('active');
            loginModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    // Show Signup Modal
    if (signupLink) {
        signupLink.addEventListener('click', function (e) {
            e.preventDefault();
            userDropdown.classList.remove('active');
            signupModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    // Close Modals
    closeBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            loginModal.classList.remove('active');
            signupModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        });
    });

    // Close on overlay click
    [loginModal, signupModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                }
            });
        }
    });

    // Switch between modals
    const switchToLogin = (e) => {
        if (e) e.preventDefault();
        signupModal.classList.remove('active');
        if (forgotModal) forgotModal.classList.remove('active');
        loginModal.classList.add('active');
    };

    if (switchLogin) switchLogin.addEventListener('click', switchToLogin);

    const backLinks = document.querySelectorAll('.switch-to-login');
    backLinks.forEach(link => link.addEventListener('click', switchToLogin));

    if (switchSignup) {
        switchSignup.addEventListener('click', function (e) {
            e.preventDefault();
            loginModal.classList.remove('active');
            signupModal.classList.add('active');
        });
    }

    const API_URL = 'http://localhost:5000/api';

    // Form Submissions
    const loginForm = document.querySelector('#login-modal .auth-form');
    const signupForm = document.querySelector('#signup-modal .auth-form');

    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = this.querySelector('input[type="email"]').value;
            const password = this.querySelector('input[type="password"]').value;

            try {
                const response = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();
                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    alert('Login successful!');
                    window.location.reload();
                } else {
                    alert(data.message || 'Login failed');
                }
            } catch (err) {
                console.error(err);
                alert('Server error. Make sure the backend is running.');
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const inputs = this.querySelectorAll('input');
            const name = inputs[0].value;
            const email = inputs[1].value;
            const password = inputs[2].value;
            const confirmPassword = inputs[3].value;

            if (password !== confirmPassword) {
                alert('Passwords do not match');
                return;
            }

            try {
                const response = await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });

                const data = await response.json();
                if (response.ok) {
                    alert('Registration successful! Please login.');
                    signupModal.classList.remove('active');
                    loginModal.classList.add('active');
                } else {
                    alert(data.message || 'Registration failed');
                }
            } catch (err) {
                console.error(err);
                alert('Server error. Make sure the backend is running.');
            }
        });
    }

    // Forgot Password Modal Logic
    const forgotModal = document.getElementById('forgot-modal');
    const forgotLink = document.getElementById('show-forgot');

    if (forgotLink) {
        forgotLink.addEventListener('click', function (e) {
            e.preventDefault();
            loginModal.classList.remove('active');
            forgotModal.classList.add('active');
        });
    }

    const forgotForm = document.querySelector('#forgot-modal .auth-form');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = this.querySelector('input[type="email"]').value;

            try {
                const response = await fetch(`${API_URL}/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();
                alert(data.message);
                if (response.ok) {
                    forgotModal.classList.remove('active');
                    loginModal.classList.add('active');
                }
            } catch (err) {
                console.error(err);
                alert('Server error.');
            }
        });
    }

    // Check Login State on Load
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    if (token && user) {
        const profileBtn = document.getElementById('user-menu-toggle');
        if (profileBtn) {
            const firstLetter = user.name.trim().charAt(0).toUpperCase();
            profileBtn.innerHTML = `<span style="color: #fff; font-weight: 700; font-size: 18px;">${firstLetter}</span>`;
            profileBtn.classList.add('logged-in');

            // Add Newsletter 'N' Icon if Admin
            if (user.isAdmin) {
                const navItem = profileBtn.parentElement;
                navItem.style.display = 'flex';
                navItem.style.alignItems = 'center';
                navItem.style.gap = '8px';

                // Create the 'N' icon
                const nIcon = document.createElement('a');
                nIcon.href = 'admin-newsletter.html';
                nIcon.id = 'admin-n-badge';
                nIcon.title = 'Newsletter Dashboard';
                nIcon.innerHTML = 'N';
                nIcon.style.cssText = `
                    color: #d63384;
                    font-size: 18px;
                    font-weight: 800;
                    text-decoration: none;
                    transition: all 0.3s;
                    line-height: 1;
                    display: flex;
                    align-items: center;
                `;
                nIcon.onmouseover = () => {
                    nIcon.style.transform = 'scale(1.2)';
                    nIcon.style.color = '#fff';
                };
                nIcon.onmouseout = () => {
                    nIcon.style.transform = 'scale(1)';
                    nIcon.style.color = '#d63384';
                };

                // Insert before the dropdown
                navItem.insertBefore(nIcon, document.getElementById('user-dropdown'));
            }
        }

        if (userDropdown) {
            let dropdownContent = ``;
            if (user.isAdmin) {
                dropdownContent += `<a href="admin-newsletter.html" style="color: #d63384 !important;">Admin Dashboard</a>`;
            }
            dropdownContent += `<a href="javascript:void(0)" id="logout-btn">Logout</a>`;

            userDropdown.innerHTML = dropdownContent;

            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', function () {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.reload();
                });
            }
        }
    }
});
