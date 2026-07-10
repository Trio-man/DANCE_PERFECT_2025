import argparse
import csv
import json
import os
import threading
import time
from datetime import datetime

import cv2
import psutil
import requests


def count_frames(video_path):
    cap = cv2.VideoCapture(video_path)
    frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    cap.release()
    return frames, fps


def get_gunicorn_processes():
    processes = []
    for p in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            cmdline = " ".join(p.info.get("cmdline") or [])
            if "gunicorn" in cmdline:
                processes.append(p)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return processes


def monitor_backend(stop_event, samples):
    # Warm up cpu_percent
    for p in get_gunicorn_processes():
        try:
            p.cpu_percent(interval=None)
        except Exception:
            pass

    while not stop_event.is_set():
        cpu_total = 0.0
        memory_total = 0.0

        for p in get_gunicorn_processes():
            try:
                cpu_total += p.cpu_percent(interval=None)
                memory_total += p.memory_info().rss / (1024 * 1024)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        samples.append({
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "cpu_percent": round(cpu_total, 2),
            "memory_mb": round(memory_total, 2),
        })

        time.sleep(1)


def summarize(samples):
    cpu = [s["cpu_percent"] for s in samples if s["cpu_percent"] > 0]
    mem = [s["memory_mb"] for s in samples if s["memory_mb"] > 0]

    return {
        "avg_cpu_percent": round(sum(cpu) / len(cpu), 2) if cpu else 0,
        "peak_cpu_percent": round(max(cpu), 2) if cpu else 0,
        "avg_memory_mb": round(sum(mem) / len(mem), 2) if mem else 0,
        "peak_ram_mb": round(max(mem), 2) if mem else 0,
        "samples_recorded": len(samples),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://danceperfect.duckdns.org/analyze")
    parser.add_argument("--ref", required=True, help="Reference video path")
    parser.add_argument("--user", required=True, help="User video path")
    parser.add_argument("--user-id", default="benchmark-test-user")
    parser.add_argument("--output", default="benchmark_results.csv")
    args = parser.parse_args()

    ref_frames, ref_fps = count_frames(args.ref)
    user_frames, user_fps = count_frames(args.user)
    total_input_frames = ref_frames + user_frames

    samples = []
    stop_event = threading.Event()

    monitor_thread = threading.Thread(
        target=monitor_backend,
        args=(stop_event, samples),
        daemon=True,
    )

    print("Starting backend resource monitor...")
    monitor_thread.start()

    print("Sending analysis request...")
    request_start = time.perf_counter()

    with open(args.ref, "rb") as ref_file, open(args.user, "rb") as user_file:
        files = {
            "ref_video": (os.path.basename(args.ref), ref_file, "video/mp4"),
            "user_video": (os.path.basename(args.user), user_file, "video/mp4"),
        }

        data = {
            "ref_fps": str(round(ref_fps or 30)),
            "user_fps": str(round(user_fps or 30)),
            "user_motion_fps": str(round(user_fps or 30)),
            "user_id": args.user_id,
        }

        response = requests.post(args.url, files=files, data=data)

    total_response_time = round(time.perf_counter() - request_start, 2)

    stop_event.set()
    monitor_thread.join(timeout=3)

    resource_summary = summarize(samples)

    try:
        payload = response.json()
    except Exception:
        payload = {"raw_response": response.text}

    backend_processing_time = float(payload.get("processing_time_seconds") or 0)

    # This is not pure upload latency. It is HTTP/network/request overhead estimate.
    http_overhead_estimate = round(
        max(0, total_response_time - backend_processing_time),
        2
    )

    avg_processing_fps = round(
        total_input_frames / backend_processing_time,
        2
    ) if backend_processing_time > 0 and total_input_frames > 0 else 0

    avg_processing_time_per_frame_ms = round(
        (backend_processing_time / total_input_frames) * 1000,
        2
    ) if backend_processing_time > 0 and total_input_frames > 0 else 0

    result = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "status_code": response.status_code,
        "run_id": payload.get("run_id", "N/A"),
        "similarity_score": payload.get("dtw_similarity_score", "N/A"),
        "ref_video": os.path.basename(args.ref),
        "user_video": os.path.basename(args.user),
        "ref_frames": ref_frames,
        "user_frames": user_frames,
        "total_input_frames": total_input_frames,
        "ref_fps": round(ref_fps, 2),
        "user_fps": round(user_fps, 2),
        "backend_processing_time_sec": backend_processing_time,
        "total_response_time_sec": total_response_time,
        "upload_http_overhead_estimate_sec": http_overhead_estimate,
        "avg_processing_fps": avg_processing_fps,
        "avg_processing_time_per_frame_ms": avg_processing_time_per_frame_ms,
        **resource_summary,
    }

    file_exists = os.path.exists(args.output)

    with open(args.output, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=result.keys())
        if not file_exists:
            writer.writeheader()
        writer.writerow(result)

    with open("latest_benchmark_response.json", "w") as f:
        json.dump(payload, f, indent=2)

    print("\nBenchmark Complete")
    print("------------------")
    for key, value in result.items():
        print(f"{key}: {value}")

    print(f"\nSaved CSV: {args.output}")
    print("Saved raw backend response: latest_benchmark_response.json")


if __name__ == "__main__":
    main()
