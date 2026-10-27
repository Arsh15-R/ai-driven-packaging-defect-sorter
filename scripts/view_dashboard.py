"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: view_dashboard.py (Zero-Dependency Instant Web Dashboard)
Purpose: Launches an industrial Quality Assurance web dashboard in your browser
         using pure Python built-in standard libraries (no pip dependencies!).
         Visualizes defect rates, charts, and image snapshots in real-time.
=============================================================================
"""

import os
import sys
import csv
import json
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = 8501
CSV_LOG_PATH = Path("logs/defect_log.csv")
DEFECT_IMG_DIR = Path("logs/defect_images")


def generate_dashboard_html() -> str:
    """Parses defect_log.csv and builds a modern, responsive HTML5 QA dashboard."""
    total_checked = 0
    good_count = 0
    defect_count = 0
    defect_counts = {"dent": 0, "label_missing": 0, "seal_broken": 0, "wrong_print": 0}
    rows = []

    if CSV_LOG_PATH.exists():
        with open(CSV_LOG_PATH, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                rows.append(r)
                total_checked += 1
                decision = r.get("Decision", "").upper()
                defect = r.get("Defect_Type", "").lower()
                if decision == "DEFECTIVE":
                    defect_count += 1
                    if defect in defect_counts:
                        defect_counts[defect] += 1
                elif decision == "GOOD":
                    good_count += 1

    defect_rate = (defect_count / max(total_checked, 1)) * 100.0

    # Collect recent defect images
    recent_images = []
    if DEFECT_IMG_DIR.exists():
        for p in sorted(DEFECT_IMG_DIR.glob("*.jpg"), key=os.path.getmtime, reverse=True)[:8]:
            # Convert Windows backslashes to forward slashes for HTML img src
            web_path = str(p).replace("\\", "/")
            recent_images.append({"name": p.name, "url": f"/{web_path}"})

    # Prepare table HTML rows (latest first)
    table_rows_html = ""
    for r in reversed(rows[-15:]):
        decision = r.get("Decision", "")
        badge = '<span class="badge bg-success">PASS</span>' if decision == "GOOD" else '<span class="badge bg-danger">REJECT</span>'
        img_p = r.get("Image_Path", "")
        img_link = f'<a href="/{img_p.replace(chr(92), "/")}" target="_blank" class="btn btn-sm btn-outline-info">View Snapshot</a>' if img_p else "-"
        table_rows_html += f"""
        <tr>
            <td>{r.get('Timestamp', '')}</td>
            <td><strong>{r.get('Item_ID', '')}</strong></td>
            <td>{badge}</td>
            <td><code>{r.get('Defect_Type', '')}</code></td>
            <td>{r.get('Confidence', '')}</td>
            <td>{img_link}</td>
        </tr>
        """

    # Image gallery HTML
    gallery_html = ""
    for img in recent_images:
        gallery_html += f"""
        <div class="col-md-3 col-sm-6 mb-3">
            <div class="card bg-dark border-secondary text-white h-100">
                <img src="{img['url']}" class="card-img-top p-1" style="height: 180px; object-fit: contain; background: #111;" alt="{img['name']}">
                <div class="card-body p-2 text-center">
                    <small class="text-warning">{img['name']}</small>
                </div>
            </div>
        </div>
        """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="3">
    <title>Packaging Line Quality Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {{ background-color: #0f1217; color: #e1e7ec; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }}
        .metric-card {{ background-color: #1a1f28; border-radius: 10px; padding: 20px; border-left: 5px solid #00ADB5; }}
        .metric-value {{ font-size: 2.2rem; font-weight: bold; }}
        .card-custom {{ background-color: #1a1f28; border: 1px solid #2a3240; border-radius: 10px; }}
        table {{ color: #e1e7ec !important; }}
    </style>
</head>
<body class="p-4">
    <div class="container-fluid">
        <!-- Header -->
        <div class="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom border-secondary">
            <div>
                <h2>📦 AI-Driven Packaging Quality Dashboard</h2>
                <p class="text-secondary mb-0">Automated Conveyor Defect Inspection & Rejection System</p>
            </div>
            <div>
                <span class="badge bg-success p-2">● SYSTEM ACTIVE (Auto-Refresh 3s)</span>
                <a href="/logs/defect_log.csv" download class="btn btn-primary btn-sm ms-2">📥 Download CSV Log</a>
            </div>
        </div>

        <!-- Top KPI Metric Cards -->
        <div class="row g-3 mb-4">
            <div class="col-md-3">
                <div class="metric-card" style="border-left-color: #0d6efd;">
                    <div class="text-secondary small text-uppercase">Total Packages Checked</div>
                    <div class="metric-value text-primary">{total_checked:,}</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="metric-card" style="border-left-color: #198754;">
                    <div class="text-secondary small text-uppercase">Good Packages Passed</div>
                    <div class="metric-value text-success">{good_count:,}</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="metric-card" style="border-left-color: #dc3545;">
                    <div class="text-secondary small text-uppercase">Defective Rejected</div>
                    <div class="metric-value text-danger">{defect_count:,}</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="metric-card" style="border-left-color: {'#dc3545' if defect_rate > 2.0 else '#ffc107'};">
                    <div class="text-secondary small text-uppercase">Defect Rate</div>
                    <div class="metric-value {'text-danger' if defect_rate > 2.0 else 'text-warning'}">{defect_rate:.1f}%</div>
                </div>
            </div>
        </div>

        <!-- Visual Charts Row -->
        <div class="row g-3 mb-4">
            <div class="col-md-7">
                <div class="card card-custom p-3">
                    <h5 class="mb-3 text-info">Defect Breakdown by Category</h5>
                    <div style="height: 250px;">
                        <canvas id="barChart"></canvas>
                    </div>
                </div>
            </div>
            <div class="col-md-5">
                <div class="card card-custom p-3">
                    <h5 class="mb-3 text-info">Inspection Yield Ratio</h5>
                    <div style="height: 250px;">
                        <canvas id="pieChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Recent Defect Snapshots Gallery -->
        <div class="card card-custom p-3 mb-4">
            <h5 class="mb-3 text-info">📸 Recent Defective Packages (Audit Snapshots)</h5>
            <div class="row">
                {gallery_html if gallery_html else '<div class="text-muted p-3">No defect images recorded yet.</div>'}
            </div>
        </div>

        <!-- Inspection Traceability Table -->
        <div class="card card-custom p-3">
            <h5 class="mb-3 text-info">📋 Recent Conveyor Inspection Log</h5>
            <div class="table-responsive">
                <table class="table table-dark table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Package ID</th>
                            <th>Decision</th>
                            <th>Defect Type</th>
                            <th>Confidence</th>
                            <th>Audit Snapshot</th>
                        </tr>
                    </thead>
                    <tbody>
                        {table_rows_html if table_rows_html else '<tr><td colspan="6" class="text-center text-muted">No records found</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Chart.js Visualization Scripts -->
    <script>
        const barCtx = document.getElementById('barChart').getContext('2d');
        new Chart(barCtx, {{
            type: 'bar',
            data: {{
                labels: ['Dent', 'Label Missing', 'Seal Broken', 'Wrong Print'],
                datasets: [{{
                    label: 'Defect Count',
                    data: [{defect_counts['dent']}, {defect_counts['label_missing']}, {defect_counts['seal_broken']}, {defect_counts['wrong_print']}],
                    backgroundColor: ['#fd7e14', '#dc3545', '#d63384', '#0dcaf0'],
                    borderRadius: 5
                }}]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false,
                scales: {{ y: {{ beginAtZero: true, grid: {{ color: '#2a3240' }} }} }}
            }}
        }});

        const pieCtx = document.getElementById('pieChart').getContext('2d');
        new Chart(pieCtx, {{
            type: 'doughnut',
            data: {{
                labels: ['Good (Passed)', 'Defective (Rejected)'],
                datasets: [{{
                    data: [{good_count}, {defect_count}],
                    backgroundColor: ['#198754', '#dc3545']
                }}]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false
            }}
        }});
    </script>
</body>
</html>
"""
    return html


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ["/", "/index.html"]:
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(generate_dashboard_html().encode("utf-8"))
        else:
            # Serve local defect images and CSV logs
            super().do_GET()


def run_dashboard_server():
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, DashboardHandler)
    url = f"http://localhost:{PORT}"
    print("\n" + "=" * 65)
    print("    PACKAGING QUALITY ASSURANCE WEB DASHBOARD - RUNNING    ")
    print("=" * 65)
    print(f" Web Interface : {url}")
    print(" Press Ctrl+C in this terminal to stop the dashboard server.")
    print("=" * 65 + "\n")
    
    # Open browser automatically
    webbrowser.open(url)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Dashboard server stopped.")
        httpd.server_close()


if __name__ == "__main__":
    run_dashboard_server()
