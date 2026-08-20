import sqlite3
import os
import time
import json

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "metrics.db")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # system_metrics table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS system_metrics (
            timestamp REAL PRIMARY KEY,
            cpu_percent REAL,
            memory_percent REAL,
            top_processes TEXT
        )
    """)
    # Add top_processes column if it doesn't exist (in case database was already created without it)
    try:
        cursor.execute("ALTER TABLE system_metrics ADD COLUMN top_processes TEXT")
    except sqlite3.OperationalError:
        pass # Column already exists
    
    # activity_logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            timestamp REAL PRIMARY KEY,
            message TEXT
        )
    """)
    conn.commit()
    conn.close()

def save_metric(cpu: float, memory: float, top_processes: list[dict] = None):
    now = time.time()
    top_proc_json = json.dumps(top_processes or [])
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR REPLACE INTO system_metrics (timestamp, cpu_percent, memory_percent, top_processes) VALUES (?, ?, ?, ?)",
            (now, cpu, memory, top_proc_json)
        )
        conn.commit()
    except Exception as e:
        print(f"Error saving metric: {e}")
    finally:
        conn.close()

def cleanup_metrics():
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
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT timestamp, cpu_percent, memory_percent, top_processes FROM system_metrics WHERE timestamp >= ? ORDER BY timestamp ASC",
            (cutoff,)
        )
        rows = cursor.fetchall()
        result = []
        for r in rows:
            try:
                top_p = json.loads(r["top_processes"]) if r["top_processes"] else []
            except Exception:
                top_p = []
            result.append({
                "timestamp": r["timestamp"],
                "cpu": r["cpu_percent"],
                "memory": r["memory_percent"],
                "top_processes": top_p
            })
        return result
    except Exception as e:
        print(f"Error fetching history: {e}")
        return []
    finally:
        conn.close()

def save_log(message: str):
    now = time.time()
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR REPLACE INTO activity_logs (timestamp, message) VALUES (?, ?)",
            (now, message)
        )
        conn.commit()
    except Exception as e:
        print(f"Error saving activity log: {e}")
    finally:
        conn.close()

def cleanup_logs():
    cutoff = time.time() - 90000
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM activity_logs WHERE timestamp < ?", (cutoff,))
        conn.commit()
    except Exception as e:
        print(f"Error cleaning activity logs: {e}")
    finally:
        conn.close()

def get_activity_logs() -> list[dict]:
    cutoff = time.time() - 90000
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT timestamp, message FROM activity_logs WHERE timestamp >= ? ORDER BY timestamp DESC",
            (cutoff,)
        )
        rows = cursor.fetchall()
        return [{"timestamp": r["timestamp"], "message": r["message"]} for r in rows]
    except Exception as e:
        print(f"Error fetching activity logs: {e}")
        return []
def clear_database():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM system_metrics")
        cursor.execute("DELETE FROM activity_logs")
        conn.commit()
    except Exception as e:
        print(f"Error clearing database: {e}")
    finally:
        conn.close()

