import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'users.db')

def make_admin(email):
    if not os.path.exists(DB_PATH):
        print("Database not found. Please register a user first.")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET is_admin = 1 WHERE email = ?', (email,))
    if cursor.rowcount > 0:
        print(f"Successfully promoted {email} to Admin.")
        conn.commit()
    else:
        print(f"User with email {email} not found.")
    conn.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        make_admin(sys.argv[1])
    else:
        print("Usage: py make_admin.py user@email.com")
