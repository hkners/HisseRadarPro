import sys
import os
import subprocess
import glob

base_dir = os.path.dirname(os.path.abspath(__file__))
plugins_dir = os.path.join(base_dir, "plugins")

print(">>> Starting Modular Synchronization Engine...")

# Create plugins directory if it doesn't exist
if not os.path.exists(plugins_dir):
    os.makedirs(plugins_dir, exist_ok=True)
    print(f"Created plugins directory at {plugins_dir}")

# Find all python files in plugins directory
plugin_files = sorted(glob.glob(os.path.join(plugins_dir, "*.py")))

if not plugin_files:
    print(f">>> No scraper plugins found in {plugins_dir}.")
    print(">>> You can drop your custom scraper scripts (e.g. 02_hisseonerileri.py) into this folder.")
else:
    for plugin_path in plugin_files:
        plugin_name = os.path.basename(plugin_path)
        print(f"\n>>> Executing Plugin: {plugin_name}...")
        try:
            # Execute the plugin sequentially, piping output to the terminal directly
            subprocess.run([sys.executable, "-u", plugin_path], check=False)
            print(f">>> Plugin {plugin_name} completed.")
        except Exception as e:
            print(f">>> Error executing {plugin_name}: {e}")

print("\n>>> Synchronization completed successfully.")
