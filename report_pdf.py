"""
DancePerfect analysis report PDF export.

Converts the analysis JSON (API response or Supabase result_json) into a
human-readable PDF for dancers and admins. Does not modify the source JSON.
"""

from __future__ import annotations

import os
import tempfile
from datetime import datetime
from typing import Any

from fpdf import FPDF
from PIL import Image

DEFAULT_GIFS_FOLDER = "/var/www/danceperfect/deviation_gifs"
DEFAULT_VERDICT_THRESHOLD = 75.0


def _safe_text(value: Any, fallback: str = "N/A") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    # Core Helvetica fonts in fpdf2 are latin-1 only.
    return (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )


def _normalize_analysis_payload(analysis_json: dict) -> dict:
    """
    Accept either the full POST /analyze response or a Supabase analysis_runs.result_json
    blob (optionally merged with top-level run metadata).
    """
    if not analysis_json:
        return {}

    payload = dict(analysis_json)

    summaries = payload.get("summaries") or {}
    if not summaries.get("what_went_well") and payload.get("summary_good"):
        summaries = {
            "what_went_well": payload.get("summary_good"),
            "where_to_improve": payload.get("summary_bad"),
        }
    payload["summaries"] = summaries

    moments = payload.get("deviation_moments")
    if not moments and payload.get("detected_deviations"):
        moments = []
        for idx, dev in enumerate(payload["detected_deviations"], start=1):
            body_part = _safe_text(dev.get("body_part"), "Body Joint")
            moments.append(
                {
                    "rank": idx,
                    "issue": f"Incorrect {body_part} position sequence.",
                    "recommendation": (
                        f"Adjust your {body_part} tracking to match the reference guide."
                    ),
                    "user_time_clip_label": f"Frame {dev.get('user_start_frame', '?')}",
                    "gif_path": dev.get("gif_path"),
                    "path_sample_start": dev.get("user_start_frame"),
                    "path_sample_end": dev.get("user_start_frame"),
                    "body_part": body_part,
                }
            )
    payload["deviation_moments"] = moments or []

    payload["run_id"] = payload.get("run_id") or payload.get("id")
    payload["processing_time_display"] = (
        payload.get("processing_time_display")
        or _format_processing_time(payload.get("processing_time_seconds"))
    )

    return payload


def _format_processing_time(seconds: Any) -> str:
    try:
        total = int(round(float(seconds)))
    except (TypeError, ValueError):
        return "N/A"
    minutes, remaining = divmod(total, 60)
    if minutes > 0:
        return f"{minutes} min {remaining} sec"
    return f"{remaining} sec"


def _verdict_from_score(score: Any, threshold: float = DEFAULT_VERDICT_THRESHOLD) -> str:
    try:
        numeric = float(score)
    except (TypeError, ValueError):
        return "Score unavailable - review deviation moments below."
    if numeric >= threshold:
        return "On target - minor refinements may still help."
    return "Below target - review the deviation moments below."


def _resolve_gif_path(gif_path: str | None, gifs_folder: str) -> str | None:
    if not gif_path:
        return None
    if os.path.isabs(gif_path) and os.path.isfile(gif_path):
        return gif_path
    candidate = os.path.join(gifs_folder, os.path.basename(gif_path))
    return candidate if os.path.isfile(candidate) else None


def _extract_gif_first_frame_png(gif_path: str, temp_dir: str) -> str | None:
    try:
        with Image.open(gif_path) as image:
            image.seek(0)
            frame = image.convert("RGB")
            base = os.path.splitext(os.path.basename(gif_path))[0]
            png_path = os.path.join(temp_dir, f"{base}_thumb.png")
            frame.save(png_path, format="PNG")
            return png_path
    except Exception:
        return None


class _DanceReportPDF(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def generate_dance_analysis_report_pdf(
    analysis_json: dict,
    output_path: str,
    *,
    run_id: str | None = None,
    include_gif_thumbnails: bool = True,
    gifs_folder: str = DEFAULT_GIFS_FOLDER,
) -> str:
    """
    Convert a DancePerfect analysis JSON payload into a human-readable PDF report.

    Args:
        analysis_json: Full POST /analyze response and/or Supabase result_json fields.
        output_path: Destination PDF path (caller decides storage/ hosting).
        run_id: Optional override; defaults to analysis_json['run_id'].
        include_gif_thumbnails: Embed the first frame of each deviation GIF when found.
        gifs_folder: Directory containing deviation GIF filenames from the JSON.

    Returns:
        Absolute path to the written PDF file.
    """
    payload = _normalize_analysis_payload(analysis_json)
    resolved_run_id = run_id or payload.get("run_id") or "unknown-run"
    summaries = payload.get("summaries") or {}
    moments = payload.get("deviation_moments") or []

    score = payload.get("dtw_similarity_score")
    dtw_distance = payload.get("dtw_distance")
    processing_time = payload.get("processing_time_display", "N/A")
    ref_len = payload.get("ref_sequence_length")
    user_len = payload.get("user_sequence_length")

    pdf = _DanceReportPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 12, "DancePerfect - Performance Analysis Report", ln=True)

    pdf.set_font("Helvetica", "", 10)
    pdf.ln(2)
    pdf.cell(0, 6, f"Run ID: {resolved_run_id}", ln=True)
    pdf.cell(0, 6, f"Generated: {datetime.now().strftime('%B %d, %Y, %I:%M %p')}", ln=True)
    pdf.cell(0, 6, f"Processing time: {processing_time}", ln=True)
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Overall Score", ln=True)
    pdf.set_font("Helvetica", "", 11)

    metrics = [
        ("Similarity score", f"{_safe_text(score)} / 100"),
        ("DTW distance", _safe_text(dtw_distance)),
        ("Reference frames analyzed", _safe_text(ref_len)),
        ("User frames analyzed", _safe_text(user_len)),
    ]
    for label, value in metrics:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(62, 7, label + ":", border=0)
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 7, value, ln=True)

    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(18, 7, "Verdict:", border=0)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(0, 7, _verdict_from_score(score))
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Summary", ln=True)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "What went well", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(0, 6, _safe_text(summaries.get("what_went_well"), "No positive summary recorded."))
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Where to improve", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.multi_cell(0, 6, _safe_text(summaries.get("where_to_improve"), "No improvement summary recorded."))
    pdf.ln(4)

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Deviation Moments (Top 3)", ln=True)
    pdf.set_font("Helvetica", "I", 10)
    pdf.multi_cell(
        0,
        5,
        "Legend: Red markers in the side-by-side clips indicate body parts deviating from the reference.",
    )
    pdf.ln(3)

    temp_dir = tempfile.mkdtemp(prefix="dance_report_")
    try:
        for moment in moments[:3]:
            rank = moment.get("rank", "?")
            body_part = _safe_text(moment.get("body_part") or moment.get("issue"), "Deviation")
            clip_label = _safe_text(moment.get("user_time_clip_label"), "N/A")
            issue = _safe_text(moment.get("issue"))
            recommendation = _safe_text(moment.get("recommendation"))

            pdf.set_font("Helvetica", "B", 12)
            pdf.cell(0, 8, f"#{rank} - {body_part}", ln=True)
            pdf.set_font("Helvetica", "", 11)
            pdf.cell(0, 6, f"Time (your video): {clip_label}", ln=True)
            pdf.ln(1)

            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 6, "Issue:", ln=True)
            pdf.set_font("Helvetica", "", 11)
            pdf.multi_cell(0, 6, issue)
            pdf.ln(1)

            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 6, "Recommendation:", ln=True)
            pdf.set_font("Helvetica", "", 11)
            pdf.multi_cell(0, 6, recommendation)
            pdf.ln(2)

            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 6, "Visual evidence:", ln=True)
            gif_name = moment.get("gif_path")
            resolved_gif = _resolve_gif_path(gif_name, gifs_folder)
            thumbnail_path = None
            if include_gif_thumbnails and resolved_gif:
                thumbnail_path = _extract_gif_first_frame_png(resolved_gif, temp_dir)

            if thumbnail_path:
                usable_width = pdf.w - pdf.l_margin - pdf.r_margin
                pdf.image(thumbnail_path, w=usable_width)
                pdf.ln(2)
                pdf.set_font("Helvetica", "I", 9)
                pdf.cell(0, 5, "Left: You    Right: Reference", ln=True)
            else:
                pdf.set_font("Helvetica", "", 10)
                pdf.multi_cell(
                    0,
                    5,
                    _safe_text(gif_name, "GIF not available on disk."),
                )
            pdf.ln(5)

        pdf.add_page()
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 10, "Technical Details (admin appendix)", ln=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.ln(2)

        admin_lines = [
            f"Run ID: {resolved_run_id}",
            f"DTW distance: {_safe_text(dtw_distance)}",
            f"Similarity score: {_safe_text(score)}",
            f"Processing time (seconds): {_safe_text(payload.get('processing_time_seconds'))}",
            f"Reference sequence length: {_safe_text(ref_len)}",
            f"User sequence length: {_safe_text(user_len)}",
            "",
            "Deviation clip frame ranges:",
        ]
        for moment in moments[:3]:
            rank = moment.get("rank", "?")
            start = moment.get("path_sample_start")
            end = moment.get("path_sample_end")
            admin_lines.append(f"  #{rank}: frames {start} - {end}  ({moment.get('gif_path', 'no gif')})")

        for line in admin_lines:
            pdf.multi_cell(0, 5, line or " ")
            pdf.ln(1)

        pdf.ln(4)
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.multi_cell(
            0,
            5,
            "This report was generated from the analysis JSON. "
            "The original JSON is unchanged and remains the source of truth for the frontend.",
        )

        output_dir = os.path.dirname(os.path.abspath(output_path))
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
        pdf.output(output_path)
        return os.path.abspath(output_path)
    finally:
        for name in os.listdir(temp_dir):
            try:
                os.remove(os.path.join(temp_dir, name))
            except OSError:
                pass
        try:
            os.rmdir(temp_dir)
        except OSError:
            pass
