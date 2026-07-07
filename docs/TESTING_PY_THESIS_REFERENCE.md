# DancePerfect Motion Analysis System — Portable Thesis Study Guide

**Document type:** Standalone technical reference (no source code required).  
**System name:** DancePerfect backend motion-analysis service.  
**Implementation:** Single Python module (~2,300 lines) exposing a Flask HTTP API.  
**Last aligned to:** DancePerfect / DANCE_PERFECT_2025 backend behavior as of 2026.

---

## How to use this document (read this first)

You can study the **entire system** from this file alone—on a phone, tablet, or any AI chat—without opening the repository.

### For your thesis

1. Find your current chapter in **Section 2 (Thesis chapter navigator)**.
2. Read the linked sections in this document.
3. Paste those sections (or this whole file) into an AI with a prompt from **Section 2.2**.

### What this document contains

- Problem statement and what the system **does** end-to-end  
- Every **input**, **output**, and **file** produced  
- **Algorithms** with formulas and thresholds (not “see code”)  
- **Feedback rules** in plain language  
- **API** request/response contract  
- **JSON schemas** for the website  
- **Limitations** for Discussion / validity  
- **Glossary** of terms  

---

## 2. Thesis chapter navigator

### 2.1 Which section to read per thesis chapter

| Thesis chapter | Read these sections |
|----------------|---------------------|
| **Abstract / Introduction** | 3, 4, 5 (first paragraphs), 15 |
| **Background / Related work** | 6, 7, 8, 9, 16 (limitations), 19 (glossary) |
| **Problem statement / Objectives** | 3, 4, 5 |
| **Requirements (functional)** | 4, 10, 11, 12 |
| **Requirements (non-functional)** | 5.4, 13, 14, 16 |
| **System architecture** | 5, 10, 14 |
| **Methodology — data capture** | 6, 7.1 |
| **Methodology — preprocessing** | 7.2 |
| **Methodology — similarity & DTW** | 8, 9 |
| **Methodology — feedback engine** | 10 |
| **Methodology — visualization** | 11 |
| **Implementation** | 5, 10, 12, 13, 14 |
| **Results / evaluation design** | 8, 9, 12, 16, 17 |
| **Discussion** | 16, 19 |
| **Deployment / operations** | 14, 15 |
| **Future work** | 16 |
| **Appendix (API, data dictionary)** | 12, 13, 18 |

### 2.2 Copy-paste prompts for AI (per chapter)

**Introduction:**  
> Using only the attached DancePerfect study guide, write an introduction paragraph that states the problem (comparing a dancer to a reference choreography), the approach (pose landmarks + DTW + rule-based feedback), and the deliverables (scores, tips, GIFs). Cite Section 3 and 4.

**Related work:**  
> Compare frame-synchronous skeleton distance vs Dynamic Time Warping for dance comparison, using Sections 8 and 9. Suggest 5 papers or standard references I should cite.

**Methodology:**  
> Write a Methodology subsection on pose estimation (Section 6), motion CSV format (Section 7.1), active-range trimming (Section 7.2), DTW alignment (Section 9), and pose normalization (Section 8.2). Include equations where provided.

**Feedback system:**  
> Explain the rule-based feedback in Section 10 as a thesis subsection. List each body region checked and the thresholds.

**Results:**  
> Describe what metrics and artifacts the system outputs (Section 4, 12, 13). Propose an evaluation table with independent variables from Section 17.

**Discussion:**  
> Critique validity threats using Section 16. Propose mitigations.

**Frontend / UI chapter:**  
> Explain how the website should consume the API (Section 12–13) without reading source code.

---

## 3. Problem and purpose

### 3.1 Problem

Dance learners record themselves performing choreography but lack **objective, time-aligned** comparison against a reference video. Manual coach review does not scale. Videos may differ in **length**, **tempo**, and **camera framing**.

### 3.2 Solution (what the system does)

The system accepts **two videos**:

1. **Reference** — choreographer / gold standard  
2. **User** — learner performance  

It then:

1. Estimates **body pose** per frame (33 landmarks).  
2. Stores motion in **CSV** tables.  
3. Computes a **global similarity score** (frame-aligned).  
4. Aligns performances in **time** with **Dynamic Time Warping (DTW)**.  
5. Finds **worst** and **best** moments along that alignment.  
6. Generates **textual feedback** (timing, arms, legs, torso, core).  
7. Renders **side-by-side images** and **short GIFs** (red = mismatch, green = match on user skeleton).  
8. Returns **JSON** for a web app plus optional **cloud URLs** for media files.

### 3.3 Users and stakeholders

- **Dancer / student** — uploads videos, reads tips and visuals.  
- **Web frontend** — calls HTTP API, displays JSON + media URLs.  
- **Researcher (thesis)** — documents algorithms, thresholds, and evaluation.  
- **Operator** — runs Flask on a VPS (e.g. Hetzner); may enable Supabase/S3 for public media.

---

## 4. Complete inventory of inputs and outputs

### 4.1 Inputs

| Input | Format | How it arrives |
|-------|--------|----------------|
| Reference video | MP4 (typical) | Multipart POST field `choreo_video` or `video1` |
| User video | MP4 (typical) | Multipart POST field `dancer_video` or `video2` |

No other mandatory inputs. Optional: environment variables for cloud storage (Section 14).

### 4.2 Outputs (every artifact the system can produce)

| # | Artifact | Format | Typical path pattern | In API response? |
|---|----------|--------|----------------------|------------------|
| 1 | Reference motion table | CSV | `motion_outputs/reference_motion.csv` | `comparison.outputs` paths |
| 2 | User motion table | CSV | `motion_outputs/user_motion.csv` | same |
| 3 | Run log | TXT | `logs/motion_capture_{timestamp}.log` | `log_file`, `log_file_url` |
| 4 | Practice tips file | TXT | `tips/tips_{timestamp}.txt` | `tips_file`, `tips_file_url` |
| 5 | Deviation screenshot(s) | PNG | `deviation_screenshots/deviation_comparison_{n}_{run}.png` | `deviation_comparison_images`, `*_urls` |
| 6 | Pose-match screenshot(s) | PNG | `pose_match_screenshots/pose_match_comparison_{n}_{run}.png` | `pose_match_comparison_images`, `*_urls` |
| 7 | Deviation GIF(s) | GIF | `deviation_gifs/deviation_rank{n}_{run}.gif` | `deviation_gifs`, `deviation_gif_urls` |
| 8 | UI JSON bundle | JSON | `analysis_ui/deviation_moments_{run}.json` | `deviation_moments_ui`, `deviation_moments_ui_file`, `*_url` |
| 9 | Main API payload | JSON | (HTTP body) | Entire response |

**Per run:** up to **3** deviation PNGs, **3** pose-match PNGs, **3** deviation GIFs (same “top 3 worst” ranks).

### 4.3 What is *not* stored long-term by default

- Full DTW path (too large for logs); only summaries and top moments.  
- Raw uploaded videos remain in `uploads/` until overwritten by the next run.

---

## 5. System architecture

### 5.1 Technology stack

| Component | Technology | Role |
|-----------|------------|------|
| HTTP server | Flask + CORS | REST API, JSON |
| Video | OpenCV | Read frames, resize, write PNG/GIF frames |
| Pose | MediaPipe Pose (BlazePose) | 33 landmarks per frame |
| Tables | pandas + CSV | Motion storage |
| Math | NumPy | Vectors, distances, angles |
| Alignment | FastDTW + SciPy Euclidean | Time warping |
| GIF | Pillow (optional) | Encode animation |
| Cloud (optional) | Supabase or S3 | Public HTTPS URLs |

### 5.2 Pose model (BlazePose via MediaPipe)

- **Landmarks:** 33 points (nose, shoulders, elbows, wrists, hips, knees, ankles, feet, etc.).  
- **Coordinates:** Normalized image coordinates `x, y, z` ∈ [0,1] (origin top-left; **y increases downward**).  
- **Visibility:** Per-landmark confidence in CSV.  
- **Settings:** `model_complexity = 1` (balanced). Video mode uses tracking; still images use static mode for screenshots/GIF frames.

### 5.3 End-to-end pipeline (textual)

```
UPLOAD two videos
  → SAVE to uploads folder
  → EXTRACT pose → two CSVs (max 8 FPS, max 640px long side)
  → TRIM idle start/end on each CSV
  → COMPARE frame-sync → similarity_score 0–100
  → DTW align sequences → dtw_similarity_score, worst_deviations, best_pose_matches, feedback
  → BUILD practice tips and summaries
  → RENDER up to 3 deviation PNGs, 3 pose-match PNGs, up to 3 deviation GIFs
  → BUILD deviation_findings + deviation_moments_ui.json
  → WRITE log + tips text file
  → OPTIONAL upload to cloud → attach URLs
  → RETURN JSON to client
```

### 5.4 Design constraints (deployment)

- Target: modest VPS (e.g. **2 vCPU, 4 GB RAM**).  
- **8 FPS** cap limits CPU for long videos.  
- **640 px** max frame long side before inference.  
- GIF creation is **CPU-heavy** (re-runs pose on each GIF frame).

---

## 6. Pose capture and motion CSV

### 6.1 Sampling rate

- Constant **`MOTION_FPS = 8`**.  
- If source video is 30 FPS, process every ~4th frame (`step = round(source_fps / 8)`).  
- **Effective FPS** returned for timestamps: `source_fps / step`.  
- Timestamp for frame index `f` (1-based):  
  **`time_sec = (f - 1) / effective_fps`**  
  Display: **`[minutes:seconds]`** e.g. `[1:05]`.

### 6.2 CSV schema (one row per landmark per frame)

| Column | Meaning |
|--------|---------|
| `frame` | 1-based frame number in motion CSV |
| `landmark_id` | 0–32 (MediaPipe body index) |
| `x`, `y`, `z` | Normalized position |
| `visibility` | Detection confidence |

### 6.3 Landmark IDs used heavily in analysis

| ID | Body part |
|----|-----------|
| 11, 12 | Left / right shoulder |
| 13, 14 | Left / right elbow |
| 15, 16 | Left / right wrist |
| 23, 24 | Left / right hip |
| 25, 26 | Left / right knee |
| 27, 28 | Left / right ankle |
| 29–32 | Feet (heel, toe) |

**DTW vector** uses 14 landmarks × (x,y,z) = **42 dimensions** per frame: shoulders through feet (IDs 11–16, 23–32).

### 6.4 Memory management

- Delete frame buffers after each processed frame.  
- Garbage-collect every 300 source frames on long videos.

---

## 7. Preprocessing: removing standing still

### 7.1 Activity metric

For each frame, compute mean Euclidean distance between all landmark positions and the **previous** frame (same landmark IDs). First frame activity = 0.

### 7.2 Active segment

- Frame is **active** if activity > **`MOTION_ACTIVITY_THRESHOLD`** (0.006).  
- Find **longest consecutive run** of active frames with length ≥ **`MIN_ACTIVE_RUN_FRAMES`** (5).  
- Apply **cooldown:** skip first **4** frames after start and last **4** before end of that run (reduces transition noise).  
- If no clear run, use entire video range.

### 7.3 Trim and renumber

- Keep only rows with frame in `[start, end]`.  
- Renumber frames to **1, 2, 3, …** so analysis always works on a contiguous sequence.

**Thesis note:** This prevents scoring idle posing at the start/end of clips.

---

## 8. Frame-synchronous similarity (global score)

### 8.1 Method

After independent trim on reference and user CSVs:

1. Take **intersection** of frame numbers present in **both** (same index after each video’s own trim—not warped in time).  
2. For each shared frame, for each shared `landmark_id`, compute  
   **`d = sqrt((x_ref-x_user)² + (y_ref-y_user)² + (z_ref-z_user)²)`**  
3. Sum all `d` over all landmarks and frames; divide by count → **`mean_landmark_distance`**.  
4. **`similarity_score = clamp(100 - mean_landmark_distance × 100, 0, 100)`**.

### 8.2 Pass/fail threshold

- **`deviation_percent = 100 - similarity_score`**.  
- **`within_acceptable_range = (similarity_score >= 80)`** (configurable **`ACCEPTABLE_SIMILARITY_PERCENT`**).  
- Text recommendation encourages practice if below threshold.

### 8.3 Strengths and weaknesses

| Strength | Weakness |
|----------|----------|
| Simple, one number for thesis tables | Assumes frame numbers align semantically |
| Fast | Fails when dancer is faster/slower than reference |
| Good if both videos are same length & sync | Not used for GIF moment picking |

**Use in thesis:** Report as **“frame-index similarity”**; pair with DTW score for tempo mismatch.

---

## 9. DTW alignment and DTW similarity

### 9.1 Pose sequence construction

For each frame after trim:

1. Concatenate (x,y,z) for landmarks 11–16, 23–32 in fixed order → vector **v**.  
2. **Normalize** (translation + scale invariant):  
   - Let **hip_center** = midpoint of left and right hip.  
   - Subtract hip_center from all points.  
   - Let **scale** = distance from hip_center to shoulder_center.  
   - If scale > ε, divide all coordinates by scale.  
3. Flatten to 1D array; sequence = list of arrays over frames.

### 9.2 Dynamic Time Warping

- Algorithm: **FastDTW** with pairwise **Euclidean** distance between pose vectors.  
- Output:  
  - **`distance`** — total alignment cost  
  - **`path`** — list of pairs `(ref_index, user_index)` (0-based into trimmed sequences)  

**Interpretation:** Each path step pairs one reference pose with one user pose that DTW considers aligned, even if ref is at 0:10 and user at 0:14.

### 9.3 DTW similarity score

```
normalized_distance = total_distance / path_length
dtw_similarity_score = clamp(100 - normalized_distance × 50, 0, 100)
```

### 9.4 Top-K moments along the path

Scan entire path once; for each step compute Euclidean distance between pose vectors at that alignment.

| Output | Count | Selection rule |
|--------|-------|----------------|
| **worst_deviations** | 3 | Largest distances (max-heap) |
| **best_pose_matches** | 3 | Smallest distances among those ≤ **0.15** |

Each worst deviation record includes:

- `ref_frame`, `user_frame` (1-based in original CSV coordinates before trim offset)  
- `user_time` — `[m:ss]` at peak mismatch  
- `distance` — numeric mismatch  
- `path_index` — index into DTW path (for GIF window)  

### 9.5 Feedback sampling on path

Every **15th** path step, run detailed frame analysis (Section 10). Reduces CPU while covering the performance.

### 9.6 Aligned moments (samples)

- Every **20th** path entry → `{reference_time, user_time}` for debugging/display.  
- First and last **10** path pairs stored for sync verification endpoint.

---

## 10. Rule-based feedback engine (complete rule list)

Feedback is generated on **DTW-aligned** frame pairs `(ref_frame, user_frame)`. Messages include user timestamp `[m:ss]`.

### 10.1 Timing (lag along path indices)

Uses `lag_sec = (user_frame - ref_frame) / fps`:

| Condition | Message intent |
|-----------|----------------|
| `lag_sec > 0.3` | User is **too slow** (behind reference) |
| `lag_sec < -0.3` | User is **too fast** (ahead of reference) |

### 10.2 Arm height (left and right)

Compare wrist **y** minus shoulder **y** (remember: y down = lower on screen):

| Condition | Feedback |
|-----------|----------|
| User arm more than **0.05** lower than reference | Arm **too low** |
| User arm more than **0.05** higher than reference | Arm **too high** |

### 10.3 Elbow angle (left and right)

Angle at elbow between shoulder–elbow–wrist (degrees):

| Condition | Feedback |
|-----------|----------|
| User angle < ref − **25°** | Arm **more bent** than reference |
| User angle > ref + **25°** | Arm **straighter** than reference |
| Reference “straight” (>150°) and user noticeably bent | Should **straighten** arm |

### 10.4 Knee / leg (left and right)

Angle at knee: hip–knee–ankle:

| Condition | Feedback |
|-----------|----------|
| User < ref − **20°**, ref straight | User leg **bent**, reference **straight** |
| User < ref − **20°**, both bent | Knee **too bent** |
| User > ref + **20°**, ref bent | User **straight**, reference **bent** |
| User > ref + **20°**, else | Knee **too straight** |

### 10.5 Torso lean

Compare shoulder midpoint vs hip midpoint (x and z):

| Condition | Threshold | Feedback |
|-----------|-----------|----------|
| Lean right vs reference | x diff > **0.04** | Leaning / shifted **right** |
| Lean left vs reference | x diff < **−0.04** | Leaning / shifted **left** |
| Lean forward (z) | z diff > **0.04** | **Forward** |
| Lean back (z) | z diff < **−0.04** | **Back** |

### 10.6 Core engagement (“crunch”)

Only when:

- Reference frame > **12** frames after motion start (avoid opening stance), AND  
- Reference torso vertical span < **0.22** (reference is in a “crunched” shape), AND  
- Reference torso more crunched than user by **> 0.05**  

→ Feedback: **not engaging core**.

### 10.7 Arm asymmetry

If reference has one wrist clearly higher than the other but user arms are symmetric or wrong side raised → feedback about **asymmetric pose** mismatch.

### 10.8 Grouping and tips

1. **Group** identical feedback stems within **1.5 s** gaps → one message for `[0:02]–[0:04]`.  
2. **Paragraph summary** from grouped list.  
3. **Practice tips** — short sentences; merge “left arm” + “right arm” into “arms” when same fix at same time.  
4. **Deviation findings** — for each of top 3 worst moments, pick nearest grouped feedback (within **3 s**) → **`issue`** (raw) + **`recommendation`** (tip); else generic text.  
5. **`body_focus`** tag inferred from text: `arms`, `legs`, `torso_core`, `timing`, etc.

---

## 11. Visual outputs (images and GIFs)

### 11.1 Side-by-side layout

| Panel | Content |
|-------|---------|
| Left | Reference video frame + default MediaPipe skeleton |
| Right | User frame + skeleton colored by match |

**Per-landmark coloring (user):**

- Compute 2D distance between reference and user normalized (x,y).  
- If distance ≤ **0.08** → draw **green** (match).  
- Else → **red** (mismatch).  
- Pose-match images use stricter **0.04**.

### 11.2 PNG screenshots

| Type | Count | Moment | Extras |
|------|-------|--------|--------|
| Deviation | 3 | Each `worst_deviations[i]` | Optional tips panel at bottom; long caption on user side |
| Pose match | 3 | Each `best_pose_matches[i]` | Green = match caption |

### 11.3 GIFs (deviation only)

| Property | Value |
|----------|--------|
| Count | **3** (same ranks as worst deviations) |
| Frames | DTW path from `path_index − 5` to `path_index + 5` (up to **11** frames) |
| Labels on video | Only **`reference`** and **`you`** (lowercase) on top |
| Timestamp on video | **None** (frontend shows time from JSON) |
| Playback speed | **6 FPS** (GIF timing, not motion CSV rate) |
| Requires | Pillow library |

**Clip timestamps in JSON** (for UI, not burned into GIF):

- `user_time_clip_start`, `user_time_clip_end`, `user_time_clip_label` — from first/last user frame in GIF segment.

### 11.4 Legend (JSON only, not on GIF)

**`deviation_visual_legend`:**  
*"The red glowing lines in the body means that the body part is deviating from the reference"*

Frontend should show this near the GIF player.

---

## 12. HTTP API reference

**Base:** Flask app, default port **5000**, `0.0.0.0` in development.

### 12.1 Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health; lists endpoints |
| POST | `/analyze` | **Website:** fields `choreo_video`, `dancer_video` |
| POST | `/upload-videos` | **Alt:** fields `video1`, `video2` |
| GET | `/check-dtw` | Debug DTW on last CSV pair |

### 12.2 Example request (website)

```http
POST /analyze HTTP/1.1
Content-Type: multipart/form-data

choreo_video=<reference.mp4>
dancer_video=<user.mp4>
```

### 12.3 Example response structure (abbreviated)

```json
{
  "message": "Motion capture completed",
  "video_info": {
    "reference": { "frame_count": 900, "fps": 30.0, "duration_sec": 30.0 },
    "user": { "frame_count": 840, "fps": 30.0, "duration_sec": 28.0 }
  },
  "comparison": {
    "similarity_score": 72.5,
    "dtw_similarity_score": 68.2,
    "within_acceptable_range": false,
    "deviation_percent": 27.5,
    "recommendation": "Your movement differs from the reference...",
    "worst_deviations": [
      {
        "ref_frame": 45,
        "user_frame": 41,
        "distance": 0.52,
        "user_time": "[1:05]",
        "path_index": 120
      }
    ],
    "best_pose_matches": [ "..." ],
    "feedback_analysis": [ "..." ],
    "practice_tips": [ "Keep your arms higher at 0:15." ],
    "negative_feedback_summary": "...",
    "positive_feedback_summary": "...",
    "deviation_findings": [ "..." ],
    "deviation_gifs": [ "deviation_gifs/deviation_rank1_2026-05-26_12-00-00.gif", null, "..." ],
    "deviation_visual_legend": "The red glowing lines..."
  },
  "deviation_moments_ui": { "run_id": "...", "deviation_moments": [ "..." ], "practice_tips": [ "..." ] },
  "deviation_gif_urls": [ "https://...", null, "https://..." ],
  "log_file_url": "https://...",
  "tips_file_url": "https://..."
}
```

### 12.4 `/check-dtw` response (diagnostics)

Returns whether FastDTW is installed, sequence lengths, path length, first/last 10 aligned time pairs, `dtw_similarity_score`. Use to verify alignment without re-uploading videos.

---

## 13. Frontend data contract (what to display)

### 13.1 Primary bundle: `deviation_moments_ui`

| Field | UI use |
|-------|--------|
| `deviation_visual_legend` | Caption under GIF |
| `practice_tips` | Global tip list |
| `summaries.where_to_improve` | Negative summary card |
| `summaries.what_went_well` | Positive summary card |
| `feedback_overview` | Longer paragraph (optional) |
| `deviation_moments[]` | One card per top deviation |

### 13.2 Per-moment card (`deviation_moments[i]`)

| Field | UI use |
|-------|--------|
| `rank` | #1, #2, #3 |
| `user_time` | Peak mismatch time |
| `user_time_clip_label` | **Show as timestamp while GIF plays** |
| `gif_path` or `deviation_gif_urls[i]` | `<img>` or video source — **must be HTTPS URL in production** |
| `issue` | What went wrong |
| `recommendation` | What to practice |
| `body_focus` | Icon/filter (arms, legs, etc.) |
| `screenshot_path` / URL | Still image fallback |

**Index rule:** `i` must match across `deviation_moments`, `deviation_gifs`, and `deviation_gif_urls`.

### 13.3 Scores to show

| Score | Label suggestion |
|-------|------------------|
| `similarity_score` | Overall match (frame-aligned) |
| `dtw_similarity_score` | Overall match (time-warped) |
| `within_acceptable_range` | Pass / needs practice badge |

### 13.4 Production media URLs

Browsers cannot open server paths like `deviation_gifs/foo.gif`. Production needs either:

- **`STORAGE_PROVIDER`** → Supabase/S3 → use `*_url` fields, or  
- Backend **static file route** / Nginx alias → full `https://api.domain/...` URLs in JSON.

---

## 14. Deployment and environment

### 14.1 Local / thesis development

```bash
python -m venv .venv
# activate venv
pip install -r requirements.txt
python testing.py   # Flask debug on port 5000
```

### 14.2 Production (e.g. Hetzner VPS)

- Run behind **gunicorn** + reverse proxy (Nginx).  
- Disable Flask `debug=True`.  
- Set `STORAGE_PROVIDER` if frontend is on another domain.  
- Expect **tens of seconds** per analysis on 2 vCPU for typical clips; GIFs add load.

### 14.3 Environment variables (storage)

```
STORAGE_PROVIDER=supabase   # or s3, or empty
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
STORAGE_BUCKET=analysis-assets

# OR
S3_BUCKET=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_REGION=us-east-1
S3_PUBLIC_BASE_URL=...   # optional CDN base
```

Upload keys under `runs/{run_timestamp}/logs|tips|screenshots|gifs|analysis_ui/`.

---

## 15. Configuration reference (all tunable constants)

| Name | Default | Effect |
|------|---------|--------|
| MOTION_FPS | 8 | Max motion CSV frame rate |
| MAX_PROCESS_FRAME_LONG_SIDE | 640 | Max pixels before pose inference |
| ACCEPTABLE_SIMILARITY_PERCENT | 80 | Pass threshold on frame score |
| NUM_DEVIATION_SCREENSHOTS | 3 | Top worst moments (PNG) |
| NUM_POSE_MATCH_SCREENSHOTS | 3 | Top best moments (PNG) |
| NUM_DEVIATION_GIFS | 3 | Top worst moments (GIF) |
| DEVIATION_GIF_PATH_RADIUS | 5 | ± path steps around peak |
| DEVIATION_GIF_PLAYBACK_FPS | 6 | GIF frames per second |
| POSE_MATCH_MAX_DISTANCE | 0.15 | Max DTW distance for “good” pose |
| MOTION_ACTIVITY_THRESHOLD | 0.006 | Idle vs active detection |
| MIN_ACTIVE_RUN_FRAMES | 5 | Min run length for “dancing” |
| MOTION_START/END_COOLDOWN_FRAMES | 4 | Trim edge transitions |
| FEEDBACK_CORE_START_COOLDOWN_FRAMES | 12 | Suppress core feedback early |
| REF_TORSO_CRUNCH_THRESHOLD | 0.22 | Reference “crunch” detection |
| Visual match threshold | 0.08 / 0.04 | Green vs red skeleton |
| DTW feedback sample_every | 15 | Path steps between deep analysis |
| Feedback group max_gap_sec | 1.5 | Merge window for same issue |
| Finding–feedback match window | 3 s | Max time delta for issue pairing |

---

## 16. Limitations, threats to validity, future work

### 16.1 Technical limitations

1. **Single camera, normalized 2D** — no true 3D body model in world space.  
2. **Pose estimation errors** — occlusion, baggy clothes, cropping.  
3. **Two scores that disagree** — frame-sync vs DTW when tempo differs.  
4. **Heuristic feedback** — not trained on expert annotations; fixed degree thresholds.  
5. **Fixed 8 FPS** — may miss very fast isolations.  
6. **GIF cost** — repeated inference per GIF frame.  
7. **No multi-dancer** — one person per video assumed.

### 16.2 Validity (thesis Discussion)

- **Construct validity:** Does landmark distance equal “dance quality”? Discuss.  
- **Ecological validity:** Webcam / phone footage vs studio.  
- **Criterion validity:** Compare system tips to human coach (user study).  

### 16.3 Future work (from limitations)

- Learned scoring; segment-level choreography labels; audio beat alignment; 3D pose; lighter GIF pipeline; per-joint confidence weighting; explicit tempo score separate from pose score.

---

## 17. Suggested evaluation methodology (for Results chapter)

### 17.1 Quantitative metrics to report

| Metric | Source field |
|--------|----------------|
| Frame similarity | `similarity_score` |
| DTW similarity | `dtw_similarity_score` |
| Mean landmark distance | `mean_landmark_distance` |
| DTW path length | `path_length` |
| Pass rate | % runs with `within_acceptable_range` |
| Processing time | Wall clock per stage (measure externally) |

### 17.2 Qualitative

- Coach rating of `recommendation` vs `issue` (Likert).  
- User comprehension of `deviation_visual_legend` + GIF.  

### 17.3 Ablation ideas (thesis experiments)

- With vs without active-range trim.  
- MOTION_FPS 8 vs 15.  
- Frame score only vs DTW only for ranking moments.  
- Threshold sensitivity on green/red 0.08.

---

## 18. Data dictionary (quick lookup)

| Term | Meaning |
|------|---------|
| Reference video | Choreographer / gold performance |
| User video | Learner performance |
| Motion CSV | Time series of 33 landmarks |
| Active range | Frames where dancer is actually moving |
| DTW path | Best alignment pairs (ref_idx, user_idx) |
| worst_deviations | Top 3 highest mismatch along path |
| path_index | Position on path for GIF clipping |
| similarity_score | Frame-aligned 0–100 |
| dtw_similarity_score | Time-warped 0–100 |
| practice_tips | Short actionable strings |
| deviation_findings | Structured cards for UI |
| deviation_moments_ui | Full frontend JSON bundle |

---

## 19. Glossary

| Term | Definition |
|------|------------|
| **BlazePose** | Google’s pose model family inside MediaPipe; 33 landmarks |
| **Landmark** | Single body keypoint (x,y,z, visibility) |
| **DTW** | Dynamic Time Warping — aligns two time series of different speed/length |
| **FastDTW** | Approximate DTW algorithm used for speed |
| **Pose vector** | 42-D normalized landmark coordinates for one frame |
| **Path** | Sequence of aligned (reference, user) frame indices from DTW |
| **Normalized pose** | Hip-centered, torso-scaled coordinates (scale-invariant) |
| **Active trim** | Remove standing-still at start/end |
| **Deviation moment** | Local peak of pose mismatch along DTW path |
| **Frame-sync score** | Similarity without time warping |

---

## 20. Python dependencies

```
flask, flask-cors, opencv-python-headless, mediapipe==0.10.14,
pandas, numpy, scipy, fastdtw, pillow, gunicorn
```

Optional: `supabase`, `boto3` (cloud uploads).

---

## 21. Document revision note

When the live system changes (new endpoints, thresholds, or outputs), update the matching section here so this file remains a **complete offline spec** for thesis work and AI assistance.

---

*End of portable study guide — self-contained; no repository access required.*
