import csv
import time
import psutil
from datetime import datetime

OUTPUT_FILE = "backend_resource_metrics.csv"

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

with open(OUTPUT_FILE, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["timestamp", "cpu_percent", "memory_mb"])

    print("Monitoring Gunicorn backend. Press CTRL+C after analysis finishes.")

    try:
        while True:
            processes = get_gunicorn_processes()

            cpu_total = 0
            memory_total = 0

            for p in processes:
                try:
                    cpu_total += p.cpu_percent(interval=None)
                    memory_total += p.memory_info().rss / (1024 * 1024)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass

            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow([timestamp, round(cpu_total, 2), round(memory_total, 2)])
            f.flush()

            print(timestamp, "CPU:", round(cpu_total, 2), "%", "RAM:", round(memory_total, 2), "MB")
            time.sleep(1)

    except KeyboardInterrupt:
        print("Monitoring stopped.")
