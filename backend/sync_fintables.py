"""
sync_fintables.py — One-Shot Fintables Sync
=============================================
Scrapes analyst recommendations from Fintables.com and saves to DB.
Delegates core logic to plugins/01_fintables_sync.py via subprocess
so the numeric prefix in filename is never a Python import issue.
"""
import sys
import os
import subprocess

backend_dir = os.path.dirname(os.path.abspath(__file__))
plugin_path = os.path.join(backend_dir, "plugins", "01_fintables_sync.py")


def sync_fintables():
    if not os.path.exists(plugin_path):
        print(f"[sync_fintables] Plugin not found: {plugin_path}")
        return
    subprocess.run([sys.executable, "-u", plugin_path], check=False, cwd=backend_dir)


if __name__ == "__main__":
    sync_fintables()
