import os
import cv2
import mediapipe as mp
import pandas as pd
from flask import Flask, request, jsonify

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "motion_outputs"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

mp_pose = mp.solutions.pose


def extract_motion_from_video(video_path, output_csv):
    cap = cv2.VideoCapture(video_path)

    pose = mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )

    data = []
    frame_number = 0

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        frame_number += 1
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb_frame)

        if results.pose_landmarks:
            for landmark_id, lm in enumerate(results.pose_landmarks.landmark):
                data.append([
                    frame_number,
                    landmark_id,
                    lm.x,
                    lm.y,
                    lm.z,
                    lm.visibility
                ])

    cap.release()
    pose.close()

    df = pd.DataFrame(
        data,
        columns=["frame", "landmark_id", "x", "y", "z", "visibility"]
    )
    df.to_csv(output_csv, index=False)


@app.route("/upload-videos", methods=["POST"])
def upload_videos():
    if "video1" not in request.files or "video2" not in request.files:
        return jsonify({"error": "Two videos are required"}), 400

    video1 = request.files["video1"]
    video2 = request.files["video2"]

    video1_path = os.path.join(UPLOAD_FOLDER, "dance_reference.mp4")
    video2_path = os.path.join(UPLOAD_FOLDER, "dance_user.mp4")

    video1.save(video1_path)
    video2.save(video2_path)

    output1 = os.path.join(OUTPUT_FOLDER, "reference_motion.csv")
    output2 = os.path.join(OUTPUT_FOLDER, "user_motion.csv")

    extract_motion_from_video(video1_path, output1)
    extract_motion_from_video(video2_path, output2)

    return jsonify({
        "message": "Motion capture completed",
        "outputs": {
            "reference": output1,
            "user": output2
        }
    })


if __name__ == "__main__":
    app.run(debug=True)
