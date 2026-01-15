import os
import re
import io

dir_path = r'e:\Research Hub\Edu Meeting Free Website Template - Free-CSS.com\Website\modules\design-gen\pages'

auth_css_link = u'<link rel="stylesheet" href="../css/auth.css">'
user_auth_script = u'<script src="../../../assets/js/user-auth.js"></script>'

# The full auth modal block
auth_modals = u'''
    <div class="auth-modal" id="login-modal">
        <div class="auth-modal-content">
            <span class="close-modal">&times;</span>
            <h2 style="color: #1f272b; margin-bottom: 30px;">Login</h2>
            <form class="auth-form">
                <input type="email" placeholder="Email Address" required>
                <input type="password" placeholder="Password" required>
                <button type="submit">Login</button>
            </form>
            <div class="auth-links">
                <p>Don't have an account? <a href="javascript:void(0)" id="switch-to-signup">Sign Up</a></p>
                <p><a href="javascript:void(0)" id="show-forgot"
                        style="font-size: 13px; color: #00a651; display: block; margin-top: 10px;">Forgot Password?</a>
                </p>
            </div>
        </div>
    </div>

    <div class="auth-modal" id="signup-modal">
        <div class="auth-modal-content">
            <span class="close-modal">&times;</span>
            <h2 style="color: #1f272b; margin-bottom: 30px;">Sign Up</h2>
            <form class="auth-form">
                <input type="text" placeholder="Full Name" required>
                <input type="email" placeholder="Email Address" required>
                <input type="password" placeholder="Password" required>
                <input type="password" placeholder="Confirm Password" required>
                <button type="submit">Create Account</button>
            </form>
            <div class="auth-links">
                <p>Already have an account? <a href="javascript:void(0)" id="switch-to-login">Login</a></p>
            </div>
        </div>
    </div>

    <div class="auth-modal" id="forgot-modal">
        <div class="auth-modal-content">
            <span class="close-modal">&times;</span>
            <h2 style="color: #1f272b; margin-bottom: 30px;">Reset Password</h2>
            <p style="color: #666; margin-bottom: 20px; font-size: 14px;">Enter your email and we'll send you
                instructions to reset your password.</p>
            <form class="auth-form">
                <input type="email" placeholder="Email Address" required>
                <button type="submit">Send Reset Link</button>
            </form>
            <div class="auth-links">
                <p>Back to <a href="javascript:void(0)" class="switch-to-login">Login</a></p>
            </div>
        </div>
    </div>
'''

updated_files = []

for filename in os.listdir(dir_path):
    if filename.endswith('.html'):
        filepath = os.path.join(dir_path, filename)
        try:
            with io.open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            
            # 1. Ensure auth.css is in <head>
            if 'auth.css' not in content:
                content = content.replace('</head>', auth_css_link + '\n</head>')
            
            # 2. Ensure user-auth.js is included
            if 'user-auth.js' not in content:
                # Add it before the main app script or before </body>
                if '</body>' in content:
                    content = content.replace('</body>', user_auth_script + '\n</body>')
            else:
                # Ensure path is correct
                content = re.sub(r'src=["\']\.\./\.\./assets/js/user-auth\.js["\']', 'src="../../../assets/js/user-auth.js"', content)

            # 3. Ensure modals are present
            if 'login-modal' not in content:
                # Inject before the first script tag at the bottom or before <footer>
                if '<footer' in content:
                    content = content.replace('<footer', auth_modals + '\n<footer')
                elif '</body>' in content:
                    content = content.replace('</body>', auth_modals + '\n</body>')

            # 4. Fix Header/Nav if it's the old <nav> or missing parallel header
            if '<header class="header-main">' not in content:
                # This part is trickier since titles vary.
                # Try to extract title from existing header or h1
                title_match = re.search(r'<h1>(.*?)</h1>', content, re.DOTALL)
                subtitle_match = re.search(r'<p class="subtitle[^"]*">(.*?)</p>', content, re.DOTALL)
                if not subtitle_match:
                    subtitle_match = re.search(r'<p class="text-dim">(.*?)</p>', content, re.DOTALL)
                
                if title_match:
                    title = title_match.group(1).strip()
                    subtitle = subtitle_match.group(1).strip() if subtitle_match else ""
                    
                    new_header = u'''<header class="header-main">
            <div class="back-button-container">
                <a href="../doe.html" class="back-btn"
                    style="text-decoration: none; color: var(--text); border: 1px solid var(--border); display: flex; align-items: center; gap: 8px; font-weight: 600; padding: 0.5rem 1rem; border-radius: 8px; background: rgba(255,255,255,0.05); transition: all 0.3s;">
                    <i class="fas fa-arrow-left"></i> Back
                </a>
            </div>

            <div class="header-content">
                <h1>''' + title + u'''</h1>
                <p class="subtitle">''' + subtitle + u'''</p>
            </div>

            <div class="user-profile-container">
                <!-- User Profile -->
                <div class="user-profile">
                    <button id="user-menu-toggle" title="User Menu">
                        <i class="fa fa-user"></i>
                    </button>
                    <div class="user-dropdown" id="user-dropdown">
                        <a href="javascript:void(0)" id="show-login">Login</a>
                        <a href="javascript:void(0)" id="show-signup">Sign Up</a>
                    </div>
                </div>
            </div>
        </header>'''
                    
                    # Replace old nav/header
                    if 'nav-container-main' in content:
                        content = re.sub(r'<div class="nav-container-main">.*?</header>', new_header, content, flags=re.DOTALL)
                    elif '<nav>' in content:
                        # For files like squarelattice that used <nav>
                        content = re.sub(r'<nav>.*?</nav>\s*<header>.*?</header>', new_header, content, flags=re.DOTALL)
                    else:
                        # Fallback: replace just header if nav not found
                        content = re.sub(r'<header>.*?</header>', new_header, content, flags=re.DOTALL)

            if content != original_content:
                with io.open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                updated_files.append(filename)
                
        except Exception as e:
            print("Error processing " + filename + ": " + str(e))

print("Normalized count: " + str(len(updated_files)))
print("Files: " + ", ".join(updated_files))
