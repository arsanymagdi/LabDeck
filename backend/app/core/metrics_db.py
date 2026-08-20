import sqlite3
import os
import time

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "metrics.db")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_metrics (
            timestamp REAL PRIMARY KEY,
            cpu_percent REAL,
            memory_percent REAL
        )
    """)
    conn.commit()
    conn.close()

def save_metric(cpu: float, memory: float):
    now = time.time()
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR REPLACE INTO system_metrics (timestamp, cpu_percent, memory_percent) VALUES (?, ?, ?)",
            (now, cpu, memory)
        )
        conn.commit()
    except Exception as e:
        print(f"Error saving metric: {e}")
    finally:
        conn.close()

def cleanup_metrics():
    # Keep last 25 hours of data. 25 hours = 25 * 3600 seconds = 90000 seconds
    cutoff = time.time() - 90000
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM system_metrics WHERE timestamp < ?", (cutoff,))
        conn.commit()
    except Exception as e:
        print(f"Error cleaning metrics: {e}")
    finally:
        conn.close()

def get_history() -> list[dict]:
    cutoff = time.time() - 90000
    conn = sqlite3.connect(DB_FILE)
    # Return as dictionaries
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT timestamp, cpu_percent, memory_percent FROM system_metrics WHERE timestamp >= ? ORDER BY timestamp ASC",
            (cutoff,)
        )
        rows = cursor.fetchall()
        return [{"timestamp": r["timestamp"], "cpu": r["cpu_percent"], "memory": r["memory_percent"]} for r in rows]
    except Exception as e:
        print(f"Error fetching history: {e}")
        return []
    finally:
        conn.close()
