from flask import Flask
from flask_cors import CORS
from routes.upload_routes import upload_bp

app = Flask(__name__)
CORS(app)

app.register_blueprint(upload_bp, url_prefix='/api')

if __name__ == '__main__':
    print("Flask app starting...")
    app.run(debug=True, port=3000)
