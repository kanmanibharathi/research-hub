from flask import Flask, request, jsonify, session
from flask_cors import CORS
import sqlite3
import bcrypt
import jwt
import datetime
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_super_secret_key_change_this'
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'users.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Add newsletters table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS newsletters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({'message': 'Missing required fields'}), 400

    hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    try:
        conn = get_db_connection()
        conn.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', (name, email, hashed_pw))
        conn.commit()
        conn.close()
        return jsonify({'message': 'User registered successfully'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'message': 'Email already exists'}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'message': 'Missing email or password'}), 400

    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()

    if user and bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        token = jwt.encode({
            'user_id': user['id'],
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, app.config['SECRET_KEY'], algorithm='HS256')
        
        return jsonify({
            'message': 'Login successful',
            'token': token,
            'user': {
                'id': user['id'],
                'name': user['name'],
                'email': user['email'],
                'isAdmin': bool(user['is_admin'])
            }
        })
    
    return jsonify({'message': 'Invalid credentials'}), 401

# --- Admin Newsletter Endpoints ---

@app.route('/api/admin/users', methods=['GET'])
def get_users_count():
    conn = get_db_connection()
    result = conn.execute('SELECT COUNT(*) as count FROM users').fetchone()
    conn.close()
    return jsonify({'count': result['count']})

@app.route('/api/admin/send-newsletter', methods=['POST'])
def send_newsletter():
    data = request.json
    subject = data.get('subject')
    content = data.get('content')
    
    if not subject or not content:
        return jsonify({'message': 'Missing fields'}), 400

    conn = get_db_connection()
    # Log newsletter in DB
    conn.execute('INSERT INTO newsletters (subject, content) VALUES (?, ?)', (subject, content))
    # Fetch all emails
    users = conn.execute('SELECT email FROM users').fetchall()
    conn.close()

    emails = [u['email'] for u in users]
    
    # Simulate sending emails
    print(f"DEBUG: Sending Newsletter '{subject}' to: {emails}")
    
    return jsonify({
        'message': f'Newsletter sent successfully to {len(emails)} users!',
        'count': len(emails)
    })

@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    data = request.json
    email = data.get('email')
    
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()

    if user:
        # In a real app, you would send an email with a reset link
        return jsonify({'message': 'Password reset instructions sent to your email (Simulated)'})
    
    return jsonify({'message': 'Email not found'}), 404

@app.route('/api/reset-password', methods=['POST'])
def reset_password():
    data = request.json
    email = data.get('email')
    new_password = data.get('password')
    
    if not email or not new_password:
        return jsonify({'message': 'Missing fields'}), 400

    hashed_pw = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    conn = get_db_connection()
    conn.execute('UPDATE users SET password = ? WHERE email = ?', (hashed_pw, email))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Password updated successfully'})

if __name__ == '__main__':
    init_db()
    app.run(port=5000, debug=True)
