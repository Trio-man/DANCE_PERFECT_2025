# backend.py

# --- Imports: Flask for web server, CORS for cross-origin, Supabase for DB, dotenv for env vars, bcrypt for hashing, os for env access, JWT for tokens ---
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from supabase import create_client
from dotenv import load_dotenv
import bcrypt
import os

# --- Load environment variables from .env file ---
load_dotenv()

# --- Retrieve Supabase credentials from environment variables ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# --- Debug: Print if environment variables are loaded (remove in production) ---
print(f"SUPABASE_URL loaded: {'Yes' if SUPABASE_URL else 'No'}")
print(f"SUPABASE_KEY loaded: {'Yes' if SUPABASE_KEY else 'No'}")

# --- Validate environment variables ---
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables")

# --- Initialize Supabase client for database operations ---
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Create Flask app and enable CORS for frontend-backend communication ---
app = Flask(__name__)
CORS(app)  # Allow frontend calls

# --- Configure JWT ---
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')  # Change this in production!
jwt = JWTManager(app)

# --- Route: Test database connection ---
@app.route('/test-connection')
def test_connection():
    try:
        # Try to fetch one user from the users table
        response = supabase.table("users").select("*").limit(1).execute()
        return jsonify({"data": response.data, "message": "Database connection successful"})
    except Exception as e:
        # Return error if connection fails
        return jsonify({"error": str(e)}), 500

# --- Route: Home page, simple health check ---
@app.route('/')
def home():
    return "DancePerfect backend is running!"

# --- Route: Test login with sample data ---
@app.route('/test-login')
def test_login():
    return """
    <h2>Test Login Endpoints</h2>
    <p>Use these curl commands to test:</p>
    
    <h3>1. Register a new user:</h3>
    <pre>curl -X POST http://localhost:5000/register \\
    -H "Content-Type: application/json" \\
    -d '{"email": "test@example.com", "password": "password123"}'</pre>
    
    <h3>2. Login with the user:</h3>
    <pre>curl -X POST http://localhost:5000/login \\
    -H "Content-Type: application/json" \\
    -d '{"email": "test@example.com", "password": "password123"}'</pre>
    
    <h3>3. Test with wrong password:</h3>
    <pre>curl -X POST http://localhost:5000/login \\
    -H "Content-Type: application/json" \\
    -d '{"email": "test@example.com", "password": "wrongpassword"}'</pre>
    """

# --- Route: User registration endpoint ---
@app.route('/register', methods=['POST'])
def register():
    # Parse JSON data from request
    data = request.get_json()  # Use get_json() instead of .json
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    
    email = data.get("email")
    password = data.get("password")
    
    # Debug: Print received credentials (remove this in production!)
    print(f"Received registration attempt for email: {email}")
    print(f"Password length: {len(password) if password else 0} characters")

    # Validate input
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Check if user already exists in the database
    existing = supabase.table("users").select("*").eq("email", email).execute()
    if existing.data:
        return jsonify({"error": "Email already registered"}), 409

    # Hash the password securely
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    # Insert new user into Supabase users table
    try:
        response = supabase.table("users").insert({
            "email": email,
            "password_hash": password_hash,
            "role": "user"
        }).execute()
        
        return jsonify({"message": "User registered successfully"}), 201
        
    except Exception as e:
        # Return error if insertion fails
        return jsonify({"error": str(e)}), 500

# --- Route: User login endpoint ---
@app.route('/login', methods=['POST'])
def login():
    # Parse JSON data from request
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    
    email = data.get("email")
    password = data.get("password")
    
    # Debug: Print received credentials (remove this in production!)
    print(f"Received login attempt for email: {email}")
    print(f"Password length: {len(password) if password else 0} characters")

    # Validate input
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # Find user in database
    try:
        response = supabase.table("users").select("*").eq("email", email).execute()
        
        if not response.data:
            return jsonify({"error": "Invalid email or password"}), 401
        
        user = response.data[0]
        stored_password_hash = user.get("password_hash")
        
        # Check if password hash exists
        if not stored_password_hash:
            return jsonify({"error": "Invalid email or password"}), 401
        
        # Verify password
        if bcrypt.checkpw(password.encode('utf-8'), stored_password_hash.encode('utf-8')):
            # Password is correct - create JWT token
            access_token = create_access_token(identity=user.get("id"))
            
            # Return user info and token (excluding password hash)
            user_info = {
                "id": user.get("id"),
                "email": user.get("email"),
                "role": user.get("role")
            }
            return jsonify({
                "message": "Login successful", 
                "user": user_info,
                "access_token": access_token
            }), 200
        else:
            return jsonify({"error": "Invalid email or password"}), 401
            
    except Exception as e:
        # Return error if database query fails
        return jsonify({"error": str(e)}), 500

# --- Route: Protected endpoint that requires JWT token ---
@app.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    # Get the current user's ID from the JWT token
    current_user_id = get_jwt_identity()
    
    try:
        # Fetch user data from database
        response = supabase.table("users").select("id, email, role").eq("id", current_user_id).execute()
        
        if not response.data:
            return jsonify({"error": "User not found"}), 404
        
        user = response.data[0]
        return jsonify({
            "message": "Profile retrieved successfully",
            "user": user
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Run the Flask app if this file is executed directly ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

