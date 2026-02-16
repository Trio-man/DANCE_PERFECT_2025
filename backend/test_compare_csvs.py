def compare_motion_csvs(reference_csv_path, user_csv_path, frame_rate=30):
    ref_df = pd.read_csv(reference_csv_path)
    user_df = pd.read_csv(user_csv_path)

    # Basic validation
    needed_cols = {"frame", "landmark_id", "x", "y", "z"}
    if not needed_cols.issubset(ref_df.columns) or not needed_cols.issubset(user_df.columns):
        return {
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "CSV format invalid. Required columns: frame, landmark_id, x, y, z.",
            "feedback": {
                "summary": "We couldn't analyze because the motion CSV format is invalid.",
                "timing": "N/A",
                "body_part_comments": ["Ensure your motion CSV includes frame, landmark_id, x, y, z."],
                "top_errors": []
            }
        }

    # Find common frames
    ref_frames = set(ref_df["frame"].unique())
    user_frames = set(user_df["frame"].unique())
    common_frames = sorted(ref_frames & user_frames)

    if not common_frames:
        return {
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No common frames to compare (check that both videos had pose detections).",
            "feedback": {
                "summary": "No matching pose frames were detected between the two videos.",
                "timing": "Timing feedback unavailable because there were no comparable frames.",
                "body_part_comments": [
                    "Try recording with better lighting and keep the full body visible in frame."
                ],
                "top_errors": []
            }
        }

    # Landmark group definitions (MediaPipe Pose 33 landmarks)
    GROUPS = {
        "Head/Neck": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "Torso": [11, 12, 23, 24],
        "Left Arm": [11, 13, 15, 17, 19, 21],
        "Right Arm": [12, 14, 16, 18, 20, 22],
        "Left Leg": [23, 25, 27, 29, 31],
        "Right Leg": [24, 26, 28, 30, 32],
    }

    # Friendly names for common key landmarks (for top error text)
    LANDMARK_NAME = {
        11: "Left Shoulder", 12: "Right Shoulder",
        13: "Left Elbow", 14: "Right Elbow",
        15: "Left Wrist", 16: "Right Wrist",
        23: "Left Hip", 24: "Right Hip",
        25: "Left Knee", 26: "Right Knee",
        27: "Left Ankle", 28: "Right Ankle",
        0: "Nose",
    }

    # Accumulators
    distances_all = []
    group_dists = {k: [] for k in GROUPS.keys()}
    landmark_dists = {i: [] for i in range(33)}

    # Compare frame-by-frame
    for frame in common_frames:
        ref_f = ref_df.loc[ref_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        usr_f = user_df.loc[user_df["frame"] == frame, ["landmark_id", "x", "y", "z"]]
        merged = ref_f.merge(usr_f, on="landmark_id", suffixes=("_ref", "_usr"))

        if merged.empty:
            continue

        merged["dist"] = np.sqrt(
            (merged["x_ref"] - merged["x_usr"]) ** 2 +
            (merged["y_ref"] - merged["y_usr"]) ** 2 +
            (merged["z_ref"] - merged["z_usr"]) ** 2
        )

        distances_all.extend(merged["dist"].tolist())

        # per landmark
        for _, row in merged.iterrows():
            lid = int(row["landmark_id"])
            d = float(row["dist"])
            if 0 <= lid <= 32:
                landmark_dists[lid].append(d)

        # per group
        for gname, lids in GROUPS.items():
            g = merged[merged["landmark_id"].isin(lids)]
            if len(g) > 0:
                group_dists[gname].extend(g["dist"].tolist())

    if len(distances_all) == 0:
        return {
            "similarity_score": 0.0,
            "mean_landmark_distance": None,
            "frames_compared": 0,
            "message": "No comparable landmark rows found in common frames.",
            "feedback": {
                "summary": "We couldn't compute distances because the detected landmarks did not overlap properly.",
                "timing": "N/A",
                "body_part_comments": ["Try keeping the full body visible and avoid occlusions."],
                "top_errors": []
            }
        }

    mean_distance = float(np.mean(distances_all))
    similarity_score = float(np.clip(100 - (mean_distance * 100), 0, 100))

    # Timing analysis: lead/lag using cross-correlation on an active landmark
    def landmark_series_y(df, lid):
        s = df[df["landmark_id"] == lid].sort_values("frame")
        return s["y"].to_numpy()

    used_lid = 16
    ref_sig = landmark_series_y(ref_df, used_lid)
    usr_sig = landmark_series_y(user_df, used_lid)

    if len(ref_sig) < 10 or len(usr_sig) < 10:
        used_lid = 28
        ref_sig = landmark_series_y(ref_df, used_lid)
        usr_sig = landmark_series_y(user_df, used_lid)

    timing_comment = "Timing feedback unavailable."
    if len(ref_sig) >= 10 and len(usr_sig) >= 10:
        ref_sig = ref_sig - np.mean(ref_sig)
        usr_sig = usr_sig - np.mean(usr_sig)
        corr = correlate(usr_sig, ref_sig, mode="full")
        lag_frames = int(np.argmax(corr) - (len(ref_sig) - 1))

        lag_seconds = lag_frames / float(frame_rate)

        if lag_frames > 3:
            timing_comment = (
                f"You are BEHIND the reference timing (~{lag_frames} frames, ~{lag_seconds:.2f}s). "
                f"Try initiating transitions slightly earlier to match the choreographer."
            )
        elif lag_frames < -3:
            timing_comment = (
                f"You are AHEAD of the reference timing (~{abs(lag_frames)} frames, ~{abs(lag_seconds):.2f}s). "
                f"Try holding positions a bit longer before moving to the next beat."
            )
        else:
            timing_comment = "Timing is close to the reference (no noticeable lead/lag)."

    # Body part breakdown
    group_means = {g: (float(np.mean(v)) if len(v) else 0.0) for g, v in group_dists.items()}
    worst_groups = sorted(group_means.items(), key=lambda x: x[1], reverse=True)[:2]

    def severity_label(d):
        if d >= 0.12:
            return "high"
        if d >= 0.07:
            return "medium"
        return "low"

    body_part_comments = []
    for gname, d in worst_groups:
        sev = severity_label(d)
        if sev == "high":
            body_part_comments.append(
                f"{gname}: major mismatch vs reference. Focus on matching angles and position paths more closely."
            )
        elif sev == "medium":
            body_part_comments.append(
                f"{gname}: noticeable differences. Tighten control and follow the reference movement path."
            )
        else:
            body_part_comments.append(
                f"{gname}: minor differences. Small refinements will improve accuracy."
            )

    # Top landmark errors
    landmark_avg = {lid: (float(np.mean(vals)) if len(vals) else 0.0) for lid, vals in landmark_dists.items()}
    top_landmarks = sorted(landmark_avg.items(), key=lambda x: x[1], reverse=True)[:5]
    top_errors = []
    for lid, d in top_landmarks:
        if d <= 0:
            continue
        name = LANDMARK_NAME.get(lid, f"Landmark {lid}")
        top_errors.append(f"{name}: deviation ≈ {d:.3f}")

    # Summary generation
    score = round(similarity_score, 2)
    worst_group_name = worst_groups[0][0] if worst_groups else "overall posture"

    if score >= 90:
        summary = (
            f"Excellent match. Your movements closely follow the choreographer with minimal pose deviation. "
            f"Most differences are small and mainly in {worst_group_name}."
        )
    elif score >= 75:
        summary = (
            f"Good performance with noticeable but manageable differences. "
            f"The score is mainly affected by mismatches in {worst_group_name} and slight timing/pose variation."
        )
    elif score >= 60:
        summary = (
            f"Fair alignment. There are clear deviations in pose and/or timing compared to the choreographer. "
            f"The largest issues appear in {worst_group_name}, which pulls the score down."
        )
    else:
        summary = (
            f"Needs improvement. Large pose differences or timing mismatch were detected. "
            f"Your {worst_group_name} alignment differs significantly from the reference, strongly affecting the score."
        )

    used_name = LANDMARK_NAME.get(used_lid, f"landmark {used_lid}")
    if "unavailable" not in timing_comment.lower():
        summary += f" Timing was estimated using {used_name} motion."

    return {
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
                "No dominant joint error stood out; differences are spread across joints."
            ]
        }
    }