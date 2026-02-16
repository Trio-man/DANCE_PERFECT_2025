def compare_motion_csvs(reference_csv_path, user_csv_path, frame_rate=30):
    import pandas as pd
    import numpy as np
    from scipy.signal import correlate

    ref_df = pd.read_csv(reference_csv_path)
    usr_df = pd.read_csv(user_csv_path)

    needed = {"frame", "landmark_id", "x", "y", "z"}
    if not needed.issubset(ref_df.columns) or not needed.issubset(usr_df.columns):
        return {
            "status": "fail",
            "reason": "invalid_csv",
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "CSV format invalid. Required columns: frame, landmark_id, x, y, z.",
            "feedback": {
                "summary": "We couldn't analyze because the motion CSV format is invalid.",
                "timing": "N/A",
                "body_part_comments": ["Fix CSV columns: frame, landmark_id, x, y, z."],
                "top_errors": []
            }
        }

    ref_frames = set(ref_df["frame"].unique())
    usr_frames = set(usr_df["frame"].unique())
    common_frames = sorted(ref_frames & usr_frames)

    if not common_frames:
        return {
            "status": "fail",
            "reason": "no_common_frames",
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No common frames to compare (pose not detected).",
            "feedback": {
                "summary": "No matching pose frames were detected between the two videos.",
                "timing": "Timing feedback unavailable because there were no comparable frames.",
                "body_part_comments": [
                    "Record with better lighting and keep the full body visible in frame."
                ],
                "top_errors": []
            }
        }

    # -----------------------------
    # Config (tune these if needed)
    # -----------------------------
    # If correlation is too low, treat as different dance and FAIL
    MISMATCH_MIN_CORR = 0.35
    # If mean distance is too big, also treat as mismatch
    MISMATCH_MAX_MEAN_DIST = 0.55
    # Only run mismatch logic if we have enough frames
    MIN_FRAMES_FOR_MISMATCH_CHECK = 60

    GROUPS = {
        "Head/Neck": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "Torso": [11, 12, 23, 24],
        "Left Arm": [11, 13, 15, 17, 19, 21],
        "Right Arm": [12, 14, 16, 18, 20, 22],
        "Left Leg": [23, 25, 27, 29, 31],
        "Right Leg": [24, 26, 28, 30, 32],
    }

    LANDMARK_NAME = {
        0: "Nose",
        11: "Left Shoulder", 12: "Right Shoulder",
        13: "Left Elbow", 14: "Right Elbow",
        15: "Left Wrist", 16: "Right Wrist",
        23: "Left Hip", 24: "Right Hip",
        25: "Left Knee", 26: "Right Knee",
        27: "Left Ankle", 28: "Right Ankle",
        31: "Left Foot", 32: "Right Foot",
    }

    def to_sec(frame):
        return frame / float(frame_rate)

    def severity_label(d):
        if d >= 0.12:
            return "high"
        if d >= 0.07:
            return "medium"
        return "low"

    def direction_phrase(dx, dy):
        # MediaPipe: y increases DOWNWARD on screen
        parts = []
        tx, ty = 0.05, 0.05  # ignore tiny noise

        if abs(dy) >= ty:
            parts.append("lower" if dy > 0 else "higher")
        if abs(dx) >= tx:
            parts.append("more to the right" if dx > 0 else "more to the left")

        if not parts:
            return "slightly off position"
        if len(parts) == 1:
            return parts[0]
        return f"{parts[0]} and {parts[1]}"

    # For timestamped top-errors: store worst moment per landmark
    worst_by_landmark = {}  # lid -> {frame, dist, dx, dy}

    distances_all = []
    group_dists = {k: [] for k in GROUPS.keys()}

    # Compare frame-by-frame
    for frame in common_frames:
        ref_f = ref_df.loc[ref_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        usr_f = usr_df.loc[usr_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        merged = ref_f.merge(usr_f, on="landmark_id", suffixes=("_ref", "_usr"))
        if merged.empty:
            continue

        merged["dx"] = merged["x_usr"] - merged["x_ref"]
        merged["dy"] = merged["y_usr"] - merged["y_ref"]
        merged["dist"] = np.sqrt(
            (merged["dx"]) ** 2 +
            (merged["dy"]) ** 2 +
            (merged["z_usr"] - merged["z_ref"]) ** 2
        )

        distances_all.extend(merged["dist"].tolist())

        # per group
        for gname, lids in GROUPS.items():
            g = merged[merged["landmark_id"].isin(lids)]
            if len(g) > 0:
                group_dists[gname].extend(g["dist"].tolist())

        # worst moment per landmark for timestamped human feedback
        for _, row in merged.iterrows():
            lid = int(row["landmark_id"])
            dist = float(row["dist"])
            if lid not in worst_by_landmark or dist > worst_by_landmark[lid]["dist"]:
                worst_by_landmark[lid] = {
                    "frame": int(frame),
                    "dist": dist,
                    "dx": float(row["dx"]),
                    "dy": float(row["dy"]),
                }

    if len(distances_all) == 0:
        return {
            "status": "fail",
            "reason": "no_distances",
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No comparable landmark rows found in common frames.",
            "feedback": {
                "summary": "We couldn't compute differences because landmarks did not overlap properly.",
                "timing": "N/A",
                "body_part_comments": ["Try keeping the full body visible and avoid occlusions."],
                "top_errors": []
            }
        }

    mean_distance = float(np.mean(distances_all))
    similarity_score = float(np.clip(100 - (mean_distance * 100), 0, 100))

    # -----------------------------
    # MISMATCH CHECK (different dance detector)
    # Uses cross-correlation on multiple key joints (y-signal).
    # If correlation is very low OR mean distance very high -> fail.
    # -----------------------------
    def landmark_series(df, lid, axis="y"):
        s = df[df["landmark_id"] == lid].sort_values("frame")
        if axis == "x":
            return s["x"].to_numpy()
        return s["y"].to_numpy()

    def norm(sig):
        if len(sig) < 10:
            return None
        sig = sig.astype(np.float64)
        sig = sig - np.mean(sig)
        std = np.std(sig)
        if std < 1e-9:
            return None
        return sig / std

    def max_corr(a, b):
        # normalized max cross-correlation
        a = norm(a)
        b = norm(b)
        if a is None or b is None:
            return None
        c = correlate(a, b, mode="full")
        denom = len(a)
        if denom <= 0:
            return None
        return float(np.max(c) / denom)

    corr_landmarks = [16, 15, 28, 27, 24, 23]  # wrists, ankles, hips
    corrs = []
    if len(common_frames) >= MIN_FRAMES_FOR_MISMATCH_CHECK:
        for lid in corr_landmarks:
            r = landmark_series(ref_df, lid, "y")
            u = landmark_series(usr_df, lid, "y")
            mc = max_corr(u, r)
            if mc is not None and not np.isnan(mc):
                corrs.append(mc)

    avg_corr = float(np.mean(corrs)) if len(corrs) else None

    is_mismatch = False
    if avg_corr is not None:
        if avg_corr < MISMATCH_MIN_CORR:
            is_mismatch = True
    # distance-based fallback
    if mean_distance > MISMATCH_MAX_MEAN_DIST:
        is_mismatch = True

    if is_mismatch:
        return {
            "status": "fail",
            "reason": "different_dance",
            "similarity_score": 0.0,
            "mean_landmark_distance": round(mean_distance, 6),
            "frames_compared": len(common_frames),
            "message": "Different dance detected (movement patterns do not match the reference).",
            "feedback": {
                "summary": "Analysis failed because the detected movement patterns do not match the reference choreography.",
                "timing": "Timing comparison is not meaningful when dances do not match.",
                "body_part_comments": [
                    "Make sure you are using the same choreography video as the reference.",
                    "Try trimming both videos so they start at the same beat."
                ],
                "top_errors": [
                    f"Mismatch check: avg correlation = {avg_corr:.2f}" if avg_corr is not None else
                    "Mismatch check: insufficient reliable signal for correlation."
                ]
            }
        }

    # -----------------------------
    # Timing (lead/lag) using right wrist y, fallback right ankle y
    # -----------------------------
    used_lid = 16
    ref_sig = landmark_series(ref_df, used_lid, "y")
    usr_sig = landmark_series(usr_df, used_lid, "y")

    if len(ref_sig) < 10 or len(usr_sig) < 10:
        used_lid = 28
        ref_sig = landmark_series(ref_df, used_lid, "y")
        usr_sig = landmark_series(usr_df, used_lid, "y")

    timing_comment = "Timing feedback unavailable."
    if len(ref_sig) >= 10 and len(usr_sig) >= 10:
        ref0 = ref_sig - np.mean(ref_sig)
        usr0 = usr_sig - np.mean(usr_sig)
        corr = correlate(usr0, ref0, mode="full")
        lag_frames = int(np.argmax(corr) - (len(ref0) - 1))
        lag_seconds = lag_frames / float(frame_rate)

        if lag_frames > 3:
            timing_comment = (
                f"You are BEHIND the choreographer by about {abs(lag_seconds):.2f}s. "
                f"Try starting transitions slightly earlier."
            )
        elif lag_frames < -3:
            timing_comment = (
                f"You are AHEAD of the choreographer by about {abs(lag_seconds):.2f}s. "
                f"Try holding positions slightly longer before switching moves."
            )
        else:
            timing_comment = "Your timing is close to the choreographer."

    # -----------------------------
    # Body part feedback (worst 2 groups)
    # -----------------------------
    group_means = {g: (float(np.mean(v)) if len(v) else 0.0) for g, v in group_dists.items()}
    worst_groups = sorted(group_means.items(), key=lambda x: x[1], reverse=True)[:2]

    body_part_comments = []
    for gname, d in worst_groups:
        sev = severity_label(d)
        if sev == "high":
            body_part_comments.append(f"{gname}: major mismatch. Focus on matching angles and movement path.")
        elif sev == "medium":
            body_part_comments.append(f"{gname}: noticeable mismatch. Tighten control and follow the reference shape.")
        else:
            body_part_comments.append(f"{gname}: minor mismatch. Small refinements will improve accuracy.")

    # -----------------------------
    # Top Errors (timestamp + human friendly)
    # -----------------------------
    worst_sorted = sorted(worst_by_landmark.items(), key=lambda kv: kv[1]["dist"], reverse=True)[:5]
    top_errors = []
    for lid, info in worst_sorted:
        name = LANDMARK_NAME.get(lid, f"Landmark {lid}")
        t = to_sec(info["frame"])
        phrase = direction_phrase(info["dx"], info["dy"])
        top_errors.append(f"At ~{t:.2f}s: {name} is {phrase} than the choreographer.")

    # -----------------------------
    # Summary
    # -----------------------------
    score = round(similarity_score, 2)
    worst_group_name = worst_groups[0][0] if worst_groups else "overall posture"

    if score >= 90:
        summary = f"Excellent match overall. Small differences mainly in {worst_group_name}."
    elif score >= 75:
        summary = f"Good performance with manageable differences. Biggest issues are in {worst_group_name}."
    elif score >= 60:
        summary = f"Fair alignment. Clear differences exist, mostly in {worst_group_name}."
    else:
        summary = f"Needs improvement. Large differences detected, especially in {worst_group_name}."

    used_name = LANDMARK_NAME.get(used_lid, f"landmark {used_lid}")
    if "unavailable" not in timing_comment.lower():
        summary += f" Timing was estimated using {used_name} motion."

    return {
        "status": "success",
        "similarity_score": score,
        "mean_landmark_distance": round(mean_distance, 6),
        "frames_compared": len(common_frames),
        "feedback": {
            "summary": summary,
            "timing": timing_comment,
            "body_part_comments": body_part_comments if body_part_comments else [
                "Overall movement is consistent. Focus on matching key joint positions more precisely."
            ],
            "top_errors": top_errors if top_errors else [
                "No single joint stood out strongly; small differences are spread across joints."
            ]
        }
    }