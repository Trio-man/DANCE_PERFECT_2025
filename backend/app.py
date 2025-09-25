from flask import Flask, request, jsonify
from flask_cors import CORS
import os

# Initialize Flask app and enable CORS
app = Flask(__name__)
CORS(app)

# Ensure 'uploads' directory exists
UPLOAD_DIR = os.path.join(os.getcwd(), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.route('/analyze', methods=['POST'])
def analyze():
    # Get uploaded files
    user_video = request.files.get('userVideo')
    reference_video = request.files.get('referenceVideo')

    if not user_video or not reference_video:
        return jsonify({'error': 'Missing video files'}), 400

    # Save uploaded videos to disk
    user_path = os.path.join(UPLOAD_DIR, user_video.filename)
    ref_path = os.path.join(UPLOAD_DIR, reference_video.filename)
    user_video.save(user_path)
    reference_video.save(ref_path)

    # 🧠 Placeholder for OpenCap integration (replace with real API logic)
    results = {
        "score": 91,
        "feedback": "Great control! Keep your posture consistent in the middle part.",
        "jointAngles": [
            {"userKnee": 45, "referenceKnee": 48},
            {"userKnee": 47, "referenceKnee": 46},
            {"userKnee": 43, "referenceKnee": 45},
            {"userKnee": 49, "referenceKnee": 47},
        ]
    }

    return jsonify(results)

if __name__ == '__main__':
    app.run(debug=True, port=3000)
