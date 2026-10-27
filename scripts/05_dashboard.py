"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: 05_dashboard.py
Purpose: Modern Streamlit Web Dashboard for Quality Assurance Monitoring:
         - Real-time KPI Metric Cards (Total, Good, Defective, Defect Rate)
         - Defect Type Breakdown Visualizations
         - Live Defect Snapshot Image Gallery
         - Searchable CSV Quality Log & Export Tool
=============================================================================
"""

import os
import time
from pathlib import Path
import pandas as pd
import streamlit as st
import matplotlib.pyplot as plt
import seaborn as sns
from PIL import Image

# Page Configuration
st.set_page_config(
    page_title="Packaging Line AI Quality Dashboard",
    page_icon="📦",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Styling
st.markdown("""
<style>
    .metric-card {
        background-color: #1E222A;
        border-radius: 10px;
        padding: 15px;
        border-left: 5px solid #00ADB5;
    }
    .stMetric {
        background-color: #1E222A;
        border-radius: 8px;
        padding: 12px;
    }
</style>
""", unsafe_allow_html=True)

CSV_LOG_PATH = Path("logs/defect_log.csv")
DEFECT_IMG_DIR = Path("logs/defect_images")


def load_log_data() -> pd.DataFrame:
    """Loads and formats the CSV defect log."""
    if not CSV_LOG_PATH.exists():
        # Return empty template dataframe
        return pd.DataFrame(columns=[
            "Timestamp", "Item_ID", "Decision", "Defect_Type", "Confidence", "Image_Path"
        ])
    try:
        df = pd.read_csv(CSV_LOG_PATH)
        if not df.empty and "Timestamp" in df.columns:
            df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce")
        return df
    except Exception as e:
        st.error(f"Error reading log CSV: {e}")
        return pd.DataFrame()


# --- Sidebar Controls ---
st.sidebar.image("https://img.icons8.com/fluency/96/conveyor-belt.png", width=80)
st.sidebar.title("Packaging Sorter")
st.sidebar.markdown("**Hardware Setup**: Lenovo LOQ (RTX 3050) + Arduino Uno Pusher")
st.sidebar.markdown("---")

auto_refresh = st.sidebar.checkbox("Auto-refresh data (every 3s)", value=True)
refresh_interval = st.sidebar.slider("Refresh rate (sec)", min_value=1, max_value=10, value=3)

st.sidebar.markdown("---")
st.sidebar.subheader("Conveyor Thresholds")
conf_display = st.sidebar.slider("Decision Threshold (Conf)", min_value=0.20, max_value=0.90, value=0.50, step=0.05)
st.sidebar.info("Model: **YOLOv8s** (Packaging Line Weights)")

# --- Main Dashboard Header ---
col_header, col_status = st.columns([3, 1])
with col_header:
    st.title("📦 AI-Driven Packaging Quality Dashboard")
    st.caption("Automated Conveyor Defect Detection, Rejection & Traceability System")

with col_status:
    st.markdown("<br>", unsafe_allow_html=True)
    st.success("🟢 Conveyor AI Line: ACTIVE")

# Load Log
df = load_log_data()

# Calculate Metrics
total_checked = len(df)
if total_checked > 0:
    defective_df = df[df["Decision"] == "DEFECTIVE"]
    good_df = df[df["Decision"] == "GOOD"]
    defect_count = len(defective_df)
    good_count = len(good_df)
    defect_rate = (defect_count / total_checked) * 100.0
else:
    defective_df = pd.DataFrame()
    good_df = pd.DataFrame()
    defect_count = 0
    good_count = 0
    defect_rate = 0.0

# --- Top Metric KPI Cards ---
m1, m2, m3, m4 = st.columns(4)
m1.metric("📦 Total Inspected", f"{total_checked:,}", delta=f"+{total_checked} today")
m2.metric("✅ Good Packages", f"{good_count:,}", delta=f"{(good_count/max(total_checked,1))*100:.1f}% Yield")
m3.metric("❌ Defective Rejected", f"{defect_count:,}", delta=f"-{defect_count} Rejections", delta_color="inverse")
m4.metric("⚠️ Defect Rate", f"{defect_rate:.2f}%", delta="Target < 2.0%", delta_color="inverse" if defect_rate > 2.0 else "normal")

st.markdown("---")

# --- Tabs Layout ---
tab_analytics, tab_gallery, tab_raw_log = st.tabs(["📊 Quality Analytics", "📸 Defect Snapshot Gallery", "📋 Inspection Log Table"])

# TAB 1: Analytics & Charts
with tab_analytics:
    col_chart1, col_chart2 = st.columns(2)

    with col_chart1:
        st.subheader("Defect Class Distribution")
        if not defective_df.empty and "Defect_Type" in defective_df.columns:
            counts = defective_df["Defect_Type"].value_counts().reset_index()
            counts.columns = ["Defect Type", "Count"]

            fig, ax = plt.subplots(figsize=(6, 4))
            palette = sns.color_palette("mako", len(counts))
            sns.barplot(data=counts, x="Defect Type", y="Count", ax=ax, palette=palette)
            ax.set_ylabel("Quantity Detected")
            ax.set_xlabel("Defect Category")
            for p in ax.patches:
                ax.annotate(f"{int(p.get_height())}", (p.get_x() + p.get_width() / 2., p.get_height()),
                            ha='center', va='bottom', fontsize=10, xytext=(0, 3), textcoords='offset points')
            st.pyplot(fig)
        else:
            st.info("No defect occurrences logged yet. Run `04_realtime_detect.py` to inspect items.")

    with col_chart2:
        st.subheader("Defect vs Good Ratio")
        if total_checked > 0:
            fig_pie, ax_pie = plt.subplots(figsize=(5, 4))
            labels = ["Good (Passed)", "Defective (Rejected)"]
            sizes = [good_count, defect_count]
            colors = ["#2ecc71", "#e74c3c"]
            ax_pie.pie(sizes, labels=labels, autopct="%1.1f%%", startangle=90, colors=colors, explode=(0, 0.08))
            ax_pie.axis("equal")
            st.pyplot(fig_pie)
        else:
            st.info("Waiting for conveyor inspection data...")

# TAB 2: Image Gallery of Rejected Defects
with tab_gallery:
    st.subheader("Recent Defective Items (Stored for Audit)")
    if DEFECT_IMG_DIR.exists():
        defect_images = sorted(list(DEFECT_IMG_DIR.glob("*.jpg")), key=os.path.getmtime, reverse=True)[:8]
        if defect_images:
            cols = st.columns(4)
            for idx, img_p in enumerate(defect_images):
                with cols[idx % 4]:
                    img = Image.open(img_p)
                    st.image(img, caption=img_p.name, use_container_width=True)
        else:
            st.info("No defect snapshot images recorded yet.")
    else:
        st.info("Defect image folder not created yet.")

# TAB 3: Inspection Log Table & CSV Export
with tab_raw_log:
    st.subheader("Traceability & Audit Log")
    filter_col1, filter_col2 = st.columns([2, 1])

    with filter_col1:
        status_filter = st.selectbox("Filter by Decision", options=["ALL", "DEFECTIVE", "GOOD"])

    filtered_df = df.copy()
    if status_filter != "ALL" and not df.empty:
        filtered_df = df[df["Decision"] == status_filter]

    st.dataframe(filtered_df, use_container_width=True, height=350)

    if not df.empty:
        csv_bytes = df.to_csv(index=False).encode('utf-8')
        st.download_button(
            label="📥 Download Inspection Log (CSV)",
            data=csv_bytes,
            file_name="packaging_line_defect_log.csv",
            mime="text/csv"
        )

# Auto-refresh loop
if auto_refresh:
    time.sleep(refresh_interval)
    st.rerun()
