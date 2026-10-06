# # llm/watcher.py

# import os
# import time
# import threading
# from pathlib import Path

# from .indexer import rebuild_index
# from .validator import validate_index
# from .vector_store import load_vector_store


# WATCH_PATH = Path("data/base")
# POLL_INTERVAL = 2  # seconds


# class FileWatcher:
#     def __init__(self):
#         self._stop_flag = False
#         self._last_snapshot = self._snapshot()

#     def _snapshot(self):
#         """takes structure of files: {path: mtime}"""
#         snapshot = {}
#         for root, _, files in os.walk(WATCH_PATH):
#             for f in files:
#                 full = Path(root) / f
#                 snapshot[str(full)] = full.stat().st_mtime
#         return snapshot

#     def _has_changes(self):
#         """Checking, files were changed"""
#         new_snapshot = self._snapshot()

#         if new_snapshot != self._last_snapshot:
#             self._last_snapshot = new_snapshot
#             return True

#         return False

#     def start(self):
#         """run to watching in another stream"""
#         thread = threading.Thread(target=self._run, daemon=True)
#         thread.start()
#         print("[Watcher] Started watching:", WATCH_PATH)

#     def stop(self):
#         self._stop_flag = True

#     def _run(self):
#         while not self._stop_flag:
#             if self._has_changes():
#                 print("[Watcher] Change detected → rebuilding index...")

#                 try:
#                     rebuild_index()
#                     print("[Watcher] Index rebuilt")

#                     validate_index()
#                     print("[Watcher] Index validated")

#                     load_vector_store()
#                     print("[Watcher] Vector store updated")

#                 except Exception as e:
#                     print("[Watcher] ERROR:", e)

#             time.sleep(POLL_INTERVAL)
